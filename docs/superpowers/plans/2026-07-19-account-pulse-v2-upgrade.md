# Account Pulse 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Account Pulse 2.0 as a local-first personal operations console with secure credential storage, redacted history, a new workspace UI, reliable Android LAN behavior, and a single version source.

**Architecture:** Keep one React/Vite application, Electron main process, and Capacitor Android target. Move business rules into `domain`, platform differences into `platform`, and screen-specific UI into `features`; secrets remain only in memory or platform secure storage while history remains redacted.

**Tech Stack:** React, TypeScript, Vite, Electron safeStorage, Capacitor Android, Android Keystore, Vitest, ESLint, Gradle. Add no runtime dependency. Add `@testing-library/react` and `jsdom` only if the existing Vitest environment cannot exercise workspace navigation and dialog behavior.

---

## File Structure

- Create: `version.json` - authoritative semantic version and release metadata.
- Create: `scripts/sync-version.mjs` - validates metadata and synchronizes package/UI/Android version fields.
- Create: `src/version.ts` - typed UI version reader.
- Create: `src/domain/history.ts` and `src/domain/history.test.ts` - redacted event model, retention, filters, export.
- Create: `src/platform/types.ts` - workspace, validation, file, network, and gateway capability contracts.
- Create: `src/platform/{browser,electron,android,index}.ts` - platform implementations and selector.
- Create: `src/features/{shell,overview,accounts,history,lan,settings}/` - screen components, hooks, and styles.
- Create: `android/app/src/main/java/com/yuchen/onlinetestingaccount/SecureWorkspacePlugin.java` - Keystore-backed Android workspace bridge.
- Create: `android/app/src/main/java/com/yuchen/onlinetestingaccount/LanApiService.java` and `LanGatewayServer.java` - LAN lifecycle and request processing.
- Modify: `src/lib/accounts.ts`, `src/lib/accounts.test.ts` - strong identity and non-destructive merge behavior.
- Modify: `src/App.tsx`, `src/i18n.ts`, `src/styles.css`, `src/vite-env.d.ts` - migration to the new shell and capability contracts.
- Modify: `electron/{main.cjs,preload.cjs}` - atomic encrypted workspace operations.
- Modify: `android/app/src/main/java/com/yuchen/onlinetestingaccount/{MainActivity.java,LanApiPlugin.java}` and Android manifest/Gradle files.
- Modify: `package.json`, `README.md`, `README.en.md`, `CHANGELOG.md`, `.gitignore`.

## Execution Rules

- Preserve serial validation; do not increase account request concurrency.
- Do not persist raw credentials, refresh tokens, provider keys, request bodies, or full upstream responses in history.
- Do not add a server, database, login, user roles, payment, or cloud sync.
- Run targeted tests after every task. Keep one final release commit only: `upgrade: 完成项目2.0版本全面升级`.

### Task 1: Establish Version Source and Release Metadata

**Files:**
- Create: `version.json`, `scripts/sync-version.mjs`, `src/version.ts`, `scripts/sync-version.test.mjs`
- Modify: `package.json`, `src/App.tsx`, `src/i18n.ts`, `android/app/build.gradle`, `README.md`, `README.en.md`

- [ ] **Step 1: Write failing version validation tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVersionMetadata } from './sync-version.mjs';

