# Deploying roady

roady is a static PWA + Pages Functions deployed to **Cloudflare Pages**
(project `roady`, production domain <https://roady.argw.com>). The
same-origin API proxy lives in `functions/__api__/[[path]].js`, which
forwards to the **`mycouch` Worker** via the service binding in
`wrangler.toml`. There is no build step — assets are served as-is.

## TL;DR

```bash
./deploy.sh        # macOS/Linux or Git Bash (where `node` works)
deploy.bat         # Windows dev box (WSL `node` is broken — use this)
```

Both run, in effect:

```
NODE_OPTIONS=--dns-result-order=ipv4first \
  wrangler pages deploy . --project-name=roady --branch=main --commit-dirty=true
```

## Prerequisites

Cloudflare credentials, shared across the argw.com CF projects, live in
`../cf-infra/.env`:

```
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
```

Both deploy scripts source this file automatically. `wrangler login`
(interactive OAuth) does **not** work headless — the API token is required.

## What actually ships (and what doesn't)

`wrangler pages deploy .` uploads the **entire local working directory**
(static assets + `functions/`) straight to Cloudflare with
`--commit-dirty=true`. Deployment reads from **disk, not git**:

- **Git/GitHub is NOT part of deploying.** There is no GitHub Actions or
  push-to-deploy pipeline. `git push` only updates version control — it
  never triggers a deploy. A deploy happens *only* when you run
  `./deploy.sh` / `deploy.bat` locally.
- **Uncommitted WIP goes live too** (it's read from disk). Committing is
  for history, not a deploy prerequisite — but keeping git in sync means
  the repo reflects what's actually live.
- `--branch=main` publishes to **production** (roady.argw.com), not a
  preview. The command prints a `*.roady-bxp.pages.dev` build alias; the
  custom domain updates within seconds.

## Gotchas

- **IPv6 black hole:** Node 22 + undici prefers IPv6, which dead-ends on
  this LAN and hangs wrangler's API calls (`fetch failed`). The
  `--dns-result-order=ipv4first` prefix (set by both scripts) fixes it;
  without it, retry 2–5×. See `../cf-infra/AGENTS.md`.
- **Windows / WSL:** `node` is broken under WSL on the dev box, so a bash
  `deploy.sh` fails with an I/O error. Use `deploy.bat`, which calls
  `npx wrangler` through the Windows Node install.
- **Service worker cache:** after deploy, hard-refresh (or DevTools →
  Application → Service Workers → Update) — `sw.js` is network-first but
  the browser may serve the old SW for one load.

## Backend is separate

The API (`/api/...`, `/__api__/...`) is served by the **`mycouch` Worker**
(Rust, source in `../mycouch-rs/workers/mycouch`), deployed independently
(`wrangler deploy` from that crate, backed by a D1 database). Deploying
roady never touches the backend, and vice-versa. The legacy Python
`../mycouch` (FastAPI) is **not** what serves production.
