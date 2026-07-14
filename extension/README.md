# Mindustry Logic Bang Language Runner

将 `.mdtlbl` 编译为 Mindustry 可导入的 `.mlog`，并支持反编译、格式化与源码嵌入恢复。

> 语法高亮 / 补全 / 诊断请配合官方 [mdtlbl](https://github.com/A4-Tacks/mindustry_logic_bang_lang) 使用；本扩展只负责编译侧。

## 依赖

需要 Bang 编译器可执行文件 `mindustry_logic_bang_lang`：

- 下载：[Releases](https://github.com/A4-Tacks/mindustry_logic_bang_lang/releases)
- 查找顺序：`bang.compilerPath` → 工作区根目录 → 系统 PATH
- 推荐：命令面板执行 **`Bang: 选择编译器…`**（会校验身份）

## 功能

| 命令 | 说明 |
|------|------|
| 编译并保存 | 生成并保存 `.mlog` |
| 编译并预览 | 侧栏预览，不自动写盘 |
| 编译并复制 | 结果写入剪贴板 |
| 查看标签代码 | 中间标签代码预览 |
| 反编译 | `.mlog` → `.mdtlbl` 预览 |
| 格式化 | 重新缩进 `.mlog` |
| 从嵌入数据恢复 | 从 `>DATA:` 还原源码 |
| 从剪贴板导入 | 解析剪贴板中的嵌入数据 |

源码嵌入：编译时可选将 `.mdtlbl` 经 Brotli + base32768 写入 `.mlog` 末尾，便于逆向恢复。

## 快捷入口

- 标题栏 Bang 按钮 / 右键 Bang 菜单
- 状态栏 Bang 按钮（就绪 / 未找到；成功绿字、失败红底）
- 快捷键：`Ctrl+F1`

保存 `.mdtlbl` 时默认自动编译（可关）。

## 配置

| 配置 | 默认 | 说明 |
|------|------|------|
| `bang.compilerPath` | `""` | 编译器路径 |
| `bang.autoCompile` | `true` | 保存时自动编译 |
| `bang.autoSave` | `true` | 自动编译时写 `.mlog` |
| `bang.embedSource` | `true` | 嵌入源码 |
| `bang.compileTimeout` | `3000` | 超时（毫秒） |

## 安全说明

未信任工作区会忽略工作区级编译器路径，且不扫描工作区根目录可执行文件。