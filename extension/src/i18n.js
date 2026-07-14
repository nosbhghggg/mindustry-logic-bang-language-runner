const vscode = require("vscode");

const MESSAGES = {
  "en": {
    "status.ready": "compiler ready",
    "status.notFound": "compiler not found, configure bang.compilerPath",
    "status.probing": "probing for compiler…",
    "status.autoSaveFailed": "auto-save failed — see Output (Bang Compiler)",
    "security.ignoreWorkspacePath": "[security] untrusted workspace, workspace-level bang.compilerPath ignored",
    "msg.openFileFirst": "open a file first",
    "msg.onlyMlog": "only .mlog files supported",
    "msg.noEmbeddedSource": "no embedded source data in this file",
    "msg.clipboardEmpty": "clipboard is empty",
    "msg.clipboardUnparsable": "cannot parse clipboard content, copy the >DATA: content",
    "msg.writeFailed": "failed to write output: {0}",
    "msg.compilingInProgress": "compiling in progress",
    "msg.compilerNotFound": "compiler not found, configure bang.compilerPath",
    "msg.decompileComplete": "decompile complete (not saved; Ctrl+S to keep)  {0}",
    "msg.previewOnly": "previewed (not saved; Ctrl+S to keep)  {0}",
    "msg.formatComplete": "format complete  {0}",
    "msg.copied": "copied  {0}",
    "msg.sourceRestored": "source restored ({0} lines)",
    "msg.sourceImported": "source imported ({0} lines)",
    "msg.compileFailed": "{0} failed — click \"Open Panel\" for details",
    "msg.compileFailedShort": "{0} failed: {1}",
    "msg.notBangCompiler": "selected file is not the Bang logic compiler: {0}",
    "msg.compilerSelected": "compiler selected: {0} (v{1})",
    "msg.compilerRunFailed": "failed to run: {0} — {1}",
    "dialog.chooseCompiler": "Choose",
    "action.openPanel": "Open Panel",
    "label.tagCode": "tag code",
    "label.compile": "compile",
    "label.decompile": "decompile",
    "label.format": "format",
    "label.viewTag": "view tag",
    "quickPick.placeholder": "select Bang action",
    "lineStat": "{0} lines -> {1} lines{2}",
  },
  "zh-cn": {
    "status.ready": "编译器就绪",
    "status.notFound": "未找到编译器，请配置 bang.compilerPath",
    "status.probing": "正在检测编译器…",
    "status.autoSaveFailed": "自动保存失败，请查看 Output 面板（Bang Compiler）",
    "security.ignoreWorkspacePath": "[security] 未信任工作区，已忽略工作区级 bang.compilerPath",
    "msg.openFileFirst": "请先打开一个文件",
    "msg.onlyMlog": "仅支持 .mlog 文件",
    "msg.noEmbeddedSource": "此文件中无嵌入的源码数据",
    "msg.clipboardEmpty": "剪贴板为空",
    "msg.clipboardUnparsable": "无法解析剪贴板内容，请复制 >DATA: 内容",
    "msg.writeFailed": "写入输出失败：{0}",
    "msg.compilingInProgress": "正在编译中",
    "msg.compilerNotFound": "未找到编译器，请配置 bang.compilerPath",
    "msg.decompileComplete": "反编译完成（未保存，Ctrl+S 保存）  {0}",
    "msg.previewOnly": "已预览（未保存，Ctrl+S 保存）  {0}",
    "msg.formatComplete": "格式化完成  {0}",
    "msg.copied": "已复制  {0}",
    "msg.sourceRestored": "源码已恢复（{0} 行）",
    "msg.sourceImported": "源码已导入（{0} 行）",
    "msg.compileFailed": "{0} 失败，点击「打开面板」查看详情",
    "msg.compileFailedShort": "{0} 失败：{1}",
    "msg.notBangCompiler": "所选文件不是 Bang 逻辑语言编译器：{0}",
    "msg.compilerSelected": "已选择编译器：{0}（v{1}）",
    "msg.compilerRunFailed": "运行失败：{0} — {1}",
    "dialog.chooseCompiler": "选择",
    "action.openPanel": "打开面板",
    "label.tagCode": "标签代码",
    "label.compile": "编译",
    "label.decompile": "反编译",
    "label.format": "格式化",
    "label.viewTag": "查看标签",
    "quickPick.placeholder": "选择 Bang 操作",
    "lineStat": "{0} 行 -> {1} 行{2}",
  },
};

function lang() {
  const l = (vscode.env.language || "en").toLowerCase();
  return l.startsWith("zh") ? "zh-cn" : "en";
}

function t(key, ...args) {
  const tbl = MESSAGES[lang()] || MESSAGES.en;
  let s = tbl[key] || MESSAGES.en[key] || key;
  for (let i = 0; i < args.length; i++) {
    s = s.replace(`{${i}}`, args[i]);
  }
  return s;
}

const ACTION_LABELS = {
  en: {
    "action.desc.cl":      "compile to .mlog and save the file",
    "action.desc.show":    "compile and preview in side bar",
    "action.desc.t":       "view intermediate code",
    "action.desc.copy":    "copy result to clipboard",
    "action.desc.r":       "restore Bang source from logic code",
    "action.desc.i":       "reindent logic code",
    "action.desc.import":  "restore from >DATA: marker",
    "action.desc.clip":    "parse compressed data from clipboard",
    "action.desc.selectCompiler": "pick the Bang compiler executable",
    "action.label.cl":     "compile and save (c+l)",
    "action.label.show":   "compile and preview",
    "action.label.t":      "view tag code (t)",
    "action.label.copy":   "compile and copy",
    "action.label.r":      "decompile to .mdtlbl",
    "action.label.i":      "format logic code",
    "action.label.import": "restore from embedded data",
    "action.label.clip":   "import from clipboard",
    "action.label.selectCompiler": "select compiler…",
  },
  "zh-cn": {
    "action.desc.cl":      "编译为 .mlog 并保存文件",
    "action.desc.show":    "编译并在侧边栏预览",
    "action.desc.t":       "查看中间代码",
    "action.desc.copy":    "复制结果到剪贴板",
    "action.desc.r":       "从逻辑代码恢复 Bang 源码",
    "action.desc.i":       "重新缩进逻辑代码",
    "action.desc.import":  "从 >DATA: 标记恢复",
    "action.desc.clip":    "从剪贴板解析压缩数据",
    "action.desc.selectCompiler": "选择 Bang 编译器可执行文件",
    "action.label.cl":     "编译并保存 (c+l)",
    "action.label.show":   "编译并预览",
    "action.label.t":      "查看标签代码 (t)",
    "action.label.copy":   "编译并复制",
    "action.label.r":      "反编译为 .mdtlbl",
    "action.label.i":      "格式化逻辑代码",
    "action.label.import": "从嵌入数据恢复",
    "action.label.clip":   "从剪贴板导入",
    "action.label.selectCompiler": "选择编译器…",
  },
};

function ta(key) {
  const tbl = ACTION_LABELS[lang()] || ACTION_LABELS.en;
  return tbl[key] || ACTION_LABELS.en[key] || key;
}

module.exports = { MESSAGES, ACTION_LABELS, lang, t, ta };
