# DSH Go SIWC

[中文](README.md)

An independent DSH plugin providing **Continue with ChatGPT** and account-scoped ChatGPT plan models in the official DSH Go model picker. No modified APK is required.

## Status and installation

Community preview 0.2.1 targets DSH Go 1.0.10, DSH 0.2.1-rc.4 and pi-ai 1.4.0. Packages are available from [GitHub Releases](https://github.com/martin2026US-lab/dsh-go-siwc/releases); it is not on npm. A declared version range is not evidence that every included version has been tested.

Copy the package onto the engine host and run:

```sh
dsh plugin --profile web add /path/to/local-openai-siwc-0.2.1.tgz
```

Restart the engine. Open the **ChatGPT** capsule or the **ChatGPT sign-in** panel in **All features**, choose **Continue with ChatGPT**, complete OpenAI authorization in your system browser, and return to the app. Choose a model under **ChatGPT (SIWC)** in the existing picker. The original Codex, Claude, DeepSeek and API-key routes remain separate. Account responses determine model and plan eligibility.

## Storage and accounts

Read and accept the versioned [privacy and single-owner notice](PRIVACY.md) before OAuth or use of a saved grant. Schedules and goal continuation require a separate background-use confirmation, disabled by default. Live owner-origin checks preserve normal tools and parent-initiated subagents, and reject other-user, bot, webhook, agentless and unattributed requests. Cross-tree/sibling Agent relays are conservatively unsupported in this preview. This is not a multi-user SIWC gateway or a sandbox against same-permission plugins. Existing registrations and grants survive the notice upgrade. Local consent can be withdrawn without deleting another Provider.

Tokens stay in memory by default and disappear when the engine exits. Stable host and account registration IDs survive restarts. **Remember login** is a separate, explicitly confirmed choice.

Remembered tokens use AES-256-GCM. Both the random key and ciphertext live in the DSH private directory, with directory mode 0700 and file mode 0600. **This is not Android Keystore protection: access to the whole directory permits decryption.** Protection relies on Android application isolation and host filesystem permissions. It does not defend against tools or plugins with the same filesystem access, Root, or complete private-data exports. Install trusted plugins and never share these files.

Data lives in `$DSH_HOME/dsh-go/data/local-openai-siwc/`: `registrations.json` holds registration metadata; optional remembered credentials use `storage-key.bin` and `credentials.enc.json`. Normal upgrades retaining `/root` can retain this data. Uninstallation of the app, data clearing, excluded reset items, and incompatible engine upgrades are not covered.

Multiple registrations retain separate client IDs and credentials. Switching accounts cancels the previous account’s inference requests. Signing out attempts to revoke the selected renewable session. If revocation cannot be confirmed, disconnect the app in [ChatGPT usage settings](https://chatgpt.com/settings/usage).

## Removal and implementation

Sign out of saved accounts in the panel, then run:

```sh
dsh plugin --profile web remove local-openai-siwc
```

Restart the engine. Other providers remain available. Plugin removal generally retains its data; use sign-out and stop-remembering controls to remove persisted login credentials. Do not uninstall the Android app merely to remove the plugin.

The plugin uses documented SIWC registration, PKCE S256, state, signed ID-token and nonce verification, account model discovery, and `https://api.openai.com/v1/responses`. It reuses the host PiAiAdapter for history, images, streaming, function calls, tool results and usage. Agent loops, phone control and Shell execution remain owned by the host.

Tests use synthetic credentials and mocked inference. Run `npm test` with Node.js 22.19+. SDK validation needs `DSH_PLUGIN_KIT` pointing to the DSH Go checkout’s `sdk/plugin-kit`; the real-adapter test needs `DSH_TEST_ENGINE` pointing to a prepared test engine. Check skipped tests: a skipped check did not pass.

Official references: [sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions). No separately licensed OpenAI DevKit code is incorporated. No proxy, cookie extraction or internal ChatGPT inference endpoint is used.

Distributed under AGPL-3.0-only, retaining SPDX notices on reused MIT source files. The host engine and SDK are not bundled. This project is not affiliated with OpenAI, DeepSeek or DSH Go.
