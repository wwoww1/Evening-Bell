# Evening Bell

[简体中文](README.zh-CN.md)

**ANNA App:** A dedicated ANNA build now uses the platform's model and per-user storage. See [ANNA deployment](ANNA.md). The instructions below describe the standalone web version.

A personal evening planner that turns goals into small, actionable steps. Plan around your available time and energy, build daily habits, and track real focus time with a Pomodoro timer.

**English is the default.** Switch to **简体中文** in the top bar or Settings. The app remembers your choice in this browser without reloading the page or resetting a timer.

## Run locally

Use Node.js **24 LTS** (minimum 22.13) and pnpm **11.19.0**.

```sh
npm install -g pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

Run these commands in the repository root, alongside package.json. Open the Local URL printed by the server, usually http://localhost:3000.

On Windows, after installing dependencies, double-click **start.cmd** or **启动.cmd**. The launcher looks for Node.js on PATH, in standard installation folders, and in the installed Codex workspace runtime. It opens your browser when the server is ready. Keep the server window open while using the app. If startup fails, the window shows the error before asking you to close it.

For a production build running locally:

```sh
pnpm build
pnpm start
```

This starts the built Cloudflare Worker locally through Wrangler. It does not publish the app online.

## Try the main workflow

1. Select **New plan**, enter a goal and completion criteria, then add tasks or generate a task draft.
2. Select **I'm home. Plan my evening** and enter your available time, energy, and any fixed commitments.
3. Review the schedule, adjust or lock tasks, then select **Accept this plan**.
4. Start a focus session when its scheduled time arrives. Pause, resume, or finish early as needed.
5. Confirm **Task complete**, **More to do**, or **Call it a day**. Time spent does not automatically mark a task complete.
6. Review **Focus history**, add **Daily habits**, or check upcoming deadlines in **Calendar**.

You can try sample goals from the empty Today view. They use the current language and do not create fictional completion records.

For a quick demonstration, enable the **10-second demo timer** in Settings and save. Demo sessions are labelled and excluded from actual focus totals.

## Features

- Goals and tasks with completion criteria, priorities, deadlines, estimates, prerequisites, and fixed start times.
- Scheduling with shared time budgets, breaks, preparation, buffer time, locked tasks, and overnight availability.
- Editable previews, rescheduling, undo, and postponing tasks for today.
- Daily habits with repeat days, duration, energy, pause, and per-day completion.
- Timestamp-based focus timers that recover elapsed time after reopening and avoid duplicate records.
- Focus history, daily reflections, a deadline calendar, and a notification center.
- In-app reminders, optional system notifications, and sound.
- Device-local persistence, cross-tab synchronization, JSON export, and data controls.
- English and Simplified Chinese interfaces, date formatting, system messages, and optional AI replies.
- PWA metadata and caching of previously visited production resources.

## Languages and existing data

The language selector changes application labels and system messages immediately. The default stays English even on a device configured in Chinese, unless you explicitly choose Chinese in the app.

Your names, goals, tasks, moods, reflections, and feedback remain exactly as entered. Existing Chinese records are preserved. Sample content and newly generated AI text use the language selected when they are created; switching languages does not rewrite saved user or AI content.

Local assistant commands work in both languages, for example:

| English                           | 简体中文           |
| --------------------------------- | ------------------ |
| Start 30 minutes later            | 晚半小时开始       |
| I'm tired, I only have 30 minutes | 很累，只想做半小时 |
| Rest today                        | 今天休息           |

Translations are maintained in **lib/messages.ts**. Language preferences are separate from planning data, so changing languages does not reset your plan or timer.

## Optional AI service

Core planning, timers, records, and local task breakdown work without an API key.

Copy **.dev.vars.example** to **.dev.vars**, set your provider values, and restart:

```dotenv
AI_API_KEY="your-key"
AI_BASE_URL="https://your-provider.example/v1"
AI_MODEL="your-model-name"
```

The provider must support POST /chat/completions. Task breakdown and ordering requests expect JSON object output. Use the service root URL, without /chat/completions.

Keys are read on the server. Real environment files are ignored by Git and excluded from the GitHub package. **.env.example** documents the same variables for environments using process environment variables.

When you request AI assistance, the relevant goal, task, habit, check-in, or chat content is sent to your configured model provider. The selected language is included in the request. Invalid or unavailable AI ordering falls back to local scheduling.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

With the local server running, check the HTTP routes and both API languages:

```sh
pnpm smoke
```

The smoke check makes no model calls when a real provider is configured. Its local-mode checks run when no AI service is configured.

## Repository layout

```text
app/                    Page, layout, styles, and optional AI API route
components/planner/     Planner views, dialogs, and language controls
components/ui/          Shared interface components
hooks/                  Shared React hooks
lib/                    Scheduling, timers, storage, and bilingual messages
public/                 Icons, PWA manifest, and service worker
tests/                  Business, timer, habit, and language regression tests
scripts/                Startup, HTTP checks, and GitHub packaging
docs/                   Architecture, verification guide, original Chinese requirements
.openai/hosting.json     Build configuration required by the existing Sites integration
```

## Prepare for GitHub

This repository root contains the files needed for development. Dependencies, build output, local caches, personal data exports, and actual environment files should stay out of Git.

```sh
pnpm package:github
```

This produces **releases/evening-bell-github/** and **releases/evening-bell-github.zip**, with hidden configuration files included. The package contains source and documentation, without Git history or installed dependencies. See [GITHUB.md](GITHUB.md) for upload instructions.

## Current scope

This is a browser application. There are no native Android/iOS packages, accounts, or cross-device cloud synchronization. Browser, domain, and port changes use separate local data stores.

Closing the page, device sleep, and browser background restrictions may delay notifications. Reopening restores the timer using elapsed time. Offline recovery requires an earlier successful visit and cached resources.

Feedback is saved on the device and can be exported; there is no configured feedback collection server.

The project has **not yet been adapted to the Anna App package format**. Uploading this repository to GitHub does not complete Anna submission or deployment. The existing build includes a server API, so it cannot be hosted in full on GitHub Pages as a static-only website.

See [Architecture](docs/architecture.md), [Verification](docs/verification.md), and the [original requirements in Chinese](docs/requirements.zh-CN.md).
