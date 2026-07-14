const vscode = require("vscode");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const { t, ta } = require("./i18n");

const EXT_VERSION = require("../package.json").version;
const UNPACK_MAX_INPUT = 20 * 1024;
const UNPACK_MAX_OUTPUT = 30 * 1024;
const COMPILER_IDENTITY = /Mindustry logic extension meta-programming/;
const MAGIC = Buffer.from("\x00BANG\x00");
const CJK_BASE = 32768;
const CJK_OFFSET = 0x4E00;

// ---- State ----

let compiling, statusBtn, outputChannel;
let compilerReady = false, compilerPath, compilerVersion;
let autoCompileTimer = null, flashTimer = null, pendingAutoDoc = null;
let statusBtnVisible = false;

// ---- Helpers ----

const cfg = (key, def) => vscode.workspace.getConfiguration("bang").get(key, def);
const log = (...a) => outputChannel && outputChannel.appendLine(a.join(" "));

function runExe(bin, args, { timeout = 5000, stdin } = {}) {
  return new Promise((resolve, reject) => {
    const cp = execFile(bin, args, {
      encoding: "utf8", timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024,
    }, (e, o, eo) => e ? reject(Object.assign(e, { stdout: o, stderr: eo })) : resolve(o));
    if (stdin !== undefined) cp.stdin.end(stdin);
  });
}

function getDoc() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) { vscode.window.showErrorMessage(t("msg.openFileFirst")); return; }
  return ed.document;
}

function isMlog(doc) { return doc.uri.fsPath.toLowerCase().endsWith(".mlog"); }
function isMdtlbl(doc) {
  return doc.languageId === "mdtlbl" || doc.uri.fsPath.toLowerCase().endsWith(".mdtlbl");
}
// languageId covers untitled mdtlbl docs; extension covers saved files
function isCompilable(doc) { return isMlog(doc) || isMdtlbl(doc); }

function lineStat(src, res) {
  const s = src.split("\n").length, r = res.split("\n").length, d = r - s;
  return t("lineStat", s, r, d ? ` (${d > 0 ? "+" : ""}${d})` : "");
}

async function openSide(content, language, msg) {
  // Use an untitled URI with a real extension so Save As defaults to .mlog/.mdtlbl,
  // not .txt (plain { content, language } creates extensionless Untitled-N).
  const ext = language === "mdtlbl" ? "mdtlbl" : "mlog";
  const uri = vscode.Uri.parse(`untitled:preview-${Date.now()}.${ext}`);
  let doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, new vscode.Position(0, 0), content);
  await vscode.workspace.applyEdit(edit);
  if (doc.languageId !== language) {
    doc = await vscode.languages.setTextDocumentLanguage(doc, language);
  }
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  if (msg) showSuccess(msg);
}

// ---- Compiler resolution ----

