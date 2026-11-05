# Changes

## 0.2.1 — 2026-11-05

- Use the native v2 text hierarchy; display email on a full-width line.
- Shorten confirmation labels to fit the host's 12-character limit. Keep the notice and owner-only commitment visible before consent.
- Move account management, background permission, privacy and withdrawal into More settings; preserve saved consent and login.

## 0.2.0 — 2026-11-05

- Add a bilingual, versioned privacy notice before OAuth or use of saved grants.
- Require single-owner consent and separate opt-in for personal schedules/goal continuations. Check live Agent lineage and message attribution before inference. Unattributed, other-user, bot, webhook and agentless requests fail closed.
- Preserve optional remembered login, serialized rotating refresh, account isolation, original providers and native Agent tool loop. Document private-filesystem storage limitations and remote revocation recovery.
- Add privacy withdrawal and background-use controls, repository/security metadata, tests and release documentation.

## 0.1.1 — local prototype

- Independent native panel, browser OAuth, account catalog and Responses adapter.
- Optional AES-GCM persistent login, explicit storage confirmation, multiple registrations and local sign-out/revocation.
