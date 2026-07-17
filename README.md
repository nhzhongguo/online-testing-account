<p align="center">
  <img src="public/app-icon.png" width="112" alt="Online testing account icon">
</p>

<h1 align="center">Online testing account</h1>

<p align="center">
  Windows / Android 账号成活、Codex 额度检测与 Android 局域网 API 网关<br>
  作者：豫晨
</p>

<p align="center">
  <a href="README.md">中文</a> · <a href="README.en.md">English</a> ·
  <a href="https://github.com/nhzhongguo/online-testing-account/releases">Releases</a>
</p>

> [!IMPORTANT]
> 在线验证和“测试连接”都会向实际上游发送最小请求，并可能消耗少量额度。只导入、验证和转发你自己拥有或被明确授权管理的账号与 API Key。

## 目录

- [功能概览](#功能概览)
- [下载与安装](#下载与安装)
- [账号验证](#账号验证)
- [Android 局域网 API](#android-局域网-api)
- [Codex++ 配置](#codex-配置)
- [代理与 LAN 排障](#代理与-lan-排障)
- [账号格式与状态](#账号格式与状态)
- [隐私与安全](#隐私与安全)
- [本地开发](#本地开发)

## 功能概览

### 账号检测

- 使用最小化实际上游请求判断账号状态，不依赖 JSON 中的过期时间做本地猜测。
- 账号严格串行验证，同一时间只有 1 个请求；支持暂停、继续和取消。
- OAuth 账号可显示 Codex 5 小时和周期额度、剩余百分比及重置时间。
- 出口 IP 检测只提供建议，不会阻止验证。测试 OpenAI、Codex 等外国模型时仍建议使用国外代理。
- 支持文件、粘贴 JSON，以及 Windows 递归文件夹导入；支持搜索、分页、精确删除 401 凭据和 sub2api JSON 导出。

### Android 局域网 API

- 将 Android 手机变成带配对密钥的 OpenAI 兼容局域网地址。
- 仅开放 `/v1/models`、`/v1/chat/completions` 和 `/v1/responses`。
- 导入账号模式支持多账号轮询；某个兼容上游失败时自动尝试下一个账号。
- 可添加自定义 API 供应商，从其 `/v1/models` 获取模型并选择转发模型。
- 自定义供应商与导入账号池互斥，且同一时间最多启用一个自定义供应商。
- “测试连接”会先获取模型，再随机选择可用文本模型发送最小请求，并显示耗时、实际命中的上游和响应摘要。
- 服务运行在 Android 前台通知中；关闭服务后，本次配对密钥立即失效。

> [!WARNING]
> **VPN 与 LAN API 不能在当前发布版本中同时使用。** 测试 OpenAI、Codex 等国外模型的账号额度时，在实际发起测试的设备上开启所需 VPN/代理；需要手机将 LAN API 转发给电脑时，手机和电脑都必须关闭全部 VPN、代理客户端和 Windows 系统代理。否则可能出现 `HTTP 502`、超时或获取模型失败。详见 [LAN API 与 VPN 排障说明](docs/troubleshooting-lan-api-502.md)。

## 下载与安装

请从 [GitHub Releases](https://github.com/nhzhongguo/online-testing-account/releases) 下载当前版本。

### Windows

1. 下载 `Online testing account Setup 0.8.4.exe`。
2. 运行安装程序，可自定义安装目录。
3. 如果 SmartScreen 提示未知发布者，请先核对 Release 中的 SHA-256。当前开源版本未使用商业代码签名证书。

### Android

1. 下载 `online-testing-account-v0.8.4-android.apk`。
2. 允许浏览器或文件管理器安装未知来源应用。
3. 安装 APK。支持 Android 7.0（API 24）及以上版本。
4. 首次开启 LAN API 时，允许前台服务通知权限，便于确认服务仍在运行。

Windows 安装包和 Android APK 均由本仓库源码构建。iOS 需要 macOS 和 Apple 签名环境，当前不提供。

## 账号验证

1. 导入文件夹、一个或多个 JSON 文件，或直接粘贴 JSON。
2. 用搜索和状态筛选确认导入结果。
3. 点击“在线验证”。应用会检测出口 IP 并显示网络建议，但不会因地区阻止验证。
4. 选择“本批 25 个”或“全部待验证账号”。两种范围都严格串行。
5. 运行中可暂停、继续或取消；当前请求会先完成，已完成结果会保留。
6. 点击账号查看 HTTP 结论、额度和重置时间。
7. “删除失效”只删除 HTTP 401 或明确失效的凭据，不会删除限流、无权限、网络失败或未验证账号。
8. “导出剩余”生成可再次导入的 sub2api JSON；Android 会打开系统分享/保存面板。

## Android 局域网 API

### 两种上游模式

LAN API 使用以下两种互斥模式之一：

| 模式 | 行为 | 失败处理 |
| --- | --- | --- |
| 导入账号池 | 可启用多个 OAuth 或 API Key 账号；请求从账号池轮询 | 当前兼容账号返回错误或连接失败时，自动尝试下一个账号 |
| 自定义供应商 | 同一时间只启用一个供应商；导入账号暂时不参与转发 | 不会回退到账号池或另一个供应商 |

启用自定义供应商后，账号开关会暂时不可用；关闭该供应商后，之前保存的账号启用状态会恢复。要切换到另一个供应商，必须先关闭当前供应商。

### 添加自定义 API 供应商

1. 在 Android 的账号列表中点击“自定义 API 供应商”。
2. 填写供应商名称、Base URL、API Key 和上游协议。
3. 点击“获取模型”。如果 Base URL 以 `/v1` 结尾，应用请求 `BASE_URL/models`；否则请求 `BASE_URL/v1/models`。
4. 从返回列表选择模型。应用会优先选择看起来可用于文本请求的模型，也允许手动填写。
5. 勾选“设为当前唯一 API 供应商”并保存。若已有供应商启用，请先关闭它。

API Key 输入框接受裸 Key；粘贴 `Bearer xxx` 时应用会去掉 `Bearer` 前缀。请务必确认 Base URL 属于你信任的供应商，因为 Key 会发送到该地址。

### 开启服务

1. 进入手机底部的“局域网 API”页面。
2. 点击“可用上游”，确认要参与转发的账号，或确认唯一启用的自定义供应商。
3. 服务未运行时可设置端口，默认是 `8787`。
4. 点击“开启 API 服务”。应用会显示：
   - Base URL：`http://手机局域网IP:端口/v1`
   - 配对密钥：`sk-phone-...`
5. 保存这两个值。Android 通知栏应持续显示 LAN API 正在运行。

运行期间修改账号或供应商开关会热更新上游池，不需要更换端口或配对密钥。如果关闭最后一个可用上游，服务会自动停止。

> [!NOTE]
> 手机页面复制配对密钥时可能显示为 `Bearer sk-phone-...`。客户端的 **Key 字段只填 `sk-phone-...`**；只有手工发送 HTTP 请求时，才在 `Authorization` 请求头中写 `Bearer sk-phone-...`。

### 账号轮询与失败切换

- 账号池内的请求会轮换起始账号，避免始终使用同一个凭据。
- 首个账号连接失败或返回上游错误时，代理会按池顺序尝试下一个兼容账号。
- 客户端请求的协议必须得到账号支持。Codex OAuth 主要使用 Responses API；OpenAI API Key 可用于其账号实际支持的接口。
- 可在“可用上游”中单独关闭账号。要验证某个账号，可暂时只保留该账号，再执行“测试连接”。
- 单次测试成功只证明本次实际路由成功；要观察轮询，可重复测试或发送多次真实请求，并结合返回的上游信息检查。

### 获取模型与测试连接

服务运行后点击“测试连接”：

1. 应用先从当前上游获取模型；无法提供模型列表的 Codex 账号或固定模型供应商会使用其配置模型回退。
2. 过滤明显的图片、音频、Embedding 等非文本模型。
3. 随机选择一个文本模型，通过手机自己的 LAN 代理路径发送最小请求。
4. 如果模型明确不可用，最多再随机尝试其他已发现模型，总计不超过 3 个模型。
5. 页面显示可用模型、最终测试模型、协议、实际命中的上游、耗时和响应或错误摘要。

该测试会产生真实请求并可能消耗少量额度。它同时验证模型发现、配对认证、手机本地代理路由和上游连接，不等同于从电脑验证路由器的入站 LAN 连通性。

## Codex++ 配置

以下步骤适用于 [BigPizzaV3/CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus) 的自定义供应商配置。开始前请关闭手机和电脑的全部 VPN、代理客户端和 Windows 系统代理；手机与电脑必须位于可互访的同一局域网。

1. 在手机中开启 LAN API，并复制页面显示的地址与配对密钥。
2. 在 Codex++ 中新增自定义供应商。
3. 按下表填写：

| Codex++ 字段 | 填写内容 |
| --- | --- |
| Base URL | 无线：`http://手机局域网IP:8787/v1`；USB：`http://127.0.0.1:8787/v1` |
| Key / API Key | 只填 `sk-phone-...` |
| API 类型 / 协议 | `Chat Completions` |
| Model | 填写手机“测试连接”或“获取模型”显示的一个模型 ID |

不要在 Key 字段填写 `Bearer sk-phone-...`，不要填写手机上游账号的 access token，也不要填写自定义供应商的原始 Key。

使用 `Chat Completions` 时，手机当前上游也必须支持 Chat Completions。建议在手机中启用协议设为 **Chat Completions** 的自定义供应商；若使用只支持 Responses API 的 Codex OAuth 账号池，应改用支持 Responses API 的客户端配置。

### USB 连接

USB 可避免 Wi-Fi 入站连接问题，但不改变 VPN 规则：使用 LAN API 转发时，手机和电脑的 VPN/代理仍必须全部关闭。开启 Android USB 调试并连接电脑，然后执行：

```powershell
adb devices -l
adb forward tcp:8787 tcp:8787
```

看到设备状态为 `device` 且转发命令成功后，Codex++ 的 Base URL 填 `http://127.0.0.1:8787/v1`。拔线、重启手机或 ADB 服务后需要重新执行转发命令。

## 代理与 LAN 排障

请先选择一种使用场景，不能混用：

| 目标 | VPN/代理状态 |
| --- | --- |
| 验证账号额度、测试国外模型 | 在实际发起测试的设备上开启所需 VPN/代理 |
| 手机 LAN API 转发给电脑 | 手机和电脑的 VPN/代理与 Windows 系统代理全部关闭 |

当前版本只保证上述两种独立场景。若上游只有开启 VPN 才可访问，不能同时通过本 LAN API 转发给电脑。完整的排障步骤和 HTTP 502 说明见 [LAN API 与 VPN 排障说明](docs/troubleshooting-lan-api-502.md)。

### 手机测试通过，但电脑连不上

1. 退出手机和电脑上的 VPN/代理，并关闭 Windows 系统代理。
2. 确认电脑和手机连接同一路由器的普通 LAN，不是访客网络，并关闭 AP/客户端隔离。
3. 停止后重新开启手机 LAN API，重新复制 Base URL 和新生成的配对密钥。
4. 确认 Android 通知栏仍显示服务运行；部分系统需要关闭电池优化或允许应用后台运行。
5. 手机 IP 可能因 DHCP 改变，重新打开页面并复制当前 Base URL。

不要填写 VPN 的 `tun0` 虚拟 IP。该地址通常只存在于手机 VPN 内部，电脑无法直接访问；无线模式始终使用手机 Wi-Fi 局域网 IP，或改用上面的 USB `127.0.0.1` 方案。

在 Windows PowerShell 中检查端口：

```powershell
Test-NetConnection 192.168.68.104 -Port 8787
```

检查认证和模型列表：

```powershell
curl.exe -H "Authorization: Bearer sk-phone-替换为实际密钥" `
  http://192.168.68.104:8787/v1/models
```

将示例 IP、端口和密钥替换为手机页面显示的实际值。

### 常见错误

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| `Connection refused` | 服务已停止、端口错误或手机 IP 变化 | 重新开启服务并复制地址 |
| 连接超时 | 任一端 VPN/代理未关闭、路由器客户端隔离或安全软件阻断 | 关闭两端 VPN/代理和 Windows 系统代理，关闭隔离后重试 |
| HTTP 401 | 配对密钥错误，或把 `Bearer` 当成 Key 的一部分 | 客户端 Key 只填 `sk-phone-...` |
| `/v1/models` 正常但请求失败 | 模型或协议与当前上游不兼容 | 核对模型 ID，并匹配 Responses / Chat Completions |
| 手机测试失败 | 手机到上游的代理、额度、Key 或供应商地址有问题 | 查看测试错误，先修复手机上游连接 |
| 开启任一端 VPN/代理后失败 | 当前发布版本不支持 VPN/代理与 LAN API 转发并用 | 关闭两端 VPN/代理和 Windows 系统代理后再转发 |
| USB 模式重连后失效 | ADB 转发随连接结束而释放 | 重新执行 `adb forward tcp:8787 tcp:8787` |

## 账号格式与状态

### 支持的导入格式

| 格式 | 识别内容 | 检测方式 |
| --- | --- | --- |
| Codex / ChatGPT Session / sub2api | OAuth access token、refresh token、account ID、client ID | Codex 最小模型请求 + usage 额度接口 |
| CPA / 9router / AxonHub / Codex-Manager | 兼容的 OAuth 字段和嵌套结构 | 归一化后执行 Codex 实际验证 |
| OpenAI API Key | `sk-...` 密钥 | OpenAI 模型列表请求 |
| 通用 OAuth | 可识别的 access token / refresh token 字段 | Codex 实际验证 |

导入器会遍历数组、对象和常见嵌套字段，并按凭据指纹合并重复项。单文件上限为 10 MB；Windows 单次文件夹导入上限为 10,000 个 JSON。

### 状态含义

| 状态 | 典型响应 | 清理行为 |
| --- | --- | --- |
| 在线正常 | HTTP 2xx | 保留 |
| 凭据失效 | HTTP 401，或 refresh token 明确失效 | 可由“删除失效”删除 |
| 无权限 | HTTP 403 | 保留 |
| 被限流 | HTTP 429 | 保留，稍后重试 |
| 服务异常 | 其他非 2xx HTTP | 保留 |
| 网络失败 | 超时、断网或代理不可用 | 保留 |
| 未验证 | 尚未发送实际请求 | 保留 |

本地 `expires_at` 只用于判断是否尝试刷新 access token，不作为最终成活结论。

### Codex 额度

- `primary_window` 通常是 5 小时窗口。
- `secondary_window` 通常是周期窗口。
- 页面显示 `100 - used_percent` 作为剩余额度。
- `reset_at` / `reset_after_seconds` 用于显示重置倒计时。

额度字段由上游服务决定，并非所有账号或响应都会提供。

## 隐私与安全

- 账号 JSON 在当前应用环境中解析，不会上传到本项目运营的服务器。
- 实际验证必须把凭据发送到对应的 OpenAI / ChatGPT 上游；自定义供应商 Key 会发送到用户填写的 Base URL。
- LAN API 监听手机局域网接口，使用 Bearer 配对密钥鉴权，但默认是未加密的 HTTP，不提供 TLS。仅在可信局域网中使用。
- 任何获得 Base URL 和 `sk-phone-...` 的设备都可以通过手机发送请求并消耗上游额度。不要截图、公开或提交配对密钥。
- 不要在公网路由器上做端口转发，不要在访客 Wi-Fi 或其他不可信网络中开启服务。
- 停止并重新开启 LAN API 会生成新配对密钥；怀疑泄露时立即停止服务并重新配对。
- 日志、截图、测试、Issue 和 Git 提交不得包含 access token、refresh token、API Key、配对密钥或完整账号文件。
- 本项目不是 OpenAI 官方产品，也不代表任何参考项目或第三方客户端对本应用的背书。

安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 本地开发

需求：Node.js 20+、npm。Windows 安装包需要 Windows；Android APK 需要 JDK 21 和 Android SDK 36。

```powershell
npm install
npm run dev
```

质量检查与构建：

```powershell
npm test
npm run lint
npm run build
npm run package:win
npm run package:android
```

首次构建 Android 前，在被 Git 忽略的 `android/local.properties` 中设置 `sdk.dir`。Debug APK 输出到 `android/app/build/outputs/apk/debug/app-debug.apk`。

## 架构

```text
src/App.tsx                    UI、导入、验证、供应商与 LAN API 状态
src/i18n.ts                   中英文资源和语言持久化
src/lib/accounts.ts           JSON 归一化、去重和导出
src/lib/mobile-validator.ts   Android 原生验证、供应商请求与 IP 检查
electron/main.cjs             Windows 窗口、文件夹导入和安全 IPC
electron/credential-validator.cjs
electron/network-check.cjs    Windows 上游验证与出口 IP 检查
android/app/src/main/java/com/yuchen/onlinetestingaccount/LanApiPlugin.java
                               Android LAN API、模型发现、轮询和失败切换
```

## 内容来源与开源声明

Online testing account 为独立实现，不包含下列参考项目的源码副本：

| 项目 | 参考用途 | 许可证 |
| --- | --- | --- |
| [openai/codex](https://github.com/openai/codex) | Codex 请求形式、额度窗口和限流字段 | Apache-2.0 |
| [lbjlaq/Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager) | 账号状态分类概念 | CC BY-NC-SA 4.0 |
| [gtxx3600/GPTSession2CPAandSub2API](https://github.com/gtxx3600/GPTSession2CPAandSub2API) | ChatGPT Session / CPA / sub2api JSON 兼容 | MIT |
| [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) | sub2api 结构与检测行为 | LGPL-3.0 |

[CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus) 仅作为第三方客户端配置示例；本仓库不分发其代码，也不主张与其存在官方关联。

直接依赖包括 React、Electron、Vite、TypeScript、Lucide、i18next、Capacitor 和 electron-builder。完整列表见 `package.json` 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

OpenAI Codex 协助了项目开发，但不随应用分发。

## 许可证

本项目自有源码使用 [MIT License](LICENSE)。第三方项目和依赖仍分别适用其许可证。
