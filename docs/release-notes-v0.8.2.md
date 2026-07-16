# Online testing account v0.8.2

Desktop layout and validation-flow patch release.

## Fixed

- Clipped the account pane and table viewport so row controls cannot paint over the details panel.
- Added a dedicated stacking layer for the details panel at desktop widths.
- Replaced concurrent validation with strict sequential validation: only one upstream request is active at a time.
- Only the current account displays the checking spinner; queued accounts remain pending.
- Buffers completed results and applies them in bounded batches to preserve responsiveness with large imports.

## Install notes

- Windows is not signed with a commercial code-signing certificate. Verify the published SHA-256 before bypassing SmartScreen.
- The Android artifact is an installable debug-signed APK.
- Android 7.0 / API 24 or newer is required.

## SHA-256

- Windows: `CBF9364C51F6F1455B71F8BBE9167C35CA2B583C8713B174EADEF0162943CB77`
- Android: `A0E7E727BA4B7AAD315406F5A4BA5B150081E6F64F2783FE2C2CD0F65B95F694`
