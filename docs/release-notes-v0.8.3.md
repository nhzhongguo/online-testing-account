# Online testing account v0.8.3

Validation-control and visual-polish release.

## Added

- Added pause and resume controls for a running online-validation batch.
- Added cancellation without discarding completed results. The current in-flight request finishes, no new account starts, and remaining accounts stay pending.
- Added explicit progress to the running and paused buttons, plus a cancelling state while the current request finishes.

## Improved

- Kept strict sequential validation with at most one upstream request in flight.
- Added frosted-glass surfaces, restrained light effects, and clearer active/selected states while preserving the dense workbench layout.
- Centered mobile metric contents and tightened mobile header and toolbar wrapping.
- Added regression tests for concurrency, early sequential stop, pause/resume, cancellation, and controller reset.

## Install notes

- Windows is not signed with a commercial code-signing certificate. Verify the published SHA-256 before bypassing SmartScreen.
- The Android artifact is an installable debug-signed APK.
- Android 7.0 / API 24 or newer is required.

## SHA-256

- Windows: `BA037DE448294588C8B11B3FE5F5CADB2000EAAF7546CB1CF8D373A3B41284FB`
- Android: `22068427FC85064D8B23B3FF879154259A91FF543730182AB897EF50AA96D083`
