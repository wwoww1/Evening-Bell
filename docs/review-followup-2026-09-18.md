# Review follow-up — 2026-09-18

## Current status

Local corrections and verification are complete for the reproducible issues below. No app version, screenshot, listing update, reviewer reply, or resubmission was published during this check. Production ANNA still needs a final test with the updated build.

| Review item                   | Local result                                                                                                                                                                                                                                                                          | Remaining release check                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| English listing content       | English screenshots prepared; listing name and description are English; screenshot references use new `-en.jpg` filenames.                                                                                                                                                            | Publish screenshot files and update the actual ANNA listing.                                                                                                                 |
| Start Focus connection error  | Fixed a definite error-classification bug: local schedule/dependency validation was being reported as a generic ANNA connection failure. Only actual host storage requests now receive connection/permission error mapping. Scheduled focus and free Pomodoro pass local ANNA checks. | Retest the updated build on production ANNA. Without the reviewer's underlying error or a production reproduction, the original failure's exact cause cannot be established. |
| Habit missing from Today/plan | Due habits appear on Today immediately. The scheduling action explicitly opens a preview. Preview and acceptance report fully scheduled habits and name any that did not fit. Acceptance returns to Today. Walking persists as a real 15-minute block.                                | Verify the same flow in the uploaded version.                                                                                                                                |
| Background reminders          | No background delivery guarantee added.                                                                                                                                                                                                                                               | Product/platform follow-up; the email explicitly says this is not required for the current review.                                                                           |

## Verification

- 90 unit/regression tests passed, including ANNA transport-vs-validation errors, habit inclusion, insufficient-time and partial-time previews, scheduled Start Focus, persistence and conflict handling.
- TypeScript and lint checks passed; ANNA bundle build and strict manifest validation passed.
- Official local ANNA harness ran with `--no-llm --storage legacy` on port 5188. `ANNA_SMOKE_URL=http://localhost:5188 node scripts/smoke-anna.mjs` passed actual local RPC, SDK/assets, grant checks, state save/reload, a 15-minute Walking block, scheduled Start Focus, free Pomodoro and session persistence. This is not production APS validation and made no model requests.
- Browser, standalone web: created Walking (15 minutes), observed it on Today before scheduling, saw the insufficient-time warning, extended availability, accepted a 1/1-habit preview, and reloaded to confirm the 22:31–22:46 Walking block remained.
- Browser, local ANNA SDK iframe: started a Pomodoro without a plan, ended it, found the session in daily history and saved a note successfully.
- Inspected the English screenshots in `docs/screenshots/`.

The previously committed checkpoint is `7e70442`. These follow-up fixes are local working-tree changes.