test('rejects invalid release metadata', () => {
  assert.throws(() => validateVersionMetadata({ version: '2', build: '', upgrade: '' }));
});
```

- [ ] **Step 2: Run the test and confirm the missing module fails**

Run: `node --test scripts/sync-version.test.mjs`  
Expected: failure because `sync-version.mjs` does not exist.

- [ ] **Step 3: Add one source of truth and deterministic synchronization**

```json
{
  "version": "2.0.0",
  "build": "20260719",
  "upgrade": "Secure local workspace, operations console, history, and LAN reliability",
  "author": "AI Upgrade"
}
```

`sync-version.mjs` must validate `x.y.z`, an eight-digit build date, non-empty upgrade text, and update only `package.json` version plus Android `versionCode`/`versionName`. `src/version.ts` imports `version.json` for UI metadata.

- [ ] **Step 4: Add package scripts and remove hardcoded UI versions**

```json
"sync:version": "node scripts/sync-version.mjs",
"test:version": "node --test scripts/sync-version.test.mjs",
"build": "npm run sync:version && tsc -b && vite build"
```

Replace `CURRENT_VERSION` and translated static version labels with `APP_VERSION.version`.

- [ ] **Step 5: Verify synchronization**

Run: `npm run test:version && npm run sync:version && npm run build`  
Expected: all commands exit `0`; package, UI metadata, Android version name, and release docs display `2.0.0`.

### Task 2: Make Workspace Storage Secure and Explicit

**Files:**
- Create: `src/platform/types.ts`, `src/platform/browser.ts`, `src/platform/electron.ts`, `src/platform/android.ts`, `src/platform/index.ts`, `src/platform/browser.test.ts`
- Create: `android/app/src/main/java/com/yuchen/onlinetestingaccount/SecureWorkspacePlugin.java`
- Modify: `src/App.tsx`, `src/vite-env.d.ts`, `electron/preload.cjs`, `electron/main.cjs`, `android/app/src/main/java/com/yuchen/onlinetestingaccount/MainActivity.java`, `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Write failing tests for browser secrecy and legacy cleanup**

```ts
it('keeps a browser workspace in memory and never writes secrets to localStorage', async () => {
  const storage = createBrowserWorkspaceStorage(window.localStorage);
  await storage.save({ accounts: [accountWithCredential], issues: [], apiProviders: [] });
  expect(window.localStorage.getItem('ota-workspace-v1')).toBeNull();
  expect((await storage.load()).workspace?.accounts).toHaveLength(1);
});
```

- [ ] **Step 2: Run the targeted test and confirm the old localStorage behavior fails it**

Run: `npm test -- browser.test.ts`  
Expected: failure until browser storage is introduced.

- [ ] **Step 3: Define a typed workspace boundary**

```ts
export interface WorkspaceStorage {
  load(): Promise<WorkspaceLoadResult>;
  save(workspace: SecureWorkspace): Promise<WorkspaceSaveResult>;
  clear(): Promise<void>;
  mode: 'encrypted' | 'temporary' | 'unavailable';
}
```

Use `getPlatformCapabilities()` so UI code never branches directly on `window.accountPulse` or localStorage for secrets.

- [ ] **Step 4: Implement adapters**

- Electron adapter delegates to a narrow preload bridge.
- Browser adapter stores data only in a module-scoped variable and reports `temporary`.
- Android adapter delegates to `SecureWorkspacePlugin`, which encrypts a single JSON blob using an Android Keystore key and `EncryptedSharedPreferences` or an equivalent AndroidX encrypted implementation already available in the dependency graph. If unavailable, implement AES-GCM with a Keystore-managed key in the plugin without a new npm dependency.
- Electron writes vault data to a temporary sibling file, fsyncs it, then renames it to prevent an interrupted write from erasing a recoverable workspace.

- [ ] **Step 5: Implement one-time plaintext migration**

On first browser launch, read the legacy `ota-workspace-v1` key only to present an explicit import-and-delete action. Never auto-save that value. On Android, migration writes to secure storage only after explicit confirmation; on Electron, read the encrypted vault only.

- [ ] **Step 6: Verify storage behavior**

Run: `npm test -- browser.test.ts && npm run lint && npm run build`  
Expected: no code path writes credential-bearing workspace data to browser localStorage.

### Task 3: Harden Account Identity, Import, and Result Application

**Files:**
- Modify: `src/lib/accounts.ts`, `src/lib/accounts.test.ts`, `src/App.tsx`
- Create: `src/domain/validation.ts`, `src/domain/validation.test.ts`

- [ ] **Step 1: Add failing regression tests**

