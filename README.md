# DSH Go SIWC

[English](README.en.md)

独立的 DSH 插件：通过 **Continue with ChatGPT** 授权，在官方原版 DSH Go 的模型选择器中使用符合账户资格的 ChatGPT 套餐模型。无需重新编译或替换 APK。

## 当前状态

社区预览版 0.2.1。目标组合为 DSH Go 1.0.10、DSH 0.2.1-rc.4、pi-ai 1.4.0。安装包见 [GitHub Releases](https://github.com/martin2026US-lab/dsh-go-siwc/releases)。尚未发布到 npm。不要把声明的版本范围当作每个版本均已验证。

## 安装

将安装包复制到目标主机，在该主机终端执行：

```sh
dsh plugin --profile web add /path/to/local-openai-siwc-0.2.1.tgz
```

重新启动本机引擎。输入框上方的 **ChatGPT** 胶囊，或「全部功能」中的 **ChatGPT 登录** 面板，可进入登录。先阅读并同意 [隐私与本人使用说明](PRIVACY.md)，再点击 **Continue with ChatGPT**，在系统浏览器完成 OpenAI 授权并返回 App。已有授权升级后也需要确认新说明，但不会因此删除保存的登录。

登录后在原有模型选择器中选择 **ChatGPT (SIWC)** 分组。原 Codex、Claude、DeepSeek、API Key 渠道不作改动。模型和套餐资格以账户接口的实际回答为准。

## 登录保存与账户

默认仅在本次引擎运行期间保留 Token，关闭或重启引擎后重新登录；稳定的主机 ID 和账户注册 ID 仍保留，不反复注册同一客户端。可在面板中主动选择 **记住登录** 并确认保存方式。

启用「记住登录」后，Token 使用 AES-256-GCM 加密，随机密钥和加密文件均存于 DSH 私有目录，目录 0700、文件 0600。**密钥与密文位于同一应用的文件系统，不使用 Android Keystore；读取整个目录即可解密。** 这依赖 Android 应用隔离及主机文件权限，不能抵御具有同一主机文件访问能力的工具、插件、Root 或完整私有目录导出。只安装可信插件，不分享这些文件。

目录为 `$DSH_HOME/dsh-go/data/local-openai-siwc/`。注册元数据保存在 `registrations.json`，可选的持久登录文件为 `storage-key.bin` 与 `credentials.enc.json`。普通 App 升级保留 `/root` 时可保留插件及数据；卸载 App、清除数据、删除保留项或不兼容的引擎升级不在保证范围内。

可添加多个账户注册并选择当前账户。每份注册保留各自的 Client ID 和凭据，账户切换会中断旧账户的推理请求。退出登录会尝试撤销所选账户的可续期会话；断网等原因未确认撤销时，请到 [ChatGPT 用量设置](https://chatgpt.com/settings/usage) 手动断开。

## 使用范围与后台任务

仅限本人控制的单一所有者 DSH 运行环境与本人账户。插件在推理前检查实时 Agent 所有权和会话来源：所有者请求的普通工具循环、父 Agent 发起的子 Agent 保留；消息机器人、外部 webhook、跨用户请求、来源不明或无会话的 API 转发会被拒绝。跨树/兄弟 Agent 转发目前也采取保守拒绝，不能将此版本作为多人共享的 SIWC 网关。

定时任务和目标继续执行默认不可使用此渠道，需要在账户面板**另行确认允许本人后台任务**。可以撤回；关闭后台授权会中断进行中的本渠道请求。这里的后台任务指 DSH 自动化，手机切到后台不会自动撤销本人已经发起的正常 Agent 任务。插件无法防御同权限恶意工具/插件，因此仍需可信运行环境。

“管理 ChatGPT 用量”打开官方用量设置；不提供账号轮换、额度池或加额。接口受官方支持与产品资格约束，不代表 OpenAI 对本插件认证背书。发布与市场步骤见 [MARKETPLACE.md](MARKETPLACE.md)。

## 卸载与回滚

先在插件面板退出已登录的账户，再执行：

```sh
dsh plugin --profile web remove local-openai-siwc
```

重启引擎；原有登录渠道继续可用。卸载插件通常保留其数据，删除登录数据应使用面板的退出及取消记住登录操作。不要通过卸载 App 来卸载插件。

## 实现与验证

使用公开 SIWC 动态注册、PKCE S256、state、签名 ID Token 与 nonce 校验；模型来自账户目录，推理调用 `https://api.openai.com/v1/responses`。复用主机提供的 PiAiAdapter，保留历史、图片、流式事件、Function Calling、工具结果往返与 usage。插件不实现自己的手机控制、Shell 或 Agent 循环。

自动测试均使用合成凭据和 Mock Responses，不使用真实订阅额度。使用 Node.js 22.19+ 运行 `npm test`；插件 SDK 校验需要设置 `DSH_PLUGIN_KIT` 为 DSH Go 仓库的 `sdk/plugin-kit` 目录；真实适配器集成测试需要 `DSH_TEST_ENGINE` 指向已准备好的测试引擎根目录。检查输出中的跳过项，未运行不能视为通过。

官方参考：[登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[账户与会话](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)。未复制单独许可的 OpenAI DevKit 代码，不使用反向代理、Cookie 提取或 ChatGPT 内部推理接口。

项目按 AGPL-3.0-only 提供；复用的 MIT 许可源文件保留其 SPDX 标记。宿主引擎和 SDK 未随本插件分发。与 OpenAI、DeepSeek、DSH Go 官方均无隶属关系。
