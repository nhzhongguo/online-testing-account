# Version 2.0.1

新增：
- 支持 c2api3 导出的 `credentials.id_token` 账号导入。
- 增加 Windows NSIS 安装包与 Android Debug APK 发布产物。

优化：
- 修复 Vite 开发环境 CSP 拦截内联样式导致桌面界面无样式的问题。

修复：
- 修复 c2api3 账号被误判为不受支持凭据的问题。

# Version 2.0.0

新增：
- 统一版本元数据与版本同步校验。
- Electron 和 Android 的加密本地工作区，以及脱敏验证历史。
- SHA-256 凭据指纹与工作区原子写入回归测试。

优化：
- 浏览器运行时仅保留临时内存工作区，不再写入浏览器本地存储。
- 验证结果和审计导出包含受限、脱敏的历史事件。
- Android Keystore 加密存储、禁用应用备份，并修复 Android API 24 UTF-8 兼容性。

修复：
- 修复 32 位凭据哈希冲突造成的账号误合并。
- 修复 Electron 工作区替换失败可能损坏已保存数据的问题。
- 修复 Vitest 误收集原生版本测试与依赖测试的问题。
