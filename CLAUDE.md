# CLAUDE.md

Guidance for working in this repository.

## What this is

A minimal **browser-based phone** built on Twilio Programmable Voice. An
Express server issues short-lived access tokens and answers Twilio webhooks; a
single static page (`public/index.html`) registers as a Twilio Voice client so
you can receive and place calls from the browser.

## Layout

- `server.js` — the entire backend. Express app exported as the module so it
  runs both locally (`app.listen`) and as a Vercel serverless handler.
- `public/index.html` — the whole frontend (HTML + CSS + JS inline). Uses the
  vendored Twilio Voice SDK at `public/vendor/twilio.min.js`.
- `set-webhook.js` — helper to point a Twilio number's Voice webhook at the
  current deployment.
- `sim-voice.sh` — shell helper to simulate an inbound call.
- `vercel.json` — routes all requests to `server.js`.
- `.env` — secrets (gitignored). Copy from `.env.example`.

## Server endpoints (`server.js`)

- `GET /config` — returns the client identity the browser registers with.
- `GET /token` — mints a Twilio `AccessToken` with a `VoiceGrant`
  (`incomingAllow: true`) so the browser can receive calls.
- `POST /simulate-call` — places a Twilio call to `client:<identity>` to ring
  the browser without a second phone.
- `POST /voice-test` — returns simple TwiML to confirm the webhook is reachable.
- `POST /voice` — main webhook. Branches on `From`: `client:*` is an **outbound**
  browser call (dials the `To` number); anything else is **inbound** (dials the
  browser client with `timeout: 30` and `action: /dial-status`).
- `POST /dial-status` — runs after the inbound `<Dial>` ends. If
  `DialCallStatus !== 'completed'` it says "Nobody answered. Goodbye.";
  on `completed` it emits nothing so Twilio hangs up quietly.

## Call teardown behavior

The browser's `wireCall()` handles `disconnect` / `cancel` / `reject` / `error`
and always converges on `clearCall()`, which resets the UI to "Ready". On the
server, only inbound calls have an `action` handler (`/dial-status`); outbound
calls just end when either side hangs up.

## Environment

Required: `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`.
Optional (for placing calls): `TWILIO_TWIML_APP_SID`, `TWILIO_CALLER_ID`.
Also: `CLIENT_IDENTITY` (browser client label), `PORT`.

## Running locally

```
npm install
npm start            # serves on PORT (default 3000; .env may set 4000)
ngrok http <PORT>    # expose for Twilio webhooks
```

Point the Twilio number's Voice webhook (POST) at `https://<public-url>/voice`.

## Conventions

- Never commit `.env` — it holds live Twilio credentials and is gitignored.
- Frontend is plain vanilla JS in one file; keep it dependency-free.
- `index.html` is formatted with Prettier defaults (2-space indent).
