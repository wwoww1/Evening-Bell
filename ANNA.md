# 晚钟上线 ANNA

本项目已有独立 ANNA 构建入口。原有网页版继续用 `pnpm dev` 运行；ANNA 版在 `anna/`，复用中英文界面、排程、番茄钟及业务校验，无需 Python Executa 或四平台二进制构建。

2026-09-18 已将审核反馈修复推送到 GitHub（`57abf70`），并上传 **0.2.1** 到同一应用（App ID `255`，版本 ID `818`）。新版本含随时开始的番茄钟、每日专注记录与备注、Today 习惯清单及排程反馈、ANNA 错误分类修复。三张英文截图已通过 GitHub Pages 上线，并回读确认 ANNA 上架资料一致。应用包已就绪；应用仍显示上次审核的 `rejected`，本次未重新送审或公开发布。90 项测试、本地 ANNA RPC 与浏览器验证通过，真实生产环境的用户操作仍需复测。详见 [本次核对记录](docs/review-followup-2026-09-18.md)。

2026-09-14 已上传 0.2.0：沿用账号中已有的 Evening Bell 应用（App ID `255`，slug `ai-planning-companion`），版本 ID 为 `763`。远端确认共 1 个版本，上传包为 `ready`；应用仍为 `draft`，尚未送审或公开发布。本次按用户选择跳过本地运行测试，构建与官方 strict 校验通过。

2026-09-09 的代码检查结论、真实账号验收清单、比赛截止时间与提交要求见 [上架与参赛检查单](docs/ANNA-RELEASE-CHECKLIST.zh-CN.md)。技术上允许无 Executa，并不等于已获比赛资格确认。

## 已完成的适配

- `anna/app.json`：名称、简介、分类、版本和免费应用信息。
- `anna/manifest.json`：schema 2、响应式主窗口、最小权限 `llm.complete`、`storage.get/set`。不使用跨应用存储、聊天读写或 Executa 权限。
- `anna/bundle/`：构建后的静态页面、脚本、样式、图标及隐私说明。资源使用相对路径；SDK 从 ANNA 宿主加载。
- AI：通过官方 SDK 的 `anna.llm.complete` 请求 ANNA 模型；不需要开发者模型密钥。保留拆分依赖、任务 ID 和输出格式校验，异常排序回退本地规则。模型由用户账号选择，使用用户额度。
- 存储：通过 ANNA APS 保存个人计划、记录和偏好；收到保存确认后才更新成功状态。每次写入前重新读取，已有记录带 `if_match`，冲突或失败不自动覆盖、不自动重试。
- 切回应用及可见时每 30 秒刷新数据。生产 APS 不依赖旧版的 `runtime_state_synced` 事件。
- 设置里可导出与导入备份。导入先检查格式并确认替换，支持原网页的 v1 数据格式，不会自动上传浏览器旧数据。
- ANNA 版不注册网页 Service Worker，不依赖浏览器 Cookie 或 localStorage。系统通知在 ANNA 版使用应用内提示；保持应用打开才有准时提醒。

## 1. 准备账号和环境

在 ANNA 的 More → Developer 中激活开发者身份、设置 Developer Handle。安装 Node.js 24（最低 22.13）及 uv。项目已固定 `@anna-ai/cli` 0.1.51，使用项目内 CLI，不必全局安装。

在 `Code`（包含 package.json 的目录）运行：

```powershell
pnpm install --frozen-lockfile
node scripts/anna.mjs doctor
pnpm anna:login
```

按登录命令显示的地址，在浏览器完成 Approve。不要把凭证粘贴到代码或提交到 Git。

## 2. 构建和本地体验

```powershell
pnpm anna:build
pnpm anna:validate
pnpm anna:dev --storage aps --slug ai-planning-companion --llm-app-slug ai-planning-companion
```

第三条命令需要已登录的 ANNA 账号，会连接真实模型与 APS。按终端显示的本地地址打开；首次运行可能需要下载 Python 运行时。若 CLI 的 8 秒启动时限早于下载完成，可先运行下列命令完成安装，然后重试：

```powershell
uv tool run --from anna-app-runtime-local==0.2.0a23 anna-app-bridge --help
```

开发环境可能创建用于测试的 ANNA 应用记录，账号权限和模型授权以平台提示为准。若出现模型授权错误，在 Installed Apps / 开发者页面检查 LLM 权限和账号模型设置。

