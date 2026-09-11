# Verification

## ANNA release review — 2026-09-09

- All 71 regression tests passed after the stale-edit fixes, including five new tests for concurrent settings/goal edits and localized conflict messages.
- TypeScript and source lint checks passed; changed application files were checked again after the fixes.
- Both the standalone production Worker build and ANNA static build passed. The final ANNA bundle contains five files and is about 838 KiB; Vite reports a non-failing chunk-size advisory.
- Official ANNA CLI strict validation passed.
- The remote GitHub README cleanup was merged locally without discarding the current documentation. Source fixes and release notes still need committing and pushing.
- The CLI reports no signed-in accounts. Real model calls, production APS storage, Marketplace installation, browser/phone interaction, upload, review, and public release remain unverified.

The existing local legacy-runtime HTTP/RPC result from September 7 was not rerun for these edit guards. It covers host handshake, SDK/assets, storage round trips and permission rejection, but does not establish production APS or real-account behavior. See [the release and competition checklist](ANNA-RELEASE-CHECKLIST.zh-CN.md) for remaining steps and known capacity/first-write limitations.

Run from the repository root:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Tests cover scheduling constraints, timer recovery and settlement, habits, calendars, notification cleanup, old-state migration, language preferences, bilingual messages, and English/Chinese time commands.

The language checks verify that English is the default, saved preferences are independent of application state, blocked storage is handled, system-message parameters preserve user content, and existing timers and Chinese records survive language changes.

## HTTP checks

Start pnpm dev in another terminal, then run:

```sh
pnpm smoke
```

Set SMOKE_URL if the server prints a different address. The checks cover the English page, configuration route, PWA resources, input validation, and local English/Chinese API responses. When a real model is configured, the smoke check skips calls that would contact that provider.

## Manual acceptance

1. Open a fresh browser profile. The interface should begin in English.
2. Enter text in an unsaved goal or habit form. Switch languages using the top bar. The draft should remain intact.
3. Choose Simplified Chinese, refresh, and verify the choice is retained.
4. Open a second tab. Changing language in one tab should update the other.
5. Check Today, My plans, Calendar, Daily habits, Focus history, Settings, the feedback dialog, and the notification center in both languages.
6. Add sample goals in the chosen language. Existing goals should not change.
7. Try English and Chinese check-in commands and compare the resulting previews.
8. Start a timer, switch language, and verify elapsed time and progress remain correct.
9. Enter Chinese content in a goal, reflection, or feedback field while using English. It should stay as entered.
10. With your model configured, try a fresh request in each language.

Automated checks do not establish real phone lock-screen notification behavior, third-party model availability, or Anna submission compatibility.

## Recorded automated results — 2026-09-07

- 57 regression tests passed, including 12 localization tests.
- TypeScript and source lint checks passed.
- The production Worker build passed.
- HTTP checks passed against both the development server and the built Worker, including English and Chinese local API responses.
- The prepared source folder also passed all 57 regression tests without relying on the original checkout's installed dependencies.

Real model-provider calls and manual browser or phone interaction checks were not part of these automated results.
