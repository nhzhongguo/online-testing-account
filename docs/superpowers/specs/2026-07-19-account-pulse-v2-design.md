# Account Pulse 2.0 Design

## Product Decision

Account Pulse 2.0 remains a local-first, single-user desktop and Android application for authorized account health checks, quota visibility, and a paired Android LAN API gateway. It does not add a cloud backend, database, login, team roles, billing, or multi-tenant administration.

The target experience is a professional personal operator console: users can safely import authorized credentials, understand account health, act on failures, inspect redacted history, and operate the LAN gateway without searching through one overloaded screen.

## Goals

- Remove plaintext credential persistence outside platform secure storage.
- Make account, validation, gateway, history, diagnostics, and settings independent workspaces.
- Preserve current validation semantics: requests remain serialized by default to avoid avoidable upstream limits.
- Provide an auditable, redacted local history of validation and LAN gateway events.
- Make version, release notes, and upgrade state consistent across desktop, Android, and UI.
- Deliver a visibly new SaaS-quality operational UI without adding a UI framework or unnecessary dependencies.

## Non-Goals

- No account marketplace, account sharing, payment, cloud synchronization, remote relay, or provider policy bypass.
- No automatic background credential checks that could unexpectedly consume quota.
- No copying server-side capabilities from multi-user API gateway products.
- No dependency refresh unless it directly enables a required fix.

## Product Structure

The desktop navigation has five primary workspaces:

1. Overview: account health, quota summary, attention queue, quick actions, and LAN status.
2. Accounts: import preview, searchable inventory, bulk actions, account detail, and protected secret controls.
3. History: redacted validation runs, exportable diagnostic summaries, and retry entry points.
4. LAN API: upstream pool, self-test state, address/token controls, recent gateway events, and troubleshooting guidance.
5. Settings: secure storage status, language, privacy behavior, update state, and version/release notes.

Mobile uses the same workspaces with an operation-first bottom navigation. Account inventory remains the first destination; summaries collapse so at least one account row or useful empty state is visible in the first viewport.

## Security and Data Model

### Secret Storage

- Electron keeps secrets only in the existing encrypted desktop vault backed by Electron safeStorage.
- Android adds a native secure-storage bridge backed by Android Keystore encrypted preferences. It stores the complete workspace only when the user explicitly enables local secure persistence.
- Browser preview never persists credentials, refresh tokens, or provider keys. It may retain non-secret UI preferences such as language.
- Existing plaintext browser workspace data is detected once. The UI offers a clear migration action to import it into supported secure storage, then deletes the plaintext value. It never silently retains or re-saves it.
- Redacted account metadata may be stored separately from secrets only when needed for usability. A record never includes a raw access token, refresh token, or provider key.

### Local History

History records validation and gateway events with timestamp, account fingerprint, source format, outcome, HTTP class, elapsed time, quota summary, and redacted detail. It never stores credentials, raw authorization headers, request bodies, or full upstream responses.

History is bounded by count and age, is exportable as a redacted JSON report, and can be cleared from Settings.

### Account Identity

Credential identity uses a collision-resistant SHA-256 digest, while display preview remains separate. Import merging preserves richer metadata and never downgrades a known expiry, refresh capability, plan, or verified state with sparse duplicate input.

## Architecture

The UI layer no longer directly owns every platform branch.

```text
features/* UI and hooks
        |
domain/* pure account, validation, history, version models
        |
platform/* Electron, Android, and browser adapters
        |
Electron encrypted vault / Android Keystore / browser ephemeral runtime
```

- `features/overview`, `features/accounts`, `features/history`, `features/lan`, and `features/settings` own workspace screens and local presentation state.
- `domain/accounts` owns parsing, identity, merge, redaction, and export rules.
- `domain/validation` owns ordered runs, state transitions, and result application.
- `domain/history` owns redacted event creation, retention, filtering, and export.
- `platform` defines a stable capability interface for file import, workspace storage, validation, network checks, external links, and LAN gateway control.
- Electron and Android implementations preserve their platform-specific behavior behind the same typed capability interface. Browser preview supplies explicitly temporary fallbacks.

The Android LAN server remains a local paired gateway, but its service lifecycle, request limits, upstream routing, and event reporting are split from the Capacitor plugin entry point.

## UX Rules

- The primary action appears once per workspace and is visible without scrolling on desktop and mobile.
- Loading uses skeletons for inventory and summary content, inline progress for imports and validation, and actionable error states rather than generic toast-only failures.
- Modal dialogs trap focus, restore focus on close, support Escape, and do not leave the background interactive.
- Bulk operations require a clear scope summary and retain completed results after cancellation.
- Every destructive action is explicitly named, shows count where applicable, and provides a safe recovery path when possible.
- Reduced-motion users receive no nonessential motion; hover and focus feedback remain visible.

## LAN API Requirements

- Android API 24 compatibility is restored; no API 33-only call is used without a compatible fallback.
- Account/pool changes, deleting credentials, clearing the workspace, and refreshing an OAuth credential synchronize the running native pool immediately.
- A stop operation closes the listener and invalidates active request handling as far as the platform permits; state must not claim immediate invalidation while an in-flight request can still use an old token.
- The gateway returns explicit request-size and unsupported-transfer errors rather than truncating payloads.
- Upstream retry rules avoid replaying requests that can have side effects unless a safe retry condition is known.
- Gateway history records redacted health events and errors, never request payloads or credentials.

## Version and Release System

- Root `version.json` is the source of truth: semantic version, build date, upgrade summary, and release identifier.
- A dependency-free Node script validates `version.json` and generates the UI build metadata plus Android version values before build/package commands.
- UI reads generated metadata rather than hardcoded strings. Update comparison uses the same semantic version.
- `CHANGELOG.md` contains the user-visible 2.0 release notes and is linked from Settings.

## Testing and Verification

- Unit tests cover account parsing, SHA-256 identity, merge ordering, migration/redaction, history retention, version validation, and validation state transitions.
- Adapter tests cover Electron vault atomicity and error recovery, browser temporary behavior, and Android bridge payload contracts.
- UI tests cover empty/loading/error states, import preview, selection/bulk actions, modal keyboard behavior, workspace navigation, and mobile layout.
- Android tests/lint cover API 24 compatibility, LAN request parsing, authorization, service stop/restart, request limits, and pool synchronization.
- Final verification runs typecheck/build, Vitest, ESLint, Android lint and APK build, production-browser desktop/mobile screenshots, and `git diff --check`.

## Delivery Sequence

1. Stabilize security, compatibility, version source, and regression tests.
2. Create domain and platform boundaries without changing user-visible behavior.
3. Add redacted history and diagnostics, then migrate existing flows to it.
4. Rebuild the workspace shell and feature screens with the new visual system.
5. Upgrade Android LAN lifecycle and diagnostic behavior.
6. Run full verification, write release notes, update screenshots/docs, and produce the 2.0 release commit.

## Acceptance Criteria

- No supported runtime stores plaintext secrets in browser localStorage.
- Desktop and Android retain user data only through secure storage with clear user-facing state.
- Android lint and build succeed at minSdk 24.
- Version strings, update checks, generated metadata, and changelog agree on 2.0.0.
- Existing import, validation, export, and LAN API use cases remain available.
- The first viewport makes the active workspace and primary action obvious on desktop and mobile.
- Tests cover security-sensitive behavior and all validation/build/lint commands pass before release.
