# Missing Child Finder

A simple website that uses face matching to help reunite missing children with
their families.

- A family **reports a missing child** with a clear photo and the date they went missing.
- Anyone who **finds a child** later uploads a photo.
- The site **compares the faces**. If the match is **80% or higher**, an **alert**
  with the found photo is created for the registered family.

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
| `public/` | The website (HTML/CSS/JS) + the AI library and model weights, served as static files |
| `api/` | Serverless functions (Vercel): `children`, `search`, `stats`, `alerts` |
| `lib/` | Shared server code: Supabase client, match math, photo upload |
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

## Notes and limits

- **This assists a human search; it does not replace the police or child-protection
  authorities.** Face matching can be wrong — every possible match must be verified by
  people before any action is taken.
- The **service_role key is secret**: it's only used server-side (in `api/` / `server.js`)
  and must never be exposed to the browser or committed.
- **Alerts** are recorded and shown on the Alerts page. To deliver real email/SMS, add a
  sender (e.g. Resend or Twilio) where noted in `api/search.js`.
