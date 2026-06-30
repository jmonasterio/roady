@echo off
REM Deploy roady to Cloudflare Pages -> https://roady.argw.com  (Windows)
REM Use this on the dev box: WSL `node` is broken there, so deploy.sh can't run.
REM Loads CF creds from ..\cf-migration\.env (CLOUDFLARE_API_TOKEN/ACCOUNT_ID).
setlocal
cd /d "%~dp0"

if not exist "..\cf-migration\.env" (
  echo ERROR: ..\cf-migration\.env not found ^(holds CLOUDFLARE_API_TOKEN^). See DEPLOY.md
  exit /b 1
)

REM Read KEY=VALUE lines; pull the two creds we need.
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("..\cf-migration\.env") do (
  if /i "%%A"=="CLOUDFLARE_API_TOKEN"  set "CLOUDFLARE_API_TOKEN=%%B"
  if /i "%%A"=="CLOUDFLARE_ACCOUNT_ID" set "CLOUDFLARE_ACCOUNT_ID=%%B"
)
if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo ERROR: CLOUDFLARE_API_TOKEN not found in ..\cf-migration\.env
  exit /b 1
)

REM IPv4-first avoids the IPv6 black hole that hangs wrangler (see cf-migration\AGENTS.md).
REM Ships the ENTIRE working dir; --branch=main publishes to PRODUCTION.
set "NODE_OPTIONS=--dns-result-order=ipv4first"
npx wrangler pages deploy . --project-name=roady --branch=main --commit-dirty=true