function resolveCompiler() {
  const c = vscode.workspace.getConfiguration("bang");
  const configured = c.get("compilerPath", "");
  if (configured) {
    // Workspace-level path can be poisoned; reject in untrusted workspaces
    const isWs = c.inspect("compilerPath").workspaceValue !== undefined;
    if (isWs && !vscode.workspace.isTrusted) log(t("security.ignoreWorkspacePath"));
    else if (fs.existsSync(configured)) return configured;
  }
  const name = "mindustry_logic_bang_lang" + (process.platform === "win32" ? ".exe" : "");
  if (vscode.workspace.isTrusted) {
    for (const f of vscode.workspace.workspaceFolders || []) {
      const p = path.join(f.uri.fsPath, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return name;
}

function setCompiler(p, version) {
  compilerPath = p;
  compilerReady = true;
  compilerVersion = version;
  restoreStatusBaseline();
}

async function probeCompiler() {
  compilerPath = resolveCompiler();
  compilerReady = false;
  compilerVersion = null;
  try {
    const stdout = await runExe(compilerPath, ["-h"]);
    if (COMPILER_IDENTITY.test(stdout)) {
      compilerReady = true;
      const m = stdout.match(/Version:\s*(\S+)/);
      compilerVersion = m ? m[1] : null;
    } else {
      log(`[probe] not the Bang compiler: ${compilerPath}`);
    }
  } catch (e) {
    log(e && e.code === "ENOENT"
      ? `[probe] compiler not found: ${compilerPath}`
      : `[probe] failed to run ${compilerPath}: ${e && e.message}`);
  }
  restoreStatusBaseline();
}

async function selectCompiler() {
  const filters = process.platform === "win32"
    ? [{ name: "Executable", extensions: ["exe"] }] : undefined;
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
    openLabel: t("dialog.chooseCompiler"), filters,
  });
  if (!uris || !uris.length) return;
  const p = uris[0].fsPath;
  try {
    const stdout = await runExe(p, ["-h"]);
    if (!COMPILER_IDENTITY.test(stdout)) {
      return vscode.window.showErrorMessage(t("msg.notBangCompiler", p));
    }
    const m = stdout.match(/Version:\s*(\S+)/);
    await vscode.workspace.getConfiguration("bang")
      .update("compilerPath", p, vscode.ConfigurationTarget.Global);
    setCompiler(p, m ? m[1] : null);
    vscode.window.showInformationMessage(t("msg.compilerSelected", p, (m && m[1]) || "?"));
  } catch (e) {
    vscode.window.showErrorMessage(t("msg.compilerRunFailed", p, (e && e.message) || String(e)));
  }
}

// ---- Pack / embed / extract (Brotli -> base32768 / CJK) ----

function _baseEncode(buf) {
  let bits = 0, bitCount = 0, s = "";
  for (let i = 0; i < buf.length; i++) {
    bits = (bits << 8) | buf[i];
    bitCount += 8;
    while (bitCount >= 15) {
      bitCount -= 15;
      s += String.fromCharCode(CJK_OFFSET + ((bits >>> bitCount) & 0x7FFF));
    }
  }
  if (bitCount > 0) s += String.fromCharCode(CJK_OFFSET + ((bits << (15 - bitCount)) & 0x7FFF));
  return s;
}

function _baseDecode(s) {
  let bits = 0, bitCount = 0;
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    const idx = s.charCodeAt(i) - CJK_OFFSET;
    if (idx < 0 || idx >= CJK_BASE) continue;
    bits = (bits << 15) | idx;
    bitCount += 15;
    while (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >>> bitCount) & 0xFF);
    }
  }
  return Buffer.from(bytes);
}