```ts
it('does not merge credentials that share an old 32-bit hash collision', async () => {
  const merged = await mergeAccounts([], [firstCollisionAccount, secondCollisionAccount]);
  expect(merged).toHaveLength(2);
});

it('does not erase a verified quota when an import has no quota data', async () => {
  expect((await mergeAccounts([verified], [sparseDuplicate]))[0].quota).toEqual(verified.quota);
});
```

- [ ] **Step 2: Run only the account suite**

Run: `npm test -- accounts.test.ts`  
Expected: the new collision and sparse-merge cases fail.

- [ ] **Step 3: Replace `stableHash` with SHA-256 identity**

```ts
export async function credentialFingerprint(credential: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
```

Make account parsing and merge flows async at their outer boundary; keep the raw credential only in in-memory/secure workspace records. Preserve a separate shortened `credentialPreview`.

- [ ] **Step 4: Make merges monotonic**

Keep known expiry, refresh credential, quota, verified status, plan, and non-placeholder email when incoming input omits them. Recompute fingerprint and preview whenever validation returns a refreshed access credential. Clear quota when a definitive credential failure is returned.

- [ ] **Step 5: Add bounded import traversal**

Reject documents that exceed a documented nesting depth or candidate limit with an `ImportIssue`; complete all import UI cleanup in `finally` blocks.

- [ ] **Step 6: Verify account regressions**

Run: `npm test -- accounts.test.ts validation.test.ts`  
Expected: all old and new parsing, merge, refresh, collision, and failure-result cases pass.

### Task 4: Add Redacted History and Diagnostics Domain

**Files:**
- Create: `src/domain/history.ts`, `src/domain/history.test.ts`, `src/features/history/HistoryWorkspace.tsx`
- Modify: `src/App.tsx`, `src/lib/accounts.ts`, `src/i18n.ts`

- [ ] **Step 1: Write retention and redaction tests**

```ts
it('drops raw secrets and limits history to the configured retention window', () => {
  const history = appendHistory([], validationEventWithSecret, { maxEntries: 500, maxAgeDays: 30 });
  expect(JSON.stringify(history)).not.toContain(validationEventWithSecret.credential);
  expect(history[0]).toMatchObject({ type: 'validation', fingerprint: expect.any(String) });
});
```

- [ ] **Step 2: Implement the event model**

```ts
export interface HistoryEvent {
  id: string;
  at: number;
  type: 'validation' | 'gateway' | 'diagnostic';
  outcome: 'success' | 'attention' | 'failure';
  fingerprint?: string;
  detail: string;
  elapsedMs?: number;
  quota?: AccountQuota;
}
```

- [ ] **Step 3: Record events at result boundaries**

Create events from validation outcomes, network checks, LAN self-tests, gateway state changes, and gateway errors. Use a single `toRedactedHistoryEvent` function and unit-test it against credentials, refresh tokens, and provider API keys.

- [ ] **Step 4: Add History workspace behavior**

Support filters by type/outcome/date, one-click retry that returns users to the relevant account scope, clear-history confirmation, and export through existing platform save-report capability.

- [ ] **Step 5: Verify history**

Run: `npm test -- history.test.ts && npm run lint`  
Expected: retention, export, and no-secret assertions pass.

### Task 5: Build the 2.0 Application Shell and Workspace Screens

**Files:**
- Create: `src/features/shell/AppShell.tsx`, `src/features/overview/OverviewWorkspace.tsx`, `src/features/accounts/AccountsWorkspace.tsx`, `src/features/lan/LanWorkspace.tsx`, `src/features/settings/SettingsWorkspace.tsx`
- Create: `src/features/shared/{EmptyState,LoadingSkeleton,Modal,Toast,SectionHeader}.tsx`
- Modify: `src/App.tsx`, `src/styles.css`, `src/i18n.ts`, `src/main.tsx`
- Test: `src/features/shell/AppShell.test.tsx`, `src/features/shared/Modal.test.tsx`

- [ ] **Step 1: Add the minimum component-test harness only if needed**

First attempt a component test with current Vitest. If DOM rendering is unavailable, add the smallest justified dev stack:

```json
"devDependencies": {
  "@testing-library/react": "^16.3.2",
  "jsdom": "^29.1.1"
}
```

