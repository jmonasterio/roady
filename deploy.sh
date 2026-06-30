#!/usr/bin/env bash
# Deploy roady to Cloudflare Pages → https://roady.argw.com
#
# Prereqs: Cloudflare credentials in ../cf-migration/.env
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
# See DEPLOY.md for details (and deploy.bat for the Windows path).
set -euo pipefail
cd "$(dirname "$0")"

# Load Cloudflare credentials, shared across the argw.com CF projects.
if [ -f ../cf-migration/.env ]; then
  set -a && . ../cf-migration/.env && set +a
fi
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN not set — see DEPLOY.md (expected in ../cf-migration/.env)}"

# IPv4-first: Node 22 + undici prefers IPv6, which black-holes on this LAN
# and hangs wrangler's API calls. See ../cf-migration/AGENTS.md.
# NOTE: `wrangler pages deploy .` ships the ENTIRE working directory
# (--commit-dirty=true), and --branch=main publishes to PRODUCTION.
NODE_OPTIONS=--dns-result-order=ipv4first \
  wrangler pages deploy . --project-name=roady --branch=main --commit-dirty=true
