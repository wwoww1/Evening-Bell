# Architecture

Evening Bell uses React 19, TypeScript, Vinext/Vite, Tailwind, and Base UI/Shadcn. The server build targets a Cloudflare Worker; local development uses Wrangler.

## Data and scheduling

Personal application state is stored under afterhours.state.v1 in the current browser. lib/store.ts handles updates and cross-tab synchronization; lib/persistence.ts restores older records.

The scheduler in lib/scheduler.ts accounts for availability, commitments, dependencies, fixed and locked tasks, breaks, and shared deadline capacity. Timer transitions are in lib/timer.ts and lib/actions.ts. Language changes do not alter these records or restart a timer.

## Localization

- lib/messages.ts contains Chinese source keys and English translations.
- lib/i18n.ts provides pure, request-safe translation, interpolation, and preference helpers.
- components/planner/language-provider.tsx exposes the current locale through React context and useSyncExternalStore.
- components/planner/language-switcher.tsx provides the selector in the top bar and Settings.
- The preference key evening-bell.language is separate from the planning state.
- Server rendering defaults to English; hydration then restores an explicitly saved preference.
- Changing language updates document language, title, description, calendar labels, and dates.
- Original Chinese system messages saved in older records are localized when displayed.
- User-authored content and previously saved AI text are retained as entered.

New UI copy belongs in the message catalogue. Use numbered parameters for dynamic values so names are interpolated without translation or HTML interpretation.

## Optional AI

app/api/agent/route.ts supports decompose, prioritize, and coach requests. Each request carries its own language, defaulting to English; no shared server-wide locale is mutated. Credentials stay on the server.

The model suggests task breakdowns and ordering. Local rules validate dependencies, time windows, and scheduling feasibility. An ordering suggestion does not directly write the user's schedule.

## Packaging

scripts/package-github.mjs creates a source-only folder and ZIP from explicit allowlists. It retains build configuration and lockfiles and excludes installed dependencies, credentials, generated output, and personal state. It does not publish anywhere.

The existing .openai/hosting.json is a required build input. Anna manifests and an Anna Runtime integration have not been added in this change.
