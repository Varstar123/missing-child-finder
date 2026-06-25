# Missing Child Finder

A simple website that uses face matching to help reunite missing children with
their families.

- A family **reports a missing child** with a clear photo and the date they went missing.
- Anyone who **finds a child** later uploads a photo.
- The site **compares the faces**. If the match is **80% or higher**, an **alert**
  with the found photo is created for the registered family.

## How the matching works

When a photo is uploaded, [face-api.js](https://github.com/vladmandic/face-api)
(running in the browser) detects the face and produces a 128-number "face
fingerprint". The server compares fingerprints by distance and converts that to a
percentage: a distance of `0` is `100%`, and `0.5` (a confident same-person match)
is `80%`. Matches at or above 80% create an alert. The threshold lives in
`MATCH_THRESHOLD_PERCENT` in `server.js`.

## Run it

Requires [Node.js](https://nodejs.org) 18+.

```sh
npm install        # install the web server
npm run setup      # download the face-matching models into /public (one time)
npm start          # start the site
```

Then open <http://localhost:4321>. (Set a different port with `PORT=5000 npm start`.)

## Project layout

```
server.js                  Web server, storage, and face comparison
scripts/download-models.js One-time download of the AI library + models
public/                    The website (HTML/CSS/JS) and stored photos
data/db.json               Created at runtime — the records (gitignored)
```

## Notes and limits

- **This assists a human search; it does not replace the police or child-protection
  authorities.** Face matching can be wrong. Every possible match must be verified by
  people before any action is taken.
- **Alerts** are recorded and shown on the Alerts page (what the family would
  receive). To send real email or SMS, add a mailer in `notifyFamily()` in
  `server.js`.
- Storage is a single JSON file, which is fine for a prototype. For real use, move to
  a proper database and add accounts, access control, and data-protection safeguards.
