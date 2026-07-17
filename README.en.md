<p align="center">
  <img src="public/app-icon.png" width="112" alt="Online testing account icon">
</p>

<h1 align="center">Online testing account</h1>

<p align="center">
  Account health, Codex quota inspection, and an Android LAN API gateway for Windows and Android<br>
  Author: 豫晨
</p>

<p align="center">
  <a href="README.md">中文</a> · <a href="README.en.md">English</a> ·
  <a href="https://github.com/nhzhongguo/online-testing-account/releases">Releases</a>
</p>

> [!IMPORTANT]
> Online validation and **Test connection** send minimal real requests to the upstream service and may consume a small amount of quota. Import, validate, and relay only accounts and API keys that you own or are explicitly authorized to manage.

## Contents

- [Overview](#overview)
- [Download and installation](#download-and-installation)
- [Account validation](#account-validation)
- [Android LAN API](#android-lan-api)
- [Codex++ setup](#codex-setup)
- [Proxy and LAN troubleshooting](#proxy-and-lan-troubleshooting)
- [Formats and status semantics](#formats-and-status-semantics)
- [Privacy and security](#privacy-and-security)
- [Development](#development)

## Overview

### Account inspection

- Determines account health with a minimal real upstream request instead of trusting expiration timestamps in JSON.
- Validates accounts sequentially with exactly one request in flight; supports pause, resume, and cancel.
- Displays Codex 5-hour and periodic quota windows, remaining percentage, and reset time for supported OAuth accounts.
- Treats the exit-IP check as advice only. A foreign proxy is still recommended for OpenAI, Codex, and other foreign models.
- Supports files, pasted JSON, recursive Windows folder import, search, pagination, precise HTTP 401 cleanup, and re-importable sub2api export.

### Android LAN API

- Turns an Android phone into a paired OpenAI-compatible endpoint on the local network.
- Exposes only `/v1/models`, `/v1/chat/completions`, and `/v1/responses`.
- Rotates across enabled imported accounts and automatically tries the next compatible account after an upstream failure.
- Supports custom API providers and model discovery through their `/v1/models` endpoint.
- Makes the custom-provider mode mutually exclusive with the imported-account pool, with at most one custom provider active at a time.
- **Test connection** discovers models first, randomly selects a text-capable model, sends a minimal request, and reports latency, the actual upstream, and a response summary.
- Runs as an Android foreground service. Stopping it immediately invalidates the current pairing token.

> [!WARNING]
> **VPN/proxy use and LAN API forwarding cannot be combined in the current release.** To check quota or test OpenAI, Codex, and other foreign models, enable the required VPN/proxy on the device making the request. To forward the phone's LAN API to a computer, turn off every VPN/proxy client on both the phone and computer, including the Windows system proxy. Otherwise model discovery can fail with `HTTP 502` or a timeout. See [LAN API and VPN troubleshooting](docs/troubleshooting-lan-api-502.md).

## Download and installation

Download the current release from [GitHub Releases](https://github.com/nhzhongguo/online-testing-account/releases).

### Windows

1. Download `Online testing account Setup 0.8.4.exe`.
2. Run the installer and choose an installation directory if needed.
3. If SmartScreen reports an unknown publisher, verify the SHA-256 published with the release. The open-source build is not signed with a commercial code-signing certificate.

### Android

1. Download `online-testing-account-v0.8.4-android.apk`.
2. Allow installation from the browser or file manager.
3. Install the APK. Android 7.0 / API 24 or newer is supported.
4. Allow foreground-service notifications when first starting the LAN API so its running state remains visible.

Both packages are built from this repository. iOS is not currently distributed because it requires macOS and Apple signing infrastructure.

## Account validation

1. Import a folder, one or more JSON files, or paste JSON.
2. Review parsed accounts with search and status filters.
3. Select **Validate**. The app checks the current exit IP and shows advice but never blocks validation based on region.
4. Validate the next 25 accounts or all pending accounts. Both scopes are strictly sequential.
5. Pause, resume, or cancel while running. The current request finishes first, and completed results are retained.
6. Select an account to inspect its HTTP result, quota, and reset time.
7. **Delete invalid** removes only HTTP 401 or explicitly invalid credentials. Rate-limited, forbidden, network-failed, and untested accounts are retained.
8. **Export remaining** creates re-importable sub2api JSON. Android opens the system share/save sheet.

## Android LAN API

### Upstream modes

The LAN API runs in one of two mutually exclusive modes:

| Mode | Behavior | Failure handling |
| --- | --- | --- |
| Imported account pool | Multiple OAuth or API-key accounts may be enabled and requests rotate through the pool | A failed compatible account is followed by the next account |
| Custom provider | Exactly one provider can be active and imported accounts are temporarily excluded | It does not fall back to the account pool or another provider |

While a custom provider is active, account switches are unavailable. Disabling that provider restores the previously saved account selections. Disable the current provider before enabling a different one.

### Add a custom API provider

1. Select **Custom API provider** from the Android account list.
2. Enter a name, Base URL, API key, and upstream protocol.
3. Select **Fetch models**. If the Base URL ends in `/v1`, the app requests `BASE_URL/models`; otherwise it requests `BASE_URL/v1/models`.
4. Choose a returned model. The app initially prefers a likely text-capable model, but a model can also be entered manually.
5. Enable **Set as the only active API provider** and save. Disable any currently active provider first.

The API-key field accepts a bare key. Pasting `Bearer xxx` is normalized by removing the `Bearer` prefix. Verify that the Base URL belongs to a provider you trust because the key is sent to that address.

### Start the service

1. Open the **LAN API** page from the phone's bottom navigation.
2. Open **Available upstreams** and select the participating accounts, or confirm the one active custom provider.
3. Choose a port while stopped. The default is `8787`.
4. Select **Start API service**. The page displays:
   - Base URL: `http://PHONE_LAN_IP:PORT/v1`
   - Pairing token: `sk-phone-...`
5. Keep both values. Android should show an ongoing LAN API notification.

Changing account or provider switches while the service is running hot-updates the upstream pool without changing the port or token. Disabling the final usable upstream stops the service.

> [!NOTE]
> The phone may display the credential as `Bearer sk-phone-...`. A client's **Key field must contain only `sk-phone-...`**. Add `Bearer` only when manually constructing the HTTP `Authorization` header.

### Account rotation and failover

- Requests in account-pool mode rotate their starting account so one credential is not always selected first.
- If the first compatible account fails to connect or returns an upstream error, the proxy tries the next compatible account in pool order.
- The requested protocol must be supported by the account. Codex OAuth primarily uses the Responses API; an OpenAI API key can use the interfaces supported by that account.
- Individual accounts can be disabled under **Available upstreams**. To isolate one account, temporarily leave only that account enabled and run **Test connection**.
- One successful test proves only that the route used by that test worked. Repeat the test or send multiple real requests to observe rotation and inspect the returned upstream name.

### Model discovery and connection testing

With the service running, select **Test connection**:

1. The app fetches models from every active upstream. Codex accounts or fixed-model providers that cannot expose a model list fall back to their configured model.
2. Models that are clearly image, audio, embedding, or other non-text models are excluded from the request candidates.
3. One text-capable model is selected randomly and tested through the phone's own LAN proxy route.
4. If that model is explicitly unavailable, the app randomly tries other discovered models, with no more than three model attempts in total.
5. The result shows available models, the final tested model, protocol, actual upstream, latency, and a response or error summary.

This is a real request and may consume a small amount of quota. It verifies discovery, pairing authentication, the phone's local proxy path, and upstream connectivity. It does not prove that the router allows inbound access from the computer.

## Codex++ setup

The following steps apply to a custom provider in [BigPizzaV3/CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus). Before starting, turn off every VPN/proxy client on the phone and computer, including the Windows system proxy. The two devices must be on a mutually reachable LAN.

1. Start the LAN API on the phone and copy its address and pairing token.
2. Add a custom provider in Codex++.
3. Enter the following values:

| Codex++ field | Value |
| --- | --- |
| Base URL | Wireless: `http://PHONE_LAN_IP:8787/v1`; USB: `http://127.0.0.1:8787/v1` |
| Key / API Key | Only `sk-phone-...` |
| API type / protocol | `Chat Completions` |
| Model | One exact model ID shown by **Test connection** or **Fetch models** on the phone |

Do not enter `Bearer sk-phone-...` in the Key field. Do not enter an imported account access token or the original key of the phone's upstream provider.

When Codex++ is configured for **Chat Completions**, the active phone upstream must also support Chat Completions. The recommended setup is a phone custom provider configured with that protocol. If the imported Codex OAuth pool supports Responses only, use a client configuration that supports the Responses API instead.

### USB connection

USB avoids Wi-Fi inbound-connectivity problems, but it does not change the VPN rule: turn off VPN/proxy clients on both devices before using LAN API forwarding. Enable Android USB debugging, connect the phone, and run:

```powershell
adb devices -l
adb forward tcp:8787 tcp:8787
```

After the device state is `device` and forwarding succeeds, set the Codex++ Base URL to `http://127.0.0.1:8787/v1`. Run the forwarding command again after unplugging the phone, rebooting it, or restarting ADB.

## Proxy and LAN troubleshooting

Choose one use case before starting; do not combine them:

| Goal | VPN/proxy state |
| --- | --- |
| Validate account quota or test foreign models | Enable the required VPN/proxy on the device making the request |
| Forward phone LAN API to a computer | Turn off every VPN/proxy client and the Windows system proxy on both devices |

The current release guarantees these as separate modes only. If an upstream is unreachable without a VPN, it cannot be forwarded to the computer through this LAN API at the same time. For the complete procedure and `HTTP 502` details, see [LAN API and VPN troubleshooting](docs/troubleshooting-lan-api-502.md).

### The phone test passes, but the computer cannot connect

1. Exit VPN/proxy clients on the phone and computer, and turn off the Windows system proxy.
2. Confirm that both devices use the router's regular LAN rather than a guest network, and disable AP/client isolation.
3. Stop and restart the phone LAN API, then copy the newly displayed Base URL and pairing token.
4. Confirm that the ongoing Android notification is still present. Some vendor systems require disabling battery optimization or allowing background activity.
5. DHCP can change the phone IP. Reopen the page and copy the current Base URL.

Do not use the VPN's `tun0` address. It normally exists only inside the phone's VPN and is not reachable from the computer. Wireless mode always uses the phone's Wi-Fi LAN address, or use the USB `127.0.0.1` option above.

Check the port from Windows PowerShell:

```powershell
Test-NetConnection 192.168.68.104 -Port 8787
```

Check authentication and model listing:

```powershell
curl.exe -H "Authorization: Bearer sk-phone-REPLACE_WITH_REAL_TOKEN" `
  http://192.168.68.104:8787/v1/models
```

Replace the sample IP, port, and token with the values shown on the phone.

### Common failures

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `Connection refused` | Service stopped, wrong port, or changed phone IP | Restart the service and copy the address again |
| Connection timeout | A VPN/proxy is still enabled on either device, router client isolation, or security software | Turn off VPN/proxy clients and the Windows system proxy on both devices, then disable isolation and retry |
| HTTP 401 | Wrong pairing token or `Bearer` was entered as part of the client key | Put only `sk-phone-...` in the Key field |
| `/v1/models` works but inference fails | Model or protocol does not match the active upstream | Verify the model ID and Responses / Chat Completions mode |
| Phone test fails | Phone proxy, quota, upstream key, or provider URL issue | Read the test error and repair phone-to-upstream connectivity first |
| It fails while a VPN/proxy is enabled on either device | The current release does not support VPN/proxy use together with LAN API forwarding | Turn off VPN/proxy clients and the Windows system proxy on both devices before forwarding |
| USB mode stops after reconnecting | ADB forwarding ends with the device connection | Run `adb forward tcp:8787 tcp:8787` again |

## Formats and status semantics

### Import formats

| Format | Recognized data | Probe |
| --- | --- | --- |
| Codex / ChatGPT Session / sub2api | OAuth access token, refresh token, account ID, client ID | Minimal Codex request plus usage endpoint |
| CPA / 9router / AxonHub / Codex-Manager | Compatible OAuth fields and nested records | Normalized and validated against Codex |
| OpenAI API key | `sk-...` credential | OpenAI model-list request |
| Generic OAuth | Recognizable access/refresh-token fields | Real Codex validation |

The importer traverses arrays, objects, and common nested fields, then merges duplicates by credential fingerprint. Each file is limited to 10 MB. A Windows folder selection accepts up to 10,000 JSON files.

### Status semantics

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

### Codex quota

- `primary_window` generally represents the 5-hour window.
- `secondary_window` generally represents the periodic window.
- The UI displays `100 - used_percent` as remaining quota.
- `reset_at` and `reset_after_seconds` are converted to reset countdowns.

Quota fields are controlled by the upstream service and may be absent from some accounts or responses.

## Privacy and security

- Imported JSON is parsed in the current application environment and is never uploaded to a project-operated server.
- Real validation necessarily sends credentials to the matching OpenAI / ChatGPT upstream. A custom-provider key is sent to the Base URL entered by the user.
- The LAN API listens on the phone's local interfaces and uses a Bearer pairing token, but it is plain HTTP by default and does not provide TLS. Use it only on a trusted LAN.
- Any device with the Base URL and `sk-phone-...` can send requests through the phone and consume upstream quota. Never publish or include the token in screenshots.
- Do not expose the port through public router forwarding, and do not run the service on guest Wi-Fi or another untrusted network.
- Stopping and starting the LAN API creates a new pairing token. Stop it immediately and pair again if the token may have leaked.
- Never include access tokens, refresh tokens, API keys, pairing tokens, or complete account files in logs, screenshots, tests, issues, or Git commits.
- This is not an official OpenAI product, and no referenced project or third-party client endorses it.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting guidance.

## Development

Requirements: Node.js 20+, npm, Windows for the NSIS package, and JDK 21 plus Android SDK 36 for the APK.

```powershell
npm install
npm run dev
```

Quality checks and packaging:

```powershell
npm test
npm run lint
npm run build
npm run package:win
npm run package:android
```

Set `sdk.dir` in the ignored `android/local.properties` file before the first Android build. The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## Architecture

```text
src/App.tsx                    UI, imports, validation, providers, and LAN API state
src/i18n.ts                   Chinese/English resources and language persistence
src/lib/accounts.ts           JSON normalization, deduplication, and export
src/lib/mobile-validator.ts   Android native validation, provider requests, and IP checks
electron/main.cjs             Windows window, folder import, and secure IPC
electron/credential-validator.cjs
electron/network-check.cjs    Windows upstream validation and exit-IP checks
android/app/src/main/java/com/yuchen/onlinetestingaccount/LanApiPlugin.java
                               Android LAN API, discovery, rotation, and failover
```

## Sources and attribution

Online testing account is an independent implementation. Source copies from the following reference projects are not bundled in this repository.

| Project | Reference purpose | License |
| --- | --- | --- |
| [openai/codex](https://github.com/openai/codex) | Codex request shape, quota windows, and rate-limit fields | Apache-2.0 |
| [lbjlaq/Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager) | Account-state classification concepts | CC BY-NC-SA 4.0 |
| [gtxx3600/GPTSession2CPAandSub2API](https://github.com/gtxx3600/GPTSession2CPAandSub2API) | ChatGPT Session / CPA / sub2api JSON compatibility | MIT |
| [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api) | sub2api schema and validation behavior | LGPL-3.0 |

[CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus) is referenced only as a third-party client configuration example. Its code is not distributed here, and no official relationship is claimed.

Direct dependencies include React, Electron, Vite, TypeScript, Lucide, i18next, Capacitor, and electron-builder. See `package.json` and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

OpenAI Codex assisted development but is not distributed with the app.

## License

Original project source is released under the [MIT License](LICENSE). Third-party projects and dependencies remain subject to their own licenses.
