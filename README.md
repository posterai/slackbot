# PosterChild Slack bot

PosterChild's internal tools in Slack. A [Bolt for JavaScript](https://slack.dev/bolt-js) app on Next.js, deployed to Vercel.

Each capability is a **feature** in `src/features/`. The first one is **review sandboxes**: anyone in the sandbox channel can start, pause or delete a working copy of PosterChild for a pcaicode PR, and see every sandbox's status, with no CLI or GitHub access needed.

## Review sandboxes (`/sandbox`)

| Command | What it does |
|---|---|
| `/sandbox` | Opens a picker: choose a feature (by PR title) and Start/resume, Pause or Delete. |
| `/sandbox status` | Lists every sandbox with its state, when it pauses, its link and password, and buttons to act on it. |
| `/sandbox up #917` | Quick path. Also `stop`/`destroy`, and the argument can be a PR number, branch or part of the PR title. |
| `/sandbox help` | Usage. |

- **Which sandboxes are offered:** open, non-draft pcaicode PRs with the `sandbox` label, plus any sandbox that already exists. To make a feature available, label its PR.
- **How it works:**
  1. The bot posts the request in the channel.
  2. It dispatches pcaicode's `.github/workflows/sandbox.yml` (via the GitHub App) with that message as the thread to reply in.
  3. The workflow posts the URL and password, or a failure link, in the thread.
  - Status comes straight from E2B: pcaicode's sandbox CLI stores the branch and password as sandbox metadata. See pcaicode doc-015.
- **Where it works:** only in channels listed in `SANDBOX_ALLOWED_CHANNEL_IDS`. Elsewhere it answers privately with a pointer to the channel. Deleting asks for confirmation.

## Setup

### 1. GitHub App (owned by the posterai org, not a person)

1. Go to **github.com/organizations/posterai/settings/apps** and click **New GitHub App**.
   - Name: "PosterChild bot". Homepage: any URL. **Webhook: off.**
   - Repository permissions: **Actions: Read and write**, **Pull requests: Read-only**, **Contents: Read-only** (Metadata: Read-only is automatic).
   - Where can this app be installed: *Only on this account*.
2. Generate a private key (`.pem`) and note the App ID.
3. **Install App** on `posterai` with **Only select repositories**: `pcaicode`. Add repos later for new features. The installation ID is the number at the end of the installation page's URL.

### 2. Slack app

1. Go to https://api.slack.com/apps/new → *From an app manifest*, then paste [`manifest.json`](./manifest.json).
2. Install it to the workspace, copy the **Bot User OAuth Token** (`SLACK_BOT_TOKEN`) and, under Basic Information, the **Signing Secret** (`SLACK_SIGNING_SECRET`).
3. Invite the bot to the sandbox channel (`/invite @PosterChild`). Put the channel's ID in `SANDBOX_ALLOWED_CHANNEL_IDS`.
4. In pcaicode, set the `SLACK_SANDBOX_BOT_TOKEN` secret to this bot token, so the workflow's replies come from the same bot.

### 3. Environment

Copy [`.env.example`](./.env.example) to `.env.local` for local dev, or set the same variables in Vercel. Required:

- `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN`.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` and `GITHUB_APP_INSTALLATION_ID`.
- `SANDBOX_ALLOWED_CHANNEL_IDS` and `E2B_API_KEY`.

The other `SANDBOX_*` variables have defaults that match pcaicode. Config is checked on first use, and a missing variable shows up as a clear error in the logs.

### 4. Run locally

```bash
pnpm install
pnpm dev:tunnel   # Next.js + an ngrok tunnel; points the dev app's manifest URLs at it
```

Or with the Slack CLI: `slack app link`, then `slack run`; `.slack/hooks.json` uses the tunnel script.

### 5. Deploy

1. Import the repo in Vercel and set the environment variables.
2. In the Slack app's manifest, set every `url`/`request_url` to `https://<your-vercel-domain>/api/slack/events`.

## Development

```bash
pnpm test    # vitest
pnpm lint    # biome
pnpm build
```

### Adding a feature

1. Create `src/features/<name>/index.ts` exporting a `Feature` (`src/features/types.ts`):
   - `name` and `description`: the description appears in the Home tab's "What I can do".
   - `register(app)`: add commands, actions, views and events with Bolt.
   - `homeBlocks(userId)` (optional): its own Home tab section.
2. Add it to `src/features/index.ts`.
3. Add any slash commands, scopes or events to `manifest.json`.
4. For config, use `defineConfig` from `src/lib/config.ts`. For GitHub, use `getOctokit()` from `src/lib/github.ts` and grant the GitHub App any new permissions or repos.

### Layout

- `src/app/api/slack/events/route.ts`: the one endpoint for Slack events, commands and interactivity.
- `src/lib/bolt/app.ts`: the Bolt app with `@vercel/slack-bolt`'s `VercelReceiver`.
- `src/lib/bolt/listeners/`: app-wide listeners (Home tab) and feature registration.
- `src/features/sandbox/`, which contains:
  - `catalog.ts`: labeled PRs + E2B sandboxes, and name resolution.
  - `run.ts`: posting and dispatching.
  - `views.ts`: Block Kit.
  - `handlers.ts`: Bolt listeners.