function packSource(src) {
  const raw = Buffer.concat([MAGIC, Buffer.from(src, "utf8")]);
  const brotlied = zlib.brotliCompressSync(raw, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  const encoded = _baseEncode(brotlied);
  return encoded.length > UNPACK_MAX_INPUT ? null : encoded;
}

function unpackSource(data) {
  if (typeof data !== "string" || data.length > UNPACK_MAX_INPUT) throw new Error("input too large");
  const buf = _baseDecode(data);
  const out = zlib.brotliDecompressSync(buf, { maxOutputLength: UNPACK_MAX_OUTPUT });
  if (out.length > UNPACK_MAX_OUTPUT) throw new Error("output too large");
  if (!out.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("bad magic");
  return out.subarray(MAGIC.length).toString("utf8");
}

function embedSource(compiled, src) {
  const data = packSource(src);
  if (!data) {
    log(`[embed] source too large, skipping embed (${src.length} bytes)`);
    return compiled;
  }
  const ver = `MDTBL-R v${EXT_VERSION}`;
  const lines = [
    `print ">DATE:${new Date().toISOString().slice(0, 10)}"`,
    `print "${compilerVersion ? `${ver} | Bang v${compilerVersion}` : ver}"`,
    `print ">DATA:${data}"`,
  ];
  const mt = "\n" + lines.join("\n");
  const trimmed = compiled.trimEnd();
  return trimmed.endsWith("\nend") || trimmed === "end" ? compiled + mt : compiled + "\nend" + mt;
}

function extractSource(mlog) {
  const lines = mlog.split("\n");
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
    const m = lines[i].replace(/\r$/, "").match(/^print ">(.+)"/);
    if (!m) continue;
    const v = m[1], k = v.split(":")[0], val = v.slice(v.indexOf(":") + 1);
    if (k === "DATA") {
      try { return unpackSource(val); } catch { return null; }
    }
  }
  return null;
}

function buildOutput(raw, doc) {
  return cfg("embedSource", true) ? embedSource(raw, doc.getText()) : raw;
}

// ---- Status bar ----

function restoreStatusBaseline() {
  if (!statusBtn) return;
  statusBtn.text = compilerReady ? "$(debug-start) Bang" : "$(warning) Bang";
  statusBtn.tooltip = compilerReady ? t("status.ready") : t("status.notFound");
  statusBtn.backgroundColor = undefined;
  statusBtn.color = undefined;
}

function endFlash() {
  if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
  if (!statusBtn) return;
  if (statusBtnVisible) restoreStatusBaseline();
  else statusBtn.hide();
}

function flashStatus(kind, msg) {
  if (!statusBtn) return;
  endFlash(); // resolve any in-flight flash first
  // Temporarily show button on non-target file types so the flash is visible
  if (!statusBtnVisible) statusBtn.show();
  const err = kind === "error";
  statusBtn.text = err ? "$(error) Bang" : "$(check) Bang";
  statusBtn.tooltip = msg || t("status.ready");
  // backgroundColor only supports error/warning (no green). Success uses green foreground.
  statusBtn.backgroundColor = err
    ? new vscode.ThemeColor("statusBarItem.errorBackground")
    : undefined;
  statusBtn.color = err ? undefined : new vscode.ThemeColor("charts.green");
  flashTimer = setTimeout(endFlash, 4000);
}

function showSuccess(msg) {
  flashStatus("ok", msg);
  vscode.window.setStatusBarMessage(`$(check) ${msg}`, 4000);
}

// ---- Activate / UI ----

function activate(ctx) {
  outputChannel = vscode.window.createOutputChannel("Bang Compiler");
  statusBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBtn.command = "bang.actions";
  statusBtn.text = "$(sync~spin) Bang";
  statusBtn.tooltip = t("status.probing");
  probeCompiler();

  const cmds = {
    "bang.compile":             () => compileToFile("cl", false, true),
    "bang.compileAndShow":      () => compileToFile("cl", true, false),
    "bang.compileViewTag":      () => viewCompile("t"),
    "bang.copyToClipboard":     copyResult,
    "bang.decompile":           decompileFile,
    "bang.format":              formatFile,
    "bang.actions":             showBangActions,
    "bang.importFromMlog":      importFromMlog,
    "bang.importFromClipboard": importFromClipboard,
    "bang.selectCompiler":      selectCompiler,
  };
  ctx.subscriptions.push(
    outputChannel, statusBtn,
    ...Object.entries(cmds).map(([id, fn]) => vscode.commands.registerCommand(id, fn)),
    vscode.workspace.onDidSaveTextDocument(autoCompile),
    vscode.window.onDidChangeActiveTextEditor(updateUI),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("bang")) probeCompiler();
    }),
  );
  updateUI(vscode.window.activeTextEditor);
}

function updateUI(ed) {
  const show = !!(ed && (ed.document.languageId === "mdtlbl"
    || ed.document.uri.fsPath.toLowerCase().endsWith(".mlog")));
  statusBtnVisible = show;
  show ? statusBtn.show() : statusBtn.hide();
}