Do not add a component library, router, state-management framework, or animation package.

- [ ] **Step 2: Write navigation and dialog accessibility tests**

```tsx
it('moves between workspaces and restores focus after closing a dialog', async () => {
  render(<AppShell />);
  await userEvent.click(screen.getByRole('button', { name: /history/i }));
  expect(screen.getByRole('heading', { name: /validation history/i })).toBeVisible();
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('button', { name: /run validation/i })).toHaveFocus();
});
```

- [ ] **Step 3: Extract the shell before changing feature semantics**

`App.tsx` becomes the dependency-composition entry point. It creates platform capabilities, workspace state, and feature providers, then renders `AppShell`. Existing import/validation/LAN handlers move with their owning feature and retain current behavior.

- [ ] **Step 4: Implement visual system and responsive behavior**

- Desktop: compact sidebar, workspace title, one visible primary action, four concise overview metrics, and dense account inventory.
- Mobile: bottom workspace navigation, collapsed overview summary, account content in first viewport, touch-safe row actions.
- Shared states: skeletons during secure workspace/load, visible import and validation progress, actionable empty/error panels, focus-managed dialogs, reduced-motion variants.
- CSS: split styles by feature, keep design tokens in one file, use 8px-or-less component radius, maintain Lucide icons and existing semantic colors.

- [ ] **Step 5: Verify UI behavior**

Run: `npm test -- AppShell.test.tsx Modal.test.tsx && npm run build`  
Expected: navigation, keyboard dialogs, loading/empty/error states compile and pass. Then capture desktop and mobile browser screenshots from the production build and compare against the approved console direction.

### Task 6: Upgrade Android Secure Storage and LAN Reliability

**Files:**
- Create: `android/app/src/main/java/com/yuchen/onlinetestingaccount/{SecureWorkspacePlugin,LanApiService,LanGatewayServer}.java`
- Modify: `android/app/src/main/java/com/yuchen/onlinetestingaccount/{MainActivity,LanApiPlugin}.java`, `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`, `android/app/src/test/java/com/yuchen/onlinetestingaccount/ExampleUnitTest.java`
- Modify: `src/features/lan/LanWorkspace.tsx`, `src/platform/android.ts`

- [ ] **Step 1: Write API 24 and request-limit regression tests**

```java
@Test public void headerParserSupportsApi24CompatibleUtf8Decoding() throws Exception {
  assertEquals("GET /v1/models HTTP/1.1\\r\\n\\r\\n", LanGatewayServer.decodeHeaders(bytes));
}

@Test public void rejectsOversizedPayloadWithoutForwarding() {
  assertEquals(413, LanGatewayServer.requestSizeStatus(2 * 1024 * 1024 + 1));
}
```

- [ ] **Step 2: Fix Android 7-12 compatibility before refactoring**

Replace `ByteArrayOutputStream.toString(StandardCharsets.UTF_8)` with `new String(bytes, StandardCharsets.UTF_8)`. Run lint before any broader LAN changes.

- [ ] **Step 3: Split plugin, service, and server responsibilities**

- `LanApiPlugin` validates Capacitor calls and exposes typed results.
- `LanApiService` owns foreground lifecycle and a single current server reference without stop/start races.
- `LanGatewayServer` owns request parsing, authentication before body processing, explicit size/transfer handling, upstream selection, and redacted event callbacks.

- [ ] **Step 4: Synchronize pool mutations**

After OAuth refresh, account deletion, provider enable/disable, workspace clear, or import merge, call one gateway synchronization method with a newly serialized pool. When the pool becomes empty, stop the server and clear the shown pairing token.

- [ ] **Step 5: Make retry and shutdown behavior honest**

Return gateway errors for oversized or unsupported bodies. Do not retry a request after bytes were successfully written to an upstream unless it is explicitly safe. Track active client sockets; close them during shutdown and report whether an in-flight request was cancelled or completed.

- [ ] **Step 6: Verify Android**

