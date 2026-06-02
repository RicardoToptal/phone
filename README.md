# Browser Phone (Twilio WebRTC)

Answer (and place) calls to your Twilio number directly in your browser — no forwarding to a cellphone. The browser registers as a Twilio Voice **client** and the call rings in the tab; you talk through your computer mic/speakers.

## How it works

```
Caller ──▶ Twilio number ──▶ POST /voice (webhook) ──▶ <Dial><Client>agent</Client></Dial> ──▶ your browser
```

The browser gets a short-lived access token from `/token`, registers with identity `agent`, and Twilio rings it.

## Setup

### 1. Get Twilio credentials
- **Account SID** — Twilio Console home (starts with `AC`).
- **API Key** — Console → Account → *API keys & tokens* → create a **Standard** key. You get an `SK...` SID and a secret (shown once).

```bash
cp .env.example .env
# fill in TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET
```

### 2. Run it
```bash
npm install
npm start          # http://localhost:3000
```

### 3. Expose with ngrok
```bash
ngrok http 3000
```
Copy the `https://....ngrok-free.app` URL.

### 4. Point your number at the webhook
Twilio Console → **Phone Numbers → Manage → Active numbers → (your number)** → *Voice Configuration*:
- **A call comes in** → Webhook → `https://<your-ngrok-url>/voice` → **HTTP POST** → Save.

Open `http://localhost:3000`, allow microphone access, wait for "Ready", then call your Twilio number. It rings in the browser.

## Optional: placing outbound calls
To also dial out from the browser:
1. Console → **Voice → TwiML → TwiML Apps** → create an app, set its **Voice Request URL** to `https://<your-ngrok-url>/voice` (POST).
2. Put that app's SID in `TWILIO_TWIML_APP_SID` and your Twilio number in `TWILIO_CALLER_ID` in `.env`, then restart.
3. Type a number in the dialer and hit **Call**.

## Notes
- The ngrok URL changes every restart (on the free plan) — re-paste it into the webhook each time. A static ngrok domain or a deploy avoids this.
- `/voice` distinguishes inbound vs outbound by the presence of a `To` param.
- Tokens auto-refresh in the browser before they expire (1h TTL).
