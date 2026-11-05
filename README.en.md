# DSH Go SIWC

[中文](README.md)

## Preview withdrawn — installation paused

2026-11-06: Preview `v0.2.1` has been withdrawn. Actual chat use exposed custom request-origin checks that reject valid requests. Earlier sign-in, model discovery and token-refresh checks did not cover this failure.

There is currently no public installable release. A corrected build is undergoing local trials; publication will be reconsidered after practical validation. Source and history remain available. The current implementation and other documents are historical references.

## Existing installations

Switch to another DSH Provider while this preview is withdrawn. To remove the plugin, sign out in its panel, then run on the corresponding engine host:

```sh
dsh plugin --profile web remove local-openai-siwc
```

Restart the engine afterward. Removal generally retains local data; use the panel's sign-out and stop-remembering controls to clear saved credentials.

Report issues through [Issues](https://github.com/martin2026US-lab/dsh-go-siwc/issues). Keep tokens and account data private.
