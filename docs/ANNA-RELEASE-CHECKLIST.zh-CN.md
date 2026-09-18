# 晚钟：ANNA 上架与参赛检查单

代码与赛事规则检查日期：2026-09-09；上传状态更新：2026-09-14。项目：Evening Bell · 晚钟，版本 0.2.0。

## 当前判断

0.2.0 已上传至已有应用 `ai-planning-companion`（App ID `255`，版本 ID `763`），包状态为 `ready`，应用状态为 `draft`。CLI 授权已完成；尚未送审或公开发布，也不代表比赛资格已经成立。按用户选择，本次跳过本地运行测试；真实模型、APS、平台安装和手机体验仍未验证，尚无公开 ANNA App 链接。接下来从 Developer Console 的已有 Evening Bell 应用继续完善 Listing 并送审。

| 项目 | 结果 / 下一步 |
| --- | --- |
| ANNA 接入 | 独立静态入口、平台模型调用、个人云存储、中英文、隐私说明、备份导入导出已实现 |
| 版本上传 | 2026-09-14 已创建 0.2.0 不可变版本；远端确认 1 个版本，尚未送审或公开发布 |
| 本地检查 | 71 项测试、TypeScript、Lint、网页版及 ANNA 构建通过；ANNA 包经官方 strict 校验，详见 docs/verification.md |
| 本地运行时 | 9 月 7 日的官方 legacy 运行时 HTTP/RPC 检查通过；不等同真实 APS 或模型验收 |
| 多窗口编辑 | 本次修复旧设置/目标编辑表单覆盖其他窗口修改的问题；检测相关数据变化后拒绝保存并保留草稿 |
| GitHub 同步 | 已将远端 54c3667 的 README 清理合入本地，保留新版文档；本次修改仍须提交并推送 |
| 发布物料 | 名称、简介、Logo、随包隐私页已有；需补真实截图、公开 App 链接和实际联系方式 |

## 按此顺序上架

1. 在 ANNA More → Developer 激活开发者身份，设置自己的 Developer Handle。
2. 在 Code 目录登录，然后连接真实模型和 APS 做验收：

   ```powershell
   pnpm anna:login
   pnpm anna:build
   pnpm anna:validate
   pnpm anna:dev --storage aps --slug ai-planning-companion --llm-app-slug ai-planning-companion
   ```

   登录需要在命令显示的授权页批准。不要把登录凭证放入仓库。

3. 用真实需求验证：新建目标 → AI 拆分 → 报到 → 排程预览 → 采纳 → 专注 → 完成反馈。再验证关闭重开、第二设备重读、模型拒绝授权/失败、导入导出、隐私链接、中英文及手机布局。用两个窗口检查陈旧编辑保存会被拒绝。测试目标和反馈使用测试内容。
4. 0.2.0 已上传。后续修改代码时，先提高 anna/app.json 的版本号（例如 0.2.1），再执行 `pnpm anna:publish` 创建新版本；不可覆盖已有 0.2.0。
5. 在 Developer Console 安装上传版本复核，补齐 Listing。Logo 用 anna/store-logo.png，截图使用实际运行画面。检查联系/支持入口确实可用。
6. 提交版本审核，通过后发布到 Marketplace，再复制公开 App 链接。

