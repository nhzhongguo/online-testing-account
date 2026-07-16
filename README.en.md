<p align="center">
  <img src="public/app-icon.png" width="112" alt="Online testing account icon">
</p>

<h1 align="center">Online testing account</h1>

<p align="center">
  Account health and Codex quota inspector for Windows and Android<br>
  Author: 豫晨
</p>

<p align="center">
  <a href="README.md">中文</a> · <a href="README.en.md">English</a> ·
  <a href="https://github.com/nhzhongguo/online-testing-account/releases">Releases</a>
</p>

> [!IMPORTANT]
> Account health is determined by a minimal real upstream request, not by trusting the expiration time stored in JSON. A non-mainland-China IP or proxy is required. Validation is blocked when the exit is in mainland China or the country cannot be identified.

## Preview

![Desktop dashboard, early development reference](docs/images/desktop-dashboard.png)

![Open-source notice, early development reference](docs/images/open-source-notice.png)

The screenshots show the earlier development name `Account Pulse`. Version `0.8.0` uses the final `Online testing account` name and the new icon.

## Features

- Real OAuth validation against the Codex upstream and API-key validation against the OpenAI model list.
- Exit-IP gate using Cloudflare Trace with a `country.is` fallback.
- Codex 5-hour and weekly quota, remaining percentage, and reset time.
- Recursive folder import on Windows plus single/multiple JSON file import.
- Batched parsing, deferred search, 100-row pagination, and optimized state updates for imports around 80,500 accounts.
- Precise cleanup that deletes only credentials classified as HTTP 401.
- Export of every remaining account in re-importable sub2api JSON.
- Chinese/English switching with local language persistence.
- Six-step guide, startup animation, attribution dialog, and original application icon.
- Windows NSIS installer and installable Android APK.

## Download

Download installers from [GitHub Releases](https://github.com/nhzhongguo/online-testing-account/releases).

- Windows: run `Online.testing.account.Setup.0.8.0.exe`. The current open-source build is not signed with a commercial code-signing certificate; verify the release SHA-256 first if SmartScreen warns.
- Android: install `online-testing-account-v0.8.0-android.apk` after allowing installation from the browser or file manager. Android 7.0 / API 24 or newer is supported.
- iOS is not included because it requires macOS and Apple signing infrastructure.

## Workflow

1. Enable a working foreign proxy or VPN.
2. Import a folder, one or more JSON files, or paste JSON.
3. Check the parsed accounts with search and filters.
4. Choose **Validate**. The app checks the current exit IP first.
5. Validate the next 25 accounts or all pending accounts.
6. Select an account to inspect its HTTP result, quota, and reset times.
7. Use **Delete invalid** to remove only credentials that returned HTTP 401.
8. Use **Export remaining**. Android opens the native share/save sheet.

## Formats

| Format | Recognized data | Probe |
| --- | --- | --- |
| Codex / ChatGPT Session / sub2api | OAuth access token, refresh token, account ID, client ID | Minimal Codex request plus usage endpoint |
| CPA / 9router / AxonHub / Codex-Manager | Compatible OAuth fields and nested records | Normalized and validated against Codex |
| OpenAI API key | `sk-...` credential | `GET https://api.openai.com/v1/models` |
| Generic OAuth | Recognizable access/refresh-token fields | Real Codex validation |

The importer traverses common nested objects and arrays, then merges duplicates by credential fingerprint. Each file is limited to 10 MB. A Windows folder import accepts up to 10,000 JSON files in one selection.

## Status semantics

| Status | Typical response | Cleanup behavior |
| --- | --- | --- |
| Alive | HTTP 2xx | Kept |
| Invalid credential | HTTP 401 or an explicitly rejected refresh token | Eligible for deletion |
| Forbidden | HTTP 403 | Kept |
| Rate limited | HTTP 429 | Kept for retry |
| Service error | Other non-2xx HTTP response | Kept |
| Network error | Timeout, offline state, or failed proxy | Kept |
| Untested | No real request yet | Kept |

`expires_at` is used only to decide whether an access-token refresh should be attempted. It is not the final health verdict.

## Quota

After a successful OAuth response, the app reads Codex response headers and the usage response:

- `primary_window` generally represents the 5-hour window.
- `secondary_window` generally represents the weekly window.
- The UI displays `100 - used_percent` as remaining quota.
- `reset_at` and `reset_after_seconds` are converted to reset countdowns.

Quota fields are controlled by the upstream service and may be absent for some accounts or responses.

## Privacy and security

- Imported JSON is parsed in the current process and is never sent to a project-operated server.
- Real validation necessarily sends the credential to the matching official OpenAI/ChatGPT upstream endpoint.
- Windows uses the Electron main-process network layer. Android uses Capacitor's native HTTP layer.
- Credentials must never be included in logs, screenshots, tests, issues, or Git commits.
- Test only accounts you own or are explicitly authorized to administer.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting guidance.

## Development

Requirements: Node.js 20+, npm, Windows for the NSIS package, and JDK 21 plus Android SDK 36 for the APK.

```powershell
npm install
npm run dev
```

```powershell
npm test
npm run lint
npm run build
npm run package:win
npm run package:android
```

Set the local Android SDK path in the ignored `android/local.properties` file before building the APK. The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## Architecture

```text
src/App.tsx                  UI, imports, status, and batch-validation flow
src/i18n.ts                 Chinese/English resources and persistence
src/lib/accounts.ts         JSON normalization, deduplication, and export
src/lib/mobile-validator.ts Android native validation and IP checks
electron/main.cjs           Desktop window, folder import, and secure IPC
electron/credential-validator.cjs
electron/network-check.cjs  Desktop upstream and exit-IP checks
android/                    Capacitor Android project
assets/app-icon.svg         Original scalable icon source
```

## Sources and attribution

Online testing account is an independent implementation. Source copies from the following reference projects are not bundled in this repository.

| Project | Reference purpose | License |
| --- | --- | --- |
| [openai/codex](https://github.com/openai/codex) | Codex request shape, quota windows, and rate-limit fields | Apache-2.0 |
| [lbjlaq/Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager) | Account-state classification concepts | CC BY-NC-SA 4.0 |
| [gtxx3600/GPTSession2CPAandSub2API](https://github.com/gtxx3600/GPTSession2CPAandSub2API) | ChatGPT Session / CPA / sub2api JSON compatibility | MIT |
| [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) | sub2api schema and validation behavior | LGPL-3.0 |

Direct dependencies include React, Electron, Vite, TypeScript, Lucide, i18next, Capacitor, and electron-builder. See `package.json` and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

OpenAI Codex assisted development but is not distributed with the app. This is not an official OpenAI product, and the referenced projects do not endorse it.

## License

Original project source is released under the [MIT License](LICENSE). Third-party projects and dependencies remain subject to their own licenses.
