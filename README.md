# Mindustry Logic Bang Language Runner

VS Code 扩展：把 Mindustry Logic Bang Language（`.mdtlbl`）编译成游戏可导入的 `.mlog`，并提供反编译、格式化、源码嵌入与恢复。

| 扩展 | 职责 |
|------|------|
| [mdtlbl](https://github.com/A4-Tacks/mindustry_logic_bang_lang)（官方） | 语法高亮、补全、诊断 |
| **本扩展（mdtlbl-r）** | 编译 / 反编译 / 格式化 / 源码嵌入 |

## 安装

### 从 VSIX

1. 下载 Release 中的 `.vsix`
2. VS Code：`Extensions` → `…` → `Install from VSIX…`

### 从源码打包

```bash
# 在仓库根目录下
npm install
node pack.js
```

会在上一级目录生成 `mdtlbl-r-0.1.0.vsix`，再用 VS Code 的 **Install from VSIX** 安装。

## 依赖

需要本机已安装 Bang 编译器：

- 下载：[mindustry_logic_bang_lang Releases](https://github.com/A4-Tacks/mindustry_logic_bang_lang/releases)
- 取可执行文件 `mindustry_logic_bang_lang`（Windows 为 `.exe`）
- 本扩展不需要 `bangls` / `mlog-decompiler`

查找顺序：

1. `bang.compilerPath`
2. 当前工作区根目录
3. 系统 `PATH`

推荐在命令面板执行 **`Bang: 选择编译器…`**，插件会用 `-h` 校验身份后再写入配置。

## 功能概览

- **编译**：保存 `.mlog`、侧栏预览、复制到剪贴板、查看标签代码
- **逆向**：反编译、从 `>DATA:` 恢复源码、从剪贴板导入
- **格式化**：重新缩进 `.mlog`
- **自动编译**：保存 `.mdtlbl` 时默认自动编译（可关）
- **源码嵌入**：Brotli + base32768，写入 `.mlog` 末尾

入口：标题栏按钮、右键菜单、状态栏 Bang、快捷键 `Ctrl+F1`。

## 配置

| 配置 | 默认 | 说明 |
|------|------|------|
| `bang.compilerPath` | `""` | 编译器路径 |
| `bang.autoCompile` | `true` | 保存时自动编译 |
| `bang.autoSave` | `true` | 自动编译时写盘 |
| `bang.embedSource` | `true` | 嵌入源码 |
| `bang.compileTimeout` | `3000` | 超时（毫秒） |

## 安全

- 使用 `execFile` 调用编译器，不经 shell
- 未信任工作区：忽略工作区级 `compilerPath`，不扫描工作区根目录可执行文件
- 嵌入数据解包有大小上限与 magic 校验

## 目录结构

```text
mdtlbl-r/
├── README.md                 # 本仓库说明
├── pack.js                   # 打包为 .vsix
├── package.json              # 打包依赖（jszip）
└── extension/                # VS Code 扩展本体
    ├── package.json
    ├── README.md             # 扩展市场 / 安装页简介
    └── src/
        ├── extension.js
        └── i18n.js
```

## 致谢

- Bang 语言与编译器：[A4-Tacks/mindustry_logic_bang_lang](https://github.com/A4-Tacks/mindustry_logic_bang_lang)