async function autoCompile(doc) {
  if (compiling) { pendingAutoDoc = doc; return; }
  if (!cfg("autoCompile", true) || doc.languageId !== "mdtlbl") return;
  if (autoCompileTimer) clearTimeout(autoCompileTimer);
  autoCompileTimer = setTimeout(async () => {
    autoCompileTimer = null;
    const raw = await runCompile(doc, "cl", true);
    if (!raw) return;
    if (cfg("autoSave", true)) {
      const outPath = doc.uri.fsPath.replace(/\.mdtlbl$/i, ".mlog");
      try { fs.writeFileSync(outPath, buildOutput(raw, doc), "utf8"); }
      catch (e) {
        log(`[autoSave failed] ${outPath}\n  ${e.message}`);
        return flashStatus("error", t("status.autoSaveFailed"));
      }
    }
    showSuccess(lineStat(doc.getText(), raw));
  }, 300);
}

// ---- Commands ----

async function runOnDoc(mode, { requireMlog = false } = {}, fn) {
  const doc = getDoc(); if (!doc) return;
  if (requireMlog && !isMlog(doc)) {
    vscode.window.showErrorMessage(t("msg.onlyMlog"));
    return;
  }
  const raw = await runCompile(doc, mode, false); if (!raw) return;
  return await fn(raw, doc);
}

async function compileToFile(mode, show, save) {
  return runOnDoc(mode, {}, async (raw, doc) => {
    const output = buildOutput(raw, doc);
    const untitled = doc.uri.scheme === "untitled";
    if (save && !untitled) {
      const outPath = doc.uri.fsPath.replace(/\.mdtlbl$/i, ".mlog");
      try { fs.writeFileSync(outPath, output, "utf8"); }
      catch (e) { return vscode.window.showErrorMessage(t("msg.writeFailed", e.message)); }
      showSuccess(`${path.basename(outPath)}  ${lineStat(doc.getText(), raw)}`);
    }
    // save+show both set: still open preview (do not early-return after save)
    if (show || untitled) {
      return openSide(output, "mlog",
        (!save || untitled) ? t("msg.previewOnly", lineStat(doc.getText(), raw)) : null);
    }
  });
}

async function viewCompile(mode) {
  return runOnDoc(mode, {}, (raw, doc) =>
    // Preview language depends on mode: cl/t emit mlog assembly, r emits
    // Bang source (mdtlbl). Default to mlog for any other intermediate output.
    openSide(raw, mode === "r" ? "mdtlbl" : "mlog", `${t("label.tagCode")}  ${lineStat(doc.getText(), raw)}`));
}

async function copyResult() {
  return runOnDoc("cl", {}, async (raw, doc) => {
    await vscode.env.clipboard.writeText(buildOutput(raw, doc));
    showSuccess(t("msg.copied", lineStat(doc.getText(), raw)));
  });
}

async function decompileFile() {
  return runOnDoc("r", { requireMlog: true }, (result, doc) =>
    openSide(result, "mdtlbl", t("msg.decompileComplete", lineStat(doc.getText(), result))));
}

async function formatFile() {
  return runOnDoc("i", { requireMlog: true }, async (result, doc) => {
    const full = doc.getText();
    const e = new vscode.WorkspaceEdit();
    e.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(full.length)), result);
    await vscode.workspace.applyEdit(e);
    showSuccess(t("msg.formatComplete", lineStat(full, result)));
  });
}

async function importFromMlog() {
  const doc = getDoc(); if (!doc) return;
  if (!isMlog(doc)) return vscode.window.showErrorMessage(t("msg.onlyMlog"));
  const src = extractSource(doc.getText());
  if (!src) return vscode.window.showErrorMessage(t("msg.noEmbeddedSource"));
  await openSide(src, "mdtlbl", t("msg.sourceRestored", src.split("\n").length));
}

async function importFromClipboard() {
  const text = (await vscode.env.clipboard.readText()).trim();
  if (!text) return vscode.window.showErrorMessage(t("msg.clipboardEmpty"));
  let src = extractSource(text);
  if (!src) { try { src = unpackSource(text); } catch {} }
  if (!src) return vscode.window.showErrorMessage(t("msg.clipboardUnparsable"));
  await openSide(src, "mdtlbl", t("msg.sourceImported", src.split("\n").length));
}

// ---- Action menu ----

