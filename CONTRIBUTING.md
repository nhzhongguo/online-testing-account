# Contributing

Thanks for contributing to Online testing account.

## Before opening a change

- Do not commit account JSON, access tokens, refresh tokens, API keys, proxy URLs, screenshots containing credentials, keystores, or signing passwords.
- Keep online probes minimal and preserve the exit-IP gate.
- A status classified as invalid must remain limited to explicit credential rejection, such as HTTP 401. Do not delete accounts after timeouts, HTTP 403, HTTP 429, or local expiration guesses.
- Keep Chinese and English resources in sync when changing visible text.
- Preserve compatibility with both Electron and Capacitor Android.

## Local checks

```powershell
npm install
npm test
npm run lint
npm run build
```

For UI changes, check a desktop viewport and a 390 x 844 mobile viewport. Verify both languages, account/detail navigation, dialogs, and text overflow.

## Pull requests

Describe the user-visible behavior, testing performed, privacy/network impact, and any new dependency or upstream endpoint. Small focused changes are easier to review.
