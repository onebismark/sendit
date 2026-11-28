# Sendit

Device-to-device file sharing by Markmix Digital. Developer: Lord Bismark.

## The main page
Cloud sharing is the default: pair with a code or QR code, or drop files first and let Sendit create the code. The Same network tab pairs two devices with no internet by swapping an invitation and a reply (QR, pasted text or a saved file). Both modes have Send, Receive and Text tabs. Text typed on one device appears live on the other. There is no file size limit.

## How devices connect
1. **Direct (best):** after pairing with a room code, the two devices connect straight to each other with WebRTC. Files never touch the server.
2. **Server relay (automatic fallback):** if a direct connection is not possible, Sendit sends the files through its own server. They are encrypted end to end between the two devices (ECDH key agreement and AES-GCM), so the server only forwards unreadable data. No TURN service is needed. The relay is slower and uses your hosting bandwidth.
3. **Same network pairing:** on the Same network tab two devices on the same Wi-Fi or hotspot pair by pointing each device's camera at the other's screen (copy and paste is the fallback). No server and no internet are used. Open Sendit once online on each device first so the app is saved.

Joining someone's room needs their approval: the device that made the code sees Allow or Deny, and can tick a box to accept files from that device automatically (files over 200 MB still ask). A code that is not active counts as a failed attempt, and several in a row are blocked for a few minutes. A room nobody joins closes after 10 minutes.

Both devices see a short check phrase after connecting. If the phrases differ, leave the room.

## Deploy on Render (no local tools needed)
1. Upload this folder's contents to GitHub (package.json must be at the top level).
2. In Render choose New, then Blueprint, and select the repo. `render.yaml` creates the web service and a Postgres database.
3. After the first deploy set `SITE_URL` in the service's Environment tab.

## Environment variables
| Name | Purpose |
|---|---|
| SITE_URL | Your public address, e.g. https://sendit-xxxx.onrender.com |
| ROOM_TTL_MIN | Minutes before a room with two devices closes (default 60) |
| ROOM_WAIT_MIN | Minutes a room nobody has joined stays open (default 10) |
| DATABASE_URL | Postgres connection string (set by render.yaml). Set PGSSL=1 if your host needs SSL |
| RESEND_API_KEY, CONTACT_TO, MAIL_FROM | Email form submissions through Resend (optional if you use Postgres) |
| TURN_URL, TURN_SECRET or TURN_USER and TURN_PASS | Optional. Add your own TURN server only if you want faster relayed transfers. Not needed otherwise |

## Using it offline
- Open the site once with internet on each device. After that the app loads without internet in the same browser.
- Choose Same network, tap Create local invitation on one device, and scan or paste it on the other. Then show the reply back to the first device.
- Both devices must be on the same Wi-Fi or hotspot. An Android hotspot with mobile data off works. Some guest or public Wi-Fi blocks devices from reaching each other.
- Allow camera access if you want to scan the QR codes.

## Known limits
- Rooms live in server memory, so run one instance.
- Relayed transfers use your Render bandwidth allowance. Check your plan's limits.
- Streaming to disk is not available in Safari or Firefox, which keep received files in memory.
- Sign in is still a preview form.
- Privacy and terms pages are drafts that need legal review.
- This code has been syntax-checked but not tested on real devices. Use TESTING.md.
