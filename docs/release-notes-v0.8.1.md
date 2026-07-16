# Online testing account v0.8.1

Layout and desktop asset-path patch release.

## Fixed

- Reduced the height and padding of the four compact mobile metrics to remove large empty areas.
- Kept the alive-rate and verified-account metrics visually prominent on mobile.
- Changed the in-app icon URL to a relative path so it loads correctly from packaged Electron `file://` pages.
- Preserved the existing Windows executable icon and Android adaptive icon.

## Install notes

- Windows is not signed with a commercial code-signing certificate. Verify the published SHA-256 before bypassing SmartScreen.
- The Android artifact is an installable debug-signed APK.
- Android 7.0 / API 24 or newer is required.

## SHA-256

- Windows: `6CB04F71296AAE24140A50DFEDBAEC483510402C8A35D1310CF4953927D8A030`
- Android: `ECD4BE1B14B2C0D8F2823B00F00FCD8F93AA8732D28EAFDC07889EC6D2B234AE`
