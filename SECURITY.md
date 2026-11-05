# Credential handling

Never include live access tokens, refresh tokens, ID tokens, callback URLs, cookies, private app data or login files in issues, repositories, releases, screenshots or diagnostic uploads.

Default mode stores tokens only in process memory. Remembered credentials are encrypted, but their random encryption key is in the same app-private filesystem. Reading both allows decryption. This is not hardware-bound storage or Android Keystore protection. Tools and plugins running with the host’s permissions are trusted; this integration does not sandbox them.

Do not present a successful browser authorization as proof of inference entitlement. Requests must use the documented resource, scopes, account identity, model catalog and allowed Responses capabilities. Do not route through Codex internal endpoints or rotate accounts to evade limits.

Signing out attempts server-side revocation and clears the selected local token set. A network failure can prevent confirmed revocation; disconnect the app in ChatGPT settings. Ordinary uninstallation of a plugin does not revoke its grants.

Report vulnerabilities privately through https://github.com/martin2026US-lab/dsh-go-siwc/security/advisories/new . Do not put credentials or private app data in the report. General non-sensitive questions belong in Issues. No response-time guarantee is made. Maintainers should promptly notify OpenAI of SIWC-related breaches or vulnerabilities affecting users, as required by the current SIWC terms.

This plugin is for a trusted single-owner runtime. The native privacy consent is required before OAuth, token use and model discovery. Background consent is separate. The request gate checks live Agent ownership and durable source attribution; unknown origins, other-user principals, bot/webhook requests and agentless API forwarding fail closed. This is not a security sandbox against another plugin or a shell running as the same host user. Do not expose this runtime as a multi-user service.
