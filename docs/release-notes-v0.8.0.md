# Online testing account v0.8.0

First public bilingual desktop and Android release.

## Highlights

- Real Codex/API account-health validation instead of local expiration guesses
- Mandatory foreign exit-IP check before online validation
- Codex 5-hour and weekly quota display
- Folder, multi-file, and pasted JSON import
- Large-import pagination and batching optimized for 80,500-account workflows
- HTTP 401-only cleanup and remaining-account export
- Chinese/English interface and persisted language choice
- Six-step guide, startup animation, open-source notice, and original application icon
- Windows NSIS installer and Android APK

## Install notes

- Windows is not signed with a commercial code-signing certificate. Verify the published SHA-256 before bypassing SmartScreen.
- The Android artifact is an installable debug-signed APK for this initial open-source release.
- Android 7.0 / API 24 or newer is required.
- iOS is not included in this Windows-built release.

Only test accounts you own or are explicitly authorized to administer. Imported account data remains local, while real validation necessarily contacts the official upstream endpoints.

## SHA-256

- Windows: `358B95B372427520E37F2EDAADDC744AE67A4B1696563D785A1D0636DD6F3D31`
- Android: `54C91C44538AEB9B06EC23553EA01D8FC4FB269A83F0E1AC510EA91F8FA801DF`