仅检查本地界面和接口、无需账号或真实模型时：

```powershell
pnpm anna:dev --no-llm --storage legacy --slug ai-planning-companion
```

**legacy 模式的存储在内存中，重启或创建新测试会话会丢失。** 正式发布使用平台 APS。此模式不能证明真实模型和生产存储连通。

## 3. 上传、安装测试、审核

在 `Code` 目录执行：

```powershell
pnpm anna:publish
```

该命令先重新构建并严格校验，再以 `anna/` 为工作目录执行 `anna-app apps publish`。自动读取 `app.json`、`manifest.json` 和 `bundle/`，上传并创建不可变版本。**上传成功不等于审核通过或公开上架。**

1. 到 ANNA Developer 页面打开 Evening Bell。
2. 检查 Listing 信息，Logo 已备好在 `anna/store-logo.png`，按平台实际要求补充截图、联系或支持信息。
3. 安装刚上传的版本，授权模型功能。
4. 测试新建目标 → AI 拆分 → 报到排程 → 采纳 → 专注 → 完成反馈。切换语言、关闭重开验证记录。再测试导入、导出及模型拒绝授权后的本地功能。
5. 提交该版本审核。审核通过后，在平台发布该版本。

后续有代码变更时，先将 `anna/app.json` 的版本提高到例如 `0.2.1`，再构建、上传并审核。同一个不可变版本不能覆盖重传。当前绑定的已有应用标识为 `ai-planning-companion`；不要随意更改 slug 或另建重复应用。

## 数据和运行边界

- 个人数据保存在每用户、每 App 的 ANNA bucket；清除记录会写入空白状态。语言偏好独立保存，清除计划不会重置语言。
- 当前完整计划记录保存在一个键中，上限保守设为 240 KiB，超过时拒绝保存，不截断历史。可先导出备份并精简旧记录。ANNA 自身的账号总额度仍可能先达到上限。
- `if_match` 保护平台提供 etag 的已有记录；旧版 legacy 模拟存储不支持这一保证，首次创建时也不宣称跨设备原子写入。首次使用请先在一个窗口完成保存。冲突提示出现后，重新打开并检查最新数据再操作。
- 存储断网或响应超时后，不会显示保存成功。若请求已在平台完成但确认丢失，重新打开检查最新记录，避免盲目重复操作。
- 页面关闭后不会在后台执行提醒或排程。重新打开后按时间戳恢复计时，不会重复累计专注记录。
- 反馈保存在个人数据中，不会自动发送给开发者。隐私说明随包提供在 `anna/privacy.html`，可从设置查看。

## 验证与文件

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm anna:build
pnpm anna:validate
```

2026-09-07 已通过 66 项自动化测试、TypeScript、Lint、普通网页生产构建及 ANNA 构建，并通过官方 CLI 严格校验。原网页版 HTTP/API 回归通过，覆盖中英文、本地拆分、输入和来源校验、PWA 资源。官方 ANNA 本地运行时的 HTTP/RPC 检查覆盖页面和资源加载、SDK、窗口握手、实际权限结构、数据保存与重读、语言保存以及未声明权限被拒绝。该检查使用临时本地 legacy 会话，不调用真实模型。9 月 9 日再次检查并修复多窗口陈旧编辑覆盖问题，最终结果见 [验证记录](docs/verification.md)。

可在专门启动的本地 legacy 测试环境中执行 `pnpm anna:smoke`；它会创建一个新的临时测试会话。完整浏览器交互、真机移动端、账号下的真实模型/APS 和审核仍需按上述步骤验证；0.2.0 上传已于 2026-09-14 完成。

需要将最新代码上传 GitHub 时，`pnpm package:github` 会生成包含 ANNA 源码的包，并排除凭证、本机 `.anna/`、构建物和依赖。

## 官方依据

- [Build on Anna 101](https://forum.anna.partners/t/build-on-anna-101/228)
- [Manifest（schema 2 允许无 Executa）](https://anna.partners/developers/apps/app-manifest)
- [LLM 接口](https://anna.partners/developers/reference/host-api-llm)
- [APS 存储与并发语义](https://anna.partners/developers/reference/host-api-storage)
- [CLI 发布流程](https://anna.partners/developers/reference/cli)

实现核对日期：2026-09-07。接口返回值另以已安装的官方 CLI、本地运行时和在线 SDK 交叉核对。
