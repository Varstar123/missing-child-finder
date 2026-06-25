# Missing Child Finder

A simple website that uses face matching to help reunite missing children with
their families.

- A family **reports a missing child** with a clear photo and the date they went missing.
- Anyone who **finds a child** later **takes or uploads a photo** (on a phone they
  can use the camera right then) and can **auto-fill where they saw the child**.
- The site **compares the faces**. If the match is **80% or higher**, an **alert**
  with the found photo is created and the registered family is **notified by email
  or text**.

A dedicated [**How it works**](public/how-it-works.html) page explains the purpose,
step-by-step usage for parents and finders, photo tips, guidelines, and privacy.

## How the matching works

The face work runs **in the visitor's browser** with
[face-api.js](https://github.com/vladmandic/face-api): it detects the face and
produces a 128-number "face fingerprint." The server compares fingerprints by
distance and turns that into a percentage (distance `0` = `100%`, `0.5` = `80%`).
Matches at/above 80% create an alert. No photos are sent to any third-party AI
service.

## Architecture

| Part | What it is |
|------|------------|
| `public/` | The website (HTML/CSS/JS) + the AI library and model weights, served as static files. `js/photo-input.js` is the reusable camera/upload picker. |
| `api/` | Serverless functions (Vercel): `children`, `search`, `stats`, `alerts` |
| `lib/` | Shared server code: Supabase client, match math, photo upload, alert delivery (`notify.js`) |
| `server.js` | Thin **local-dev** server that mounts the same `api/` handlers (not used on Vercel) |
| Supabase | Postgres for records (`children`, `alerts`) + Storage for photos |

## One-time Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), and run it
   (creates the tables and the public `photos` bucket).
3. In **Project Settings → API**, copy the **Project URL** and the **service_role** key.

## Run locally

Requires [Node.js](https://nodejs.org) 18+.

```sh
npm install
npm run setup        # downloads the AI models into public/ (only needed once / if missing)
cp .env.example .env # then paste your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm start            # http://localhost:4321
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Import** the GitHub repo (Framework Preset: **Other** — no build needed).
3. Add two **Environment Variables**: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   (the service_role key from Supabase).
4. **Deploy.** Vercel serves `public/` as the static site and runs `api/` as functions.
   - If the pages don't load, set **Project Settings → Build & Development → Output Directory** to `public`.

## Sending real alerts (email / SMS)

When a strong match is found the alert is always recorded and shown on the Alerts
page. To also **push it to the family's phone or inbox**, configure either or both
providers (both optional — without them the site still works, it just doesn't send):

- **Email — [Resend](https://resend.com):** set `RESEND_API_KEY` and `ALERT_FROM_EMAIL`
  (the from-address must be on a domain you verified in Resend).
- **SMS — [Twilio](https://twilio.com):** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  and `TWILIO_FROM_NUMBER` (your Twilio number in `+15551234567` form).
- Set `APP_URL` (your deployed URL) so the message can link back to the alert.

Add these as environment variables (locally in `.env`, on Vercel in **Project Settings
→ Environment Variables**). Delivery is best-effort and logged per alert in the
`notified` / `notify_error` columns; a failure never blocks the search. The matching
logic in `lib/notify.js` is what fans the alert out to each matched family.

> If you set up Supabase **before** this feature, run the two `alter table` lines at the
> bottom of [`supabase/schema.sql`](supabase/schema.sql) once to add the `notified` and
> `notify_error` columns.

## Notes and limits

- **This assists a human search; it does not replace the police or child-protection
  authorities.** Face matching can be wrong — every possible match must be verified by
  people before any action is taken.
- The **service_role key is secret**: it's only used server-side (in `api/` / `server.js`)
  and must never be exposed to the browser or committed.
- The camera capture and auto-location features need **HTTPS** (Vercel provides this;
  `localhost` is also treated as secure). Reverse-geocoding of the auto-fetched location
  uses OpenStreetMap and falls back to raw coordinates if unavailable.
