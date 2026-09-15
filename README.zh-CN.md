# 晚钟 · Evening Bell

[English](README.md)

**ANNA 版本已加入：** 使用平台模型与个人应用存储，上传步骤见 [ANNA 上线说明](ANNA.md)。下文介绍的是独立网页版。

根据可用时间和精力安排个人目标，用番茄钟专注，通过每日习惯和复盘逐步推进。

**默认显示英语。** 在页面右上角选择 **简体中文**，或在 Settings / 偏好设置中切换。语言选择会保存在当前浏览器，刷新后仍然生效；切换不会重置计划、表单草稿或正在运行的番茄钟。

## 本地运行

安装 Node.js 24 LTS（最低 22.13）和 pnpm 11.19.0，在包含 package.json 的项目根目录运行：

```sh
npm install -g pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

打开终端显示的 Local 地址，通常是 http://localhost:3000。首次安装依赖后，Windows 也可以双击 **start.cmd** 或 **启动.cmd**。启动器会从 PATH、常见安装目录及本机已有的 Codex 工作区运行环境查找 Node.js，服务就绪后自动打开浏览器。使用时保持启动窗口开启；如果启动失败，先查看窗口中的错误提示，再按键关闭。

生产构建和本地运行：

```sh
pnpm build
pnpm start
```

这只在本机运行，不会发布到公网。

## 使用流程

1. 点击“新建计划”，输入目标、完成标准和可选截止时间，添加或生成子任务。
2. 点击“我到家了，安排今晚”，确认今天的可用时间、精力和固定事务。
3. 检查预览，可以改时间、移除或锁定任务，确认后采纳。
4. 到安排时间后开始专注，支持暂停、继续和提前结束。
5. 计时结束后，明确选择“任务完成”“还需继续”或“今天先到这里”。
6. 在“专注记录”查看投入和复盘，在“每日习惯”设置重复任务，在“日历”查看截止日期。

示例目标使用添加时所选的语言。偏好设置中可以打开“10 秒演示番茄”并保存，演示记录不计入正式专注统计。

## 语言与原有中文数据

界面、日期、提示、排程说明和后续 AI 请求会使用所选语言。你自己填写的名字、计划、任务、心情、复盘和反馈保持原样，原有中文记录不会被改写。已经保存的示例或 AI 生成内容也不会因切换界面语言而自动重写。

本地助手支持中英文指令：

- 晚半小时开始 / Start 30 minutes later
- 很累，只想做半小时 / I'm tired, I only have 30 minutes
- 今天休息 / Rest today

## 可选 AI 配置

不配置密钥时，排程、计时、记录和本地任务拆分仍可使用。

复制 .dev.vars.example 为 .dev.vars，填写后重启：

```dotenv
AI_API_KEY="你的密钥"
AI_BASE_URL="https://你的服务地址/v1"
AI_MODEL="模型名称"
```

服务需兼容 POST /chat/completions。AI_BASE_URL 不包含 /chat/completions。真实环境文件不进入 GitHub 上传包，密钥只由服务端读取。

主动使用 AI 时，相关目标、任务、习惯、报到信息或聊天内容会发送到你配置的服务商；请求中会指定当前语言。

## 检查与 GitHub 文件整理

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

应用运行时还可以执行 pnpm smoke，检查页面及中英文接口。打包源码：

```sh
pnpm package:github
```

输出位置：

- releases/evening-bell-github/：整理后的仓库文件。
- releases/evening-bell-github.zip：同一份文件的压缩包。
- releases/evening-bell-github-manifest.json：文件清单和 SHA-256 校验值。

上传时使用整理后文件夹里的内容作为仓库根目录，包含隐藏配置文件。不要上传 node_modules、真实 .env / .dev.vars、构建缓存或个人数据备份。具体步骤见 [GITHUB.md](GITHUB.md)。

## 当前范围

这是本地网页应用，尚未打包 Android / iOS 安装包，没有账号或跨设备云同步。不同浏览器、域名或端口使用各自的数据。

网页关闭、系统休眠或后台受到限制时，无法保证准时系统通知；重新打开会恢复计时。离线恢复需要先成功访问并缓存资源。反馈仅保存在本机，没有配置接收服务器。

**当前尚未完成 Anna 平台的应用格式适配。** 整理 GitHub 源码与提交 Anna 是两件独立的工作。当前构建包含服务端接口，也不能直接把完整应用作为纯静态网站部署到 GitHub Pages。

[架构说明（英文）](docs/architecture.md) · [验证指南（英文）](docs/verification.md) · [原始需求](docs/requirements.zh-CN.md) · [原始验收说明](docs/acceptance.zh-CN.md)
