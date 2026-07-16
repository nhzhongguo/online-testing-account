# Security Policy

## Supported version

Security fixes target the latest published release.

## Reporting a vulnerability

Do not post credentials, account files, access tokens, refresh tokens, API keys, proxy information, signing keys, or reproducible private-account data in a public issue.

Use GitHub's private vulnerability reporting feature for this repository. Include the affected version, platform, impact, minimal reproduction steps, and a redacted proof of concept. Remove or replace every secret before submission.

## Security model

- Imported account data is parsed locally.
- Online validation sends a minimal request directly to the corresponding OpenAI/ChatGPT upstream endpoint.
- Exit-IP detection queries Cloudflare Trace, with `country.is` as a fallback.
- The project does not operate an intermediary credential server.
- Windows uses Electron context isolation and a narrow preload API. Android uses Capacitor native HTTP and file-sharing plugins.
- HTTP 401 is the only online status eligible for automatic invalid-credential cleanup.
