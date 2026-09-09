# Evening Bell for ANNA

This folder is the ANNA App project root. `app.json` contains store metadata and `manifest.json` declares a schema-2 UI-only app. `bundle/` is generated, never hand-edited. No bundled Executa or separate server is required.

From the repository root (one level above this folder):

```sh
pnpm install --frozen-lockfile
pnpm anna:build
pnpm anna:validate
pnpm anna:login
pnpm anna:dev --storage aps --slug evening-bell --llm-app-slug evening-bell
```

Once tested with your ANNA account, run `pnpm anna:publish` from the repository root. This builds, validates and uploads an immutable version. Install/test in ANNA, submit the version for review, then release it after approval. Update `version` in `app.json` for the next release.

See [the complete publishing guide](../ANNA.md) for data migration, permissions, known limits and verification status. The standalone web version remains available with `pnpm dev`.