上传只创建版本，仍需审核和发布。完整账号与 CLI 操作见 [ANNA.md](../ANNA.md)；平台步骤依据 [Build on Anna 101](https://forum.anna.partners/t/build-on-anna-101/228)。

## 怎样参加这次活动

活动入口：[Anna AI App Builder Program，DoraHacks #2349](https://dorahacks.io/hackathon/2349/detail)。

- 当前门户时间轴的截止点是 2026-09-30 15:59 UTC，即北京时间 **9 月 30 日 23:59**。页面正文另有 9—11 月资助窗口；建议按较早的门户日期提交，并向主办方确认两者区别。
- 公开报名配置要求确认 ANNA 构建发布要求、填写联系邮箱及 Anna 账号，Discord 选填。提交要求已发布的 ANNA App 链接。GitHub 和视频在当前公开配置中不是强制项，但建议准备。登录后的基础 BUIDL 字段以表单为准。

本活动按月度有效用户发放资助。已通过审核并在 ANNA Marketplace 公开发布的 App，在 2026 年 9—11 月任一 UTC 自然月达到 200 合格 MAU，可按首档申请当月资助：9 月 $80，后续达标月份 $50；还需满足维护及审核要求。MAU 按已登录的真实用户去重，用户须成功完成声明的主要功能并取得有意义的结果。安装、打开和团队测试不计入，以平台服务器核验为准。AI 须构成主要价值，官方要求完整界面及后端能力；审核通常需 3—5 个工作日。详情以 [官方规则](https://forum.anna.partners/t/turn-your-ai-agents-apps-into-recurring-monthly-grants-join-the-anna-ai-os-founding-builder-program-up-to-80k-month-pool/205) 及届时更新为准。

**参赛前必须澄清的适配问题：**晚钟使用 UI → ANNA LLM / Storage，没有自建 Executa。技术教程支持 UI 直接调用模型，但这不能单独证明满足资助要求或能计入 Qualified App Run。应请主办方确认“AI 任务拆分与排序、用户采纳并保存计划”如何被计为主要功能成功运行。不要为统计添加无意义调用，也不要把未获确认的运行方式写成已合格。

可复制到官方规则帖的询问（尚未发送）：

> Hi ANNA team, I am preparing Evening Bell, an app that turns personal goals and available time into actionable evening plans. Its UI calls ANNA LLM for task decomposition and ordering, validates constraints locally, and saves accepted plans through ANNA Storage. It does not include a custom Executa. Does this architecture meet the program's backend and AI-core requirements, and how would a successful use of this workflow be counted as a Qualified App Run? Also, DoraHacks currently shows a September 30 deadline while the qualification window runs through November 30. Are these separate submission and qualification deadlines?

## 建议的参赛展示与节奏

主线定位：**给下班时间不固定的人，把一个模糊目标变成今晚可执行的小计划。** 重点展示 AI 如何理解目标、提出拆分和顺序，以及用户如何确认；番茄钟连接后续执行过程。

建议两分钟真实演示：

| 时间 | 展示 |
| --- | --- |
| 0:00–0:15 | 真实问题：今晚只有 60 分钟，但有一个大目标 |
| 0:15–0:45 | 输入目标，让 ANNA 模型生成子任务，检查估时与依赖 |
| 0:45–1:10 | 报到、预览并采纳今晚安排 |
| 1:10–1:30 | 条件变为只有 30 分钟，预览调整后的安排 |
| 1:30–1:50 | 开始专注、记录完成反馈；如用 10 秒模式须保留演示标识 |
| 1:50–2:00 | 重新打开验证已保存计划，展示公开 App 链接 |

建议 9 月 9—12 日完成真实平台验收和规则询问，尽早送审；审核期间准备截图、视频及 BUIDL。拿到公开链接后立即提交，不等最后一天。先找 10—20 位确有晚间规划需求的人试用并修正阻碍，再推广到学习、备考或个人项目社区，朝 200 位成功完成主要功能的真实用户努力。日期和人数是工作建议，不是额外赛事门槛或成果承诺。

## 仍需向用户说明的边界

- 当前整份记录上限为 240 KiB。达到上限会拒绝新增保存，尚无按日期清理专注历史的入口；长期运营应增加历史管理或分片。当前可导出备份后明确选择清空重建，不会自动删历史。
- 首次创建数据没有跨设备条件写入保护，首次使用先在一个窗口完成保存；已有数据使用平台 etag 检测同时写入冲突。
- 应用关闭后不能保证提醒准时；反馈仅保存在用户自己的记录里，尚不自动发送给开发者。
- 2026-09-14 已完成 CLI 登录和 0.2.0 上传；尚未送审、公开发布或填写比赛表单。

## 推送本次代码

在 Code 目录先查看改动，再提交本次审查修复和文档：

```powershell
git status --short
git diff
git add ANNA.md docs/verification.md docs/ANNA-RELEASE-CHECKLIST.zh-CN.md components/planner/settings-view.tsx components/planner/goal-editor.tsx lib/editing.ts lib/store.ts lib/messages.ts tests/anna.test.mjs
git commit -m "Fix stale edits and prepare ANNA release"
git push origin main
```

本地已合并本次检查时的 GitHub README 提交，不需要强制推送。若 GitHub 后续又增加提交，先重新获取并检查新差异。工作区旁边 DoraHacks 文件夹中的 BUIDL基础信息.md 已更新，但它不在 Code 仓库内，需要复制或按网页字段填写。
