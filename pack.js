const JSZip = require("jszip");
const fs = require("fs");
const path = require("path");

const buildDir = __dirname;
const outFile = path.resolve(buildDir, "..", "mdtlbl-r-0.1.0.vsix");
const zip = new JSZip();

zip.file("[Content_Types].xml", fs.readFileSync(path.join(buildDir, "[Content_Types].xml")));
zip.file("extension.vsixmanifest", fs.readFileSync(path.join(buildDir, "extension.vsixmanifest")));

// 只打包 extension 目录下的文件，排除 node_modules
function addDir(dirPath, zipPath) {
  for (const name of fs.readdirSync(dirPath)) {
    if (name === "node_modules" || name === ".cache") continue;
    const full = path.join(dirPath, name);
    const rel = zipPath ? zipPath + "/" + name : name;
    if (fs.statSync(full).isDirectory()) addDir(full, rel);
    else zip.file(rel, fs.readFileSync(full));
  }
}
addDir(path.join(buildDir, "extension"), "extension");

zip.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE", compressionOptions: { level: 9 } })
  .pipe(fs.createWriteStream(outFile))
  .on("finish", () => console.log("vsix created:", outFile, "(" + (fs.statSync(outFile).size / 1024).toFixed(1) + " KB)"))
  .on("error", e => console.error("Error:", e));
