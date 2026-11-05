# Release verification

Version: 0.2.1, 2026-11-05. This record describes actual checks, not OpenAI certification or a guarantee of future entitlement.

## Offline checks completed

24 tests passed, 0 failed, 0 skipped using synthetic credentials, local callback HTTP, mock token/JWKS/catalog responses, and mock Responses SSE. The real bundled DSH PiAiAdapter and JOSE verifier were loaded from an extracted, pinned runtime fixture. No real inference or subscription quota was used by this suite.

Coverage: PKCE/state/nonce/redirect/client binding; JWT signature, issuer, audience, expiry and nonce; preserved grants after invalid login; optional encrypted storage and corrupt-vault refusal; remembered expired grants after restart; single-flight rotation, saved replacement after another restart, offline retention and invalid-grant clearing; account isolation; model catalog filtering; tool call/result roundtrip through the actual adapter/assembler; quota failure after streaming starts, network failure/recovery, cancellation; attempted revocation and unconfirmed remote revocation; privacy consent, withdrawal, owner origin, owned subagents and separate background permission; no credentials in native UI/error responses or plaintext registration files.

Commands (PowerShell example, paths depend on the prepared test environment):

```powershell
$env:DSH_TEST_ENGINE = 'path/to/prepared-engine'
$env:DSH_PLUGIN_KIT = 'path/to/dsh-Go/sdk/plugin-kit'
node --test test/*.test.mjs
node scripts/verify-release.mjs
node path/to/dsh-Go/sdk/plugin-kit/bin/check.mjs . --load --json
```

The SDK load check passed six placement/locale views with no issues. The test suite checks both languages, privacy/confirmation states, home and settings. Source hygiene passed. These checks do not prove the absence of every possible security issue. No install hooks or bundled runtime dependencies are shipped.

GitHub CI checks the source and SDK against pinned DSH Go commit `4cd4517dd7864604ea8d8c306a13d9f068113429`. CI has no OpenAI credentials. The two adapter/JOSE tests require `DSH_TEST_ENGINE` and are explicitly skipped in CI unless a prepared engine fixture is supplied; those tests were run locally. A skipped test is not a pass.

## On-device checks

Official DSH Go 1.0.10; DSH 0.2.1-rc.4, pi-ai 1.4.0, Node 24.22.1. Independent plugin 0.2.1 installed via `dsh plugin --profile web add` in offline mode; APK unchanged.

- Installation hash verified before invoking the official plugin CLI.
- Remembered grant restored after upgrade and two engine restarts, without browser reauthorization. Versioned consent also survived the UI upgrade/restart.
- The app was sent to the background, fully stopped, and reopened. The engine started normally and the account panel still showed the saved login and enabled remembering. No OAuth login was repeated.
- Authenticated account model discovery succeeded and returned eight visible models. This was a catalog GET, not a real inference request.
- Native account view inspected on the phone: email on a full-width line, compact storage status and separate More settings. The confirmation label respects the host's 12-character cap.
- GitHub CI passed on the private staging commit; its host/JOSE skips remain distinct from the full local run.
- Real automatic refresh succeeded after natural access-token expiry: a normal catalog request renewed access without browser sign-in and returned eight visible models. A phone-local check confirmed replacement refresh credentials had changed from the private baseline and were saved to the encrypted vault; the new access lifetime was approximately one hour. No early refresh was forced and no credential was exported.
- A further engine restart restored that replacement grant from the encrypted vault; it remained signed in with the new lifetime and the existing privacy consent.
- The three persistent login files had no group/other permissions on the Android-hosted runtime. This is filesystem isolation, not Android Keystore protection.

Device verification keeps credentials on the phone and reports only booleans, relative expiry, plugin version and notice version. No account email, OAuth client ID, token, private directory or login screenshot is included in release artifacts.

## Limits

No claim of exhaustive Agent behavior, live revocation, 30-day token survival, hardware-backed key protection, Android low-memory/OEM background survival, every remote host, or future DSH/OpenAI compatibility. Mock cancellation/network tests do not prove all Android network transitions. Normal owner tool loops and parent-initiated child Agents are supported; unknown origins, external users/bots/webhooks, agentless forwarding and cross-tree/sibling relays are conservatively refused in this preview. Background permission concerns DSH schedules/goal continuation; already user-initiated Agent work may continue when the UI backgrounds.

Other Provider credentials and code are not changed. Removal/rollback: sign out as desired, remove `local-openai-siwc` through the official plugin CLI, restart the engine and use an existing Provider. Do not uninstall the app or clear all DSH data to remove this plugin.
