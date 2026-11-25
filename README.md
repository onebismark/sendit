# Sendit

Device-to-device file sharing by Markmix Digital. Developer: Lord Bismark.

Vite front end, Node.js (Express and Socket.IO) signaling server, WebRTC data channels for the files themselves.
The server only pairs devices. Files travel directly between browsers, or through a TURN relay if a direct route is blocked.

## What is included
- Room codes with two words and four digits, plus a short check phrase both devices must match
- Accept or decline every incoming file
- Large files streamed to disk (Chrome and Edge on a computer), memory elsewhere
- Retry continues from where a file stopped
- QR code in the workspace; scan it with a phone camera to open the Pair page with the code filled in
- Installable web app with a share target, so other apps can share files into Sendit
- Contact and waitlist forms saved to Postgres and/or emailed
- Per-page titles, descriptions, social previews, sitemap and robots.txt
- Automatic fallback to the relay when a direct connection fails (needs TURN)

## Run locally
```
npm install
npm run dev
```
Open http://localhost:5173 in two browser windows. See TESTING.md for a real-device checklist.

## Deploy on Render
1. Push this folder to GitHub.
2. In Render choose New, then Blueprint, and select the repo. `render.yaml` creates the web service and a Postgres database.
3. Set the environment variables below in the service's Environment tab.
4. To stop the service sleeping, change `plan: free` to `plan: starter` in `render.yaml` (paid) and commit.
   Free Postgres on Render is time-limited, so check its current terms or upgrade it before you rely on saved signups.

## Environment variables
| Name | Purpose |
|---|---|
| PORT | Set by Render |
| SITE_URL | Your public address, for canonical links and previews, e.g. https://sendit.example.com |
| ROOM_TTL_MIN | Minutes before a room closes (default 60) |
| DATABASE_URL | Postgres connection string (set automatically by render.yaml). Set PGSSL=1 if your host needs SSL |
| RESEND_API_KEY, CONTACT_TO, MAIL_FROM | Email each form submission to you through Resend (optional if you use Postgres) |
| TURN_URL | One or more relay addresses, comma separated, e.g. turn:turn.example.com:3478 |
| TURN_SECRET | Shared secret for your own coturn server (short-lived credentials) |
| TURN_USER, TURN_PASS | Fixed relay credentials from a hosted TURN provider (use these or TURN_SECRET) |

Forms return an error until either DATABASE_URL or the three email variables are set.
Read saved entries with `select * from submissions order by created_at desc;`.

## Your own TURN server
1. Rent a small VPS and point a hostname such as turn.example.com at it.
2. Copy `infra/coturn` to the server, edit `turnserver.conf` (secret, realm, external-ip).
3. Open ports 3478 (TCP and UDP), 5349 and UDP 49152-65535, then run `docker compose up -d`.
4. In Render set `TURN_URL=turn:turn.example.com:3478` and `TURN_SECRET` to the same secret.
For `turns:` over TLS, add a certificate to the config and list `turns:turn.example.com:5349` too.

## Still to do before a public launch
- Test on real devices and networks (TESTING.md)
- Have a lawyer review the privacy and terms pages; the text is a draft
- Rooms live in server memory, so run one instance, or add the Socket.IO Redis adapter to scale
- Sign in is still a preview form
- Streaming to disk is not available in Safari or Firefox, which keep files in memory
