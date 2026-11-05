# 插件市场与 ChatGPT 头像

核对日期：2026-11-05。GitHub 发布与市场上架是两件事。本项目目前只发布 GitHub 预览包，保留 `private:true` 防止未经准备的 npm 发布。

## 进入截图中的“适配 DSH Go”

1. 确定你拥有的、可用的 npm 包名；必要时同步修改 `package.json`、`cordis.patch.yml`、模块导出名称、测试及安装文档。不能使用他人的 scope。改名迁移时保留现有数据目录和 Client ID，不需要为改包名重新注册 OpenAI 客户端。
2. 使用自己的 npm 账户完成登录/2FA，检查许可、repository、`dsh-plugin`/`dsh-bundle` keywords、`engines.dsh`、原生 `dshGo.v:1` 清单与贡献插槽。移除 `private:true`，先 `npm publish --dry-run --access public --ignore-scripts`，确认包内无个人数据，再 `npm publish --access public --ignore-scripts`。发布后核对该精确版本的 `dist.integrity`。
3. 按 [DSH Go 市场仓库的当前提交规则](https://github.com/ccch1mneyyy/dsh-go-market#提交插件)，Fork 市场仓库，只新增一个 `plugins/<包名>.json`（scope 使用 `@scope__name.json`），填精确 npm 版本、双语标题简介、分类、公开主页及可选的 HTTPS 截图。不能提交自称官方的 tier、risk 或 integrity。
4. 向市场仓库 main 提交该条目的 PR。按其规则通过自动检查及自动合并后，由市场生成格式 1 索引和 `dsh-go.json` sidecar。**“适配 DSH Go”依赖 sidecar 对该版本的原生适配检查结果，不是加一个 GitHub topic 就能获得。** 原生 manifest 已准备好；最终收录仍以市场检查为准。
5. 在 App 刷新，核对包名、精确版本、适配与风险标记，再用全新安装验证登录及卸载。此插件写私有文件，扫描可能标记 filesystem/中风险，不应隐藏或伪造风险结论。

本轮不代你登录 npm、不发布 npm、不向上游或市场创建 PR。可用的提交草稿见 `market-submission.example.json`，应在确定最终 npm 身份后更新。

## “全部”分区的 dshfind

另一路是 [dshfind](https://dshfind.com/zh)，其格式 1 索引为 `https://api.dshfind.com/market/dsh-index.json`。仓库 topic、npm keywords、有效 bundle 及 npm 包的 repository 回链帮助发现，等索引更新后核对。dshfind 的收录与 DSH Go 官方 sidecar 的“适配”分区不同，不承诺即时收录。

## 你截图里的 DSH Go / Paper Space 头像

这是 **ChatGPT 账户端 OAuth 客户端的图标**。改 Android 图标、Windows 图标、GitHub 头像、`package.json.dshGo.icon` 都不能据此改变它。

当前查阅的 [动态注册/登录文档](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[账户与会话](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) 及 [SIWC UI 指南](https://developers.openai.com/siwc/ui-ux-guidelines) 没有公开可验证的动态客户端 logo 设置或更新字段。因此目前不能给出“加 logo_uri 参数就会显示”的保证，也不会调用未公开客户端管理接口。

如果 OpenAI 为你的客户端开放了品牌资料管理，请通过该受支持入口上传你有权使用的图标，并询问现有授权记录的缓存/更新规则；否则应向 OpenAI SIWC 支持确认动态客户端是否支持自定义头像。商业合作客户端申请有单独的 [官方申请入口](https://developers.openai.com/siwc/request-client-id)，不代表 OSS 动态客户端已有相同能力，也不保证套餐调用资格。

Hermes Portal 显示头像只能证明它的记录已有图标，不能证明它采用和这两个动态客户端相同的注册渠道。不要为了图标删除当前授权或反复注册客户端。
