# Cloudflare Migration Prep

This repo is now prepared to run email through an API endpoint instead of direct SMTP inside the Next.js server runtime.

## What was added

1. `functions/src/index.ts`
- Added `mailerApi` HTTPS function.
- This endpoint sends email using Nodemailer from Firebase Functions (Node runtime).
- Protected with `x-mailer-secret` header (`MAILER_API_SECRET`).

2. `src/lib/mailer.ts`
- Added support for API-based email delivery.
- If `MAILER_API_URL` is set, email is sent through API.
- If `MAILER_API_URL` is not set, existing direct SMTP fallback still works.

## Required environment variables

### Next.js app env
- `MAILER_API_URL` = deployed URL of `mailerApi`
- `MAILER_API_SECRET` = shared secret value

### Firebase Functions env
- `MAILER_API_SECRET` = same shared secret
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- Optional:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_SERVICE` (default: `gmail`)

## Deployment order

1. Deploy Firebase Functions (includes `mailerApi`).
2. Set `MAILER_API_URL` and `MAILER_API_SECRET` in app hosting env.
3. Redeploy web app.

## Why this helps Cloudflare migration

Cloudflare Workers/Pages runtime is not a Node SMTP runtime. By moving SMTP to an API endpoint, the web app can run on Cloudflare while email still sends from Node-based Firebase Functions.

