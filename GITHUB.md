# Uploading Evening Bell to GitHub

The repository root is the directory containing **package.json**, **README.md**, **app/**, and **lib/**.

## Use the prepared package

Run **pnpm package:github** to create:

- **releases/evening-bell-github/** — ready-to-upload repository files.
- **releases/evening-bell-github.zip** — the same files in a ZIP, including dotfiles.
- **releases/evening-bell-github-manifest.json** — relative paths and SHA-256 checksums.

The packaging script copies a defined set of source directories and configuration files. It excludes Git history, node_modules, build output, local caches, real environment files, and personal JSON exports. Rerunning it replaces only its own generated package.

## Upload through the GitHub website

1. Create an empty repository using your preferred name and visibility.
2. Open **Add file → Upload files**.
3. Upload the contents of the prepared folder, so package.json appears at the repository root.
4. Include hidden files such as .gitignore, .npmrc, .editorconfig, .gitattributes, and .openai/hosting.json.
5. Commit the upload.

Upload the extracted source files for a browsable repository. A ZIP may be attached to a GitHub release, but it does not replace a source checkout.

## Or use Git from the prepared folder

Replace YOUR_REPOSITORY_URL with the URL of the repository you created.

```sh
git init -b main
git add .
git status
git commit -m "Add bilingual Evening Bell app"
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

If working directly in an existing Git checkout, preserve its history and remote configuration instead of initializing another repository.

## What belongs in the repository

| Include                                        | Exclude                                 |
| ---------------------------------------------- | --------------------------------------- |
| app, components, hooks, lib, public            | node_modules, .pnpm-store               |
| tests, scripts, docs                           | dist, .next, .vinext, .wrangler         |
| package.json and pnpm-lock.yaml                | .git and local tool caches from the ZIP |
| TypeScript, Vite, and formatting configuration | real .env and .dev.vars files           |
| .env.example and .dev.vars.example             | private keys and personal data backups  |
| .openai/hosting.json                           | releases and temporary output           |

## 中文操作提示

解压 ZIP 后，把 **evening-bell-github 文件夹里面的文件**作为 GitHub 仓库根目录上传，确保打开仓库就能看见 package.json 和 README.md。

推荐用上面的 Git 命令上传，隐藏文件会自动包含在内。用网页上传时，也要包含 .gitignore 和 .openai/hosting.json 等隐藏文件。

压缩包中没有依赖目录和真实密钥。下载源码的人需要运行 pnpm install --frozen-lockfile 安装依赖。

此次整理没有创建或推送远程仓库；GitHub 上传完成也不代表已经完成 Anna 平台适配或上架。
