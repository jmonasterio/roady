@echo off
REM Deploy roady to Cloudflare Pages -> https://roady.argw.com  (Windows)
REM Use this on the dev box: WSL `node` is broken there, so deploy.sh can't run.
REM Loads CF creds from ..\cf-infra\.env (CLOUDFLARE_API_TOKEN/ACCOUNT_ID).
setlocal
cd /d "%~dp0"

if not exist "..\cf-infra\.env" (
  echo ERROR: ..\cf-infra\.env not found ^(holds CLOUDFLARE_API_TOKEN^). See DEPLOY.md
  exit /b 1
)

REM Read KEY=VALUE lines; pull the two creds we need.
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("..\cf-infra\.env") do (
  if /i "%%A"=="CLOUDFLARE_API_TOKEN"  set "CLOUDFLARE_API_TOKEN=%%B"
  if /i "%%A"=="CLOUDFLARE_ACCOUNT_ID" set "CLOUDFLARE_ACCOUNT_ID=%%B"
)
if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo ERROR: CLOUDFLARE_API_TOKEN not found in ..\cf-infra\.env
  exit /b 1
)

REM IPv4-first avoids the IPv6 black hole that hangs wrangler (see cf-infra\AGENTS.md).
REM Ships the ENTIRE working dir; --branch=main publishes to PRODUCTION.
set "NODE_OPTIONS=--dns-result-order=ipv4first"
npx wrangler pages deploy . --project-name=roady --branch=main --commit-dirty=true