const ACTIONS = {
  cl:     { icon: "$(debug-start)",  desc: "action.desc.cl",     fn: () => compileToFile("cl", false, true) },
  show:   { icon: "$(eye)",          desc: "action.desc.show",   fn: () => compileToFile("cl", true, false) },
  t:      { icon: "$(list-tree)",    desc: "action.desc.t",      fn: () => viewCompile("t") },
  copy:   { icon: "$(copy)",         desc: "action.desc.copy",   fn: copyResult },
  r:      { icon: "$(arrow-left)",   desc: "action.desc.r",      fn: decompileFile },
  i:      { icon: "$(whole-word)",   desc: "action.desc.i",      fn: formatFile },
  import: { icon: "$(search)",       desc: "action.desc.import", fn: importFromMlog },
  clip:   { icon: "$(paste)",        desc: "action.desc.clip",   fn: importFromClipboard },
};

function actionPick(k) {
  const a = ACTIONS[k];
  return { label: `${a.icon} ${ta("action.label." + k)}`, description: ta(a.desc), fn: a.fn };
}

async function showBangActions() {
  const selectItem = {
    label: "$(file-binary) " + t("action.label.selectCompiler"),
    description: t("action.desc.selectCompiler"),
    fn: selectCompiler,
  };
  const ed = vscode.window.activeTextEditor;
  const keys = !ed ? ["clip"]
    : isMdtlbl(ed.document) ? ["cl", "show", "t", "copy", "clip"]
    : isMlog(ed.document) ? ["r", "i", "import", "clip"]
    : ["clip"];
  const pick = await vscode.window.showQuickPick(
    [...keys.map(actionPick), selectItem],
    { placeHolder: t("quickPick.placeholder") },
  );
  if (pick) await pick.fn();
}

// ---- Compile core ----

async function runCompile(doc, mode, silent) {
  if (!isCompilable(doc)) return;
  const src = doc.getText();
  if (!src.trim()) return;
  if (compiling) {
    if (!silent) vscode.window.showWarningMessage(t("msg.compilingInProgress"));
    return;
  }
  if (!compilerReady) {
    await probeCompiler();
    if (!compilerReady) {
      if (!silent) vscode.window.showErrorMessage(t("msg.compilerNotFound"));
      return;
    }
  }
  compiling = true;
  const timeout = cfg("compileTimeout", 3000);
  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "Bang" },
      () => runExe(compilerPath, [mode], { timeout, stdin: src }),
    );
    log(`[success] ${path.basename(doc.uri.fsPath)} (${mode})  ${lineStat(src, result)}`);
    return result;
  } catch (err) {
    return showError(doc, err, silent, mode);
  } finally {
    compiling = false;
    if (pendingAutoDoc) {
      const d = pendingAutoDoc;
      pendingAutoDoc = null;
      autoCompile(d);
    }
  }
}

function showError(doc, err, silent, mode) {
  const modeLabel = ({
    cl: t("label.compile"), r: t("label.decompile"),
    i: t("label.format"), t: t("label.viewTag"),
  })[mode] || t("label.compile");
  if (err && err.code === "ENOENT") probeCompiler();
  const raw = ((err && (err.stderr || err.stdout || err.message)) || String(err || ""))
    .replace(/\u001b\[[\d;]*m/g, "").trim() || modeLabel;
  log(`[${modeLabel} failed] ${path.basename(doc.uri.fsPath)}`);
  log(raw);
  if (!silent) {
    vscode.window.showErrorMessage(t("msg.compileFailed", modeLabel), t("action.openPanel"))
      .then(act => { if (act === t("action.openPanel")) outputChannel.show(); });
  } else {
    flashStatus("error", t("msg.compileFailedShort", modeLabel, raw.split("\n")[0].slice(0, 80)));
  }
  // Diagnostics are owned by bangls (mdtlbl LSP); this extension only logs.
}

function deactivate() {
  if (autoCompileTimer) clearTimeout(autoCompileTimer);
  endFlash();
  pendingAutoDoc = null;
}

module.exports = { activate, deactivate };