Run: `cd android; .\\gradlew.bat testDebugUnitTest lintDebug assembleDebug`  
Expected: API 24 lint error is gone, unit tests pass, and the debug APK is produced.

### Task 7: Improve Electron Reliability and Diagnostics

**Files:**
- Modify: `electron/main.cjs`, `electron/preload.cjs`, `electron/credential-validator.cjs`, `electron/network-check.cjs`
- Create: `src/lib/electron-workspace.test.ts`, `src/lib/electron-validation-contract.test.ts`
- Modify: `src/platform/electron.ts`, `src/features/settings/SettingsWorkspace.tsx`

- [ ] **Step 1: Write atomic vault tests**

```ts
it('keeps the last valid encrypted workspace when a replacement write fails', async () => {
  await writeWorkspace(previousWorkspace);
  await expect(writeWorkspaceWithFailingRename(nextWorkspace)).rejects.toThrow();
  await expect(readWorkspace()).resolves.toMatchObject({ workspace: previousWorkspace });
});
```

- [ ] **Step 2: Add a serialized atomic write path**

Write encrypted bytes to `workspace.bin.tmp`, flush the file handle, then rename over `workspace.bin`. Preserve a corrupt vault under a timestamped recovery filename rather than silently treating it as an empty workspace.

- [ ] **Step 3: Align validation contracts**

Document and test one `ValidationResult` mapping across Electron and Android: status, redacted detail, quota, refreshed credentials, expiry, and retryability. Categorize proxy/PAC/TLS failures without leaking proxy credentials.

- [ ] **Step 4: Add diagnostics UI inputs**

Show secure storage mode, current update status, last network diagnostic, and exportable redacted report. Do not expose internal filesystem paths, raw response bodies, or credentials.

- [ ] **Step 5: Verify Electron paths**

Run: `npm test -- electron-workspace.test.ts electron-validation-contract.test.ts && npm run lint && npm run package:win`  
Expected: vault tests pass and the Windows installer is produced from synchronized version metadata.

### Task 8: Complete Documentation, Release Notes, and Final Quality Gate

**Files:**
- Create: `CHANGELOG.md`
- Modify: `README.md`, `README.en.md`, `docs/release-notes-v2.0.0.md`, `docs/images/*`, `SECURITY.md`

- [ ] **Step 1: Write the 2.0 changelog**

```markdown
# Version 2.0.0

新增：
- 本地安全工作区、验证历史、诊断工作区和新版运营控制台。

优化：
- 账号管理、移动端主流程、版本管理和 LAN API 状态展示。

修复：
- Android API 24 兼容、凭据存储、版本漂移、工作区原子写入和账号合并边界。
```

- [ ] **Step 2: Update public documentation**

Document local-first scope, explicit secure-storage behavior, browser temporary mode, history redaction, LAN limitations, Android support, exact build commands, and the 2.0 screenshots. Remove obsolete 0.8.x version references.

- [ ] **Step 3: Run the complete release gate**

Run:

```powershell
npm run test:version
npm test
npm run lint
npm run build
Push-Location android; .\gradlew.bat testDebugUnitTest lintDebug assembleDebug; Pop-Location
git diff --check
git status --short
```

Expected: every command exits `0`; production desktop and mobile screenshots show the new UI; no plaintext credentials appear in storage or redacted exports.

- [ ] **Step 4: Create the single requested release commit and push**

```powershell
git add .
git commit -m "upgrade: 完成项目2.0版本全面升级"
git push
```

Expected: the commit contains source, tests, `version.json`, `CHANGELOG.md`, updated docs, and no build outputs, credentials, or local troubleshooting artifacts.

## Plan Self-Review

- Security storage, version source, account correctness, history, shell UI, Android LAN, Electron reliability, documentation, and final release verification each have a dedicated task.
- All newly introduced names are defined in their owning task before later tasks consume them.
- The plan intentionally excludes a backend, database, users, billing, cloud synchronization, and uncontrolled retries.
- No task depends on an unspecified package upgrade; component-test dependencies are added only if the existing test environment cannot execute the required UI coverage.
