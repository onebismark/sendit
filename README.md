# Sendit

Device-to-device file sharing by Markmix Digital. Developer: Lord Bismark.

Vite front end, Node.js (Express and Socket.IO) signaling server, WebRTC data channels for the files themselves.
The server only pairs devices. Files travel directly between browsers, or through a TURN relay if a direct route is blocked.

## Run locally
```
npm install
npm run dev
```
Open http://localhost:5173 in two browser windows (or two devices on your network, using your computer's IP address),
copy the room code from the first window, and join it from the second via the Pair page.

## Deploy on Render
1. Push this folder to a GitHub repo.
2. In Render choose New, then Blueprint, and select the repo. `render.yaml` sets everything up.
   (Manual alternative: New Web Service, build `npm install && npm run build`, start `npm start`.)
3. Optional but recommended: add `TURN_URL`, `TURN_USER` and `TURN_PASS` in the service's Environment tab
   so transfers still work behind strict firewalls and mobile networks.
   `TURN_URL` can hold several comma-separated URLs, for example `turn:turn.example.com:3478,turns:turn.example.com:5349`.

## Environment variables
| Name | Purpose |
|---|---|
| PORT | Set by Render |
| ROOM_TTL_MIN | Minutes before a room closes (default 60) |
| TURN_URL, TURN_USER, TURN_PASS | Relay credentials (hosted TURN service or your own coturn) |

## Known limits of this first version
- Rooms live in server memory, so run one instance. Several instances need the Socket.IO Redis adapter.
- Render cannot run a TURN server. Use a hosted TURN service or coturn on a small VPS.
- Received files are collected in browser memory, so very large files can fail on low-memory devices.
- Retry sends the whole file again. Resume from an offset is not built.
- Room codes have about 80,000 combinations. Joins are rate limited per IP, but lengthen the code before a public launch.
- Contact, waitlist and sign-in forms are preview only and do not send or save anything.
- Privacy and terms pages are draft templates that need legal review.
