# 隐私与授权说明 / Privacy notice

版本：2026-11-05。适用于 martin2026US-lab 维护的独立 DSH Go SIWC 插件，非 OpenAI、DeepSeek 或 DSH Go 官方出品。维护与隐私请求请通过 [项目讨论/问题入口](https://github.com/martin2026US-lab/dsh-go-siwc/issues) 联系；不要在公开内容中填写个人数据。安全问题使用 [私密漏洞报告](https://github.com/martin2026US-lab/dsh-go-siwc/security/advisories/new)。维护者不经营登录、推理中转或遥测服务器。

## 连接前需要知道

OpenAI 处理系统浏览器内的账户登录、授权、客户端登记、令牌签发与刷新。插件不接触你的密码、验证码或浏览器 Cookie。授权目的仅为在当前 DSH 应用中使用本人符合资格的 ChatGPT 套餐；受 OpenAI 套餐资格、限额、地区和服务政策约束。请参阅 [OpenAI 隐私政策](https://openai.com/policies/privacy-policy/) 与 [SIWC 条款](https://openai.com/policies/sign-in-with-chatgpt-terms/)。

当你选择 ChatGPT (SIWC) 模型，DSH 选入请求的提示词、会话上下文、图片、工具定义和工具结果会直接发送至 OpenAI 的 `api.openai.com/v1/responses`；账户模型目录直接从 OpenAI 读取。工具结果可能包含你让 Agent 读取的文件、终端输出或手机截图，请使用 DSH 的权限与审批控制。插件使用 `store:false`，这不等同于对 OpenAI 的日志、保留或训练政策作承诺。未选择此渠道的请求继续遵循对应 Provider 的处理方式。

## 本机保留的数据

插件保留稳定的随机主机 ID、账户标识/邮箱标签、签发的 Client ID、当前选择及隐私/后台授权选择，目的为登录恢复、账户区分和授权控制。它们保存在 `$DSH_HOME/dsh-go/data/local-openai-siwc/`。账户标签及客户端登记是个人相关信息，普通注册元数据文件不加密；插件不上传这些文件给维护者。

默认仅在引擎内存中保留 access、refresh、ID token。你可以单独选择“记住登录”：凭据以 AES-256-GCM 加密，随机密钥与密文同在 DSH 私有文件系统。此方式依赖应用隔离及文件权限，**不使用 Android Keystore**，能读取整个目录的工具、插件、Root 或备份操作者可解密凭据。请只安装可信插件，不导出或分享私有目录。自动刷新使用最新替换令牌，通常在请求前接近到期时执行，并非永久免登录；授权撤销、令牌失效、长期未使用或清除数据后可能需要重新登录。

## 你的选择

- 阅读并同意本说明及本人使用限制后，插件才开始 OAuth 或使用已保存的授权。拒绝不会关闭其他 Provider。
- 后台任务默认关闭。另行确认后，才允许本人定时任务及目标继续执行使用套餐；可随时关闭并中断当前请求。关闭手机界面不会保证终止已授权 Agent，请同时检查 DSH 中的运行任务。
- 本插件仅适合本人控制、单一所有者的运行环境。请求来源不明、其他用户/消息机器人、外部 webhook 或通用 API 代理不受此授权支持。不能用他人的套餐执行自己的请求，也不能轮换账户规避限额。
- “取消记住登录”移除本机持久凭据，当前运行的内存登录保留到退出；“退出登录”尝试撤销该账户可续期会话并清除本机令牌。离线退出无法确认服务器撤销时会告知你。
- 在 [ChatGPT 用量设置](https://chatgpt.com/settings/usage) 管理此客户端额度或断开授权。“撤回本机使用同意”停止插件使用授权，但不等于远端撤销。
- 卸载插件通常仍保留本机注册元数据。要删除全部本地数据，先退出各账户、取消记住登录，再由本人删除上述**插件专属目录**。删除前不要导出包含凭据的备份。普通 GitHub 源码或安装包不含你的注册记录。

## 边界与更新

DSH 宿主、其他插件、选用的工具、GitHub 下载与系统浏览器各自有数据处理方式，本插件无法代替其隐私说明或隔离同权限代码。插件不用于儿童账户。若数据处理方式发生实质变化，应更新说明版本并重新征求同意；不会通过发布包预置用户同意。

## English summary

This independent plugin sends sign-in traffic directly to OpenAI and selected DSH conversations, images, tool schemas/results directly to the public OpenAI Responses resource. It operates no developer relay or analytics service. OpenAI, DSH, tools and other plugins have their own policies. `store:false` is not a promise about all OpenAI data retention.

Account labels, stable host/client registrations and consent choices stay on your host. Tokens are memory-only by default. Optional remembered tokens use AES-GCM with a key in the same private filesystem, **not Android Keystore**; host tools/plugins with file access can decrypt them. Refresh is on demand near expiry and is not a perpetual-login guarantee.

Accept this notice before connecting or using a saved grant. Only use your own account in a single-owner runtime you control. Schedules and goal continuation require separate, revocable background consent. Unattributed, other-user, bot, webhook and general API-proxy usage are unsupported. Stop remembering, sign out, revoke through ChatGPT Usage settings, or withdraw local consent from the panel. Uninstalling does not itself revoke grants or erase registrations. To erase all local records, sign out and stop remembering first, then delete only this plugin's data directory. Never post tokens or private data to public GitHub issues; use private security reporting for vulnerabilities.
