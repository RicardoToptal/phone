require('dotenv').config();

const express = require('express');
const path = require('path');
const twilio = require('twilio');

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const VoiceResponse = twilio.twiml.VoiceResponse;

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_CALLER_ID,
  CLIENT_IDENTITY = 'agent',
  PORT = 3000,
} = process.env;

function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`\n  Missing required env vars: ${missing.join(', ')}`);
    console.error('  Copy .env.example to .env and fill it in.\n');
    process.exit(1);
  }
}

requireEnv(['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET']);

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Log every request so you can SEE when Twilio hits the server.
app.use((req, res, next) => {
  const stamp = new Date().toISOString();
  console.log(`  ${stamp}  ${req.method} ${req.url}`);
  if (req.method === 'POST' && Object.keys(req.body).length) {
    console.log(`     body: From=${req.body.From || '-'} To=${req.body.To || '-'} CallSid=${req.body.CallSid || '-'}`);
  }
  next();
});

// Serve the browser UI and the vendored Twilio SDK (public/vendor/twilio.min.js,
// produced by the "build" script). Static files only — works locally and on Vercel.
app.use(express.static(path.join(__dirname, 'public')));

// Expose the identity the browser should register with.
app.get('/config', (req, res) => {
  res.json({ identity: CLIENT_IDENTITY });
});

// 1) Browser asks for a short-lived access token to register as a Voice client.
app.get('/token', (req, res) => {
  const identity = CLIENT_IDENTITY;

  const voiceGrant = new VoiceGrant({
    // outgoingApplicationSid is only needed if you also want to place calls.
    outgoingApplicationSid: TWILIO_TWIML_APP_SID || undefined,
    incomingAllow: true, // <-- lets this client RECEIVE calls
  });

  const token = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    { identity, ttl: 3600 }
  );
  token.addGrant(voiceGrant);

  res.json({ identity, token: token.toJwt() });
});

// Lazily-created Twilio REST client (uses your API key).
let restClient;
function getRest() {
  if (!restClient) {
    restClient = twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
      accountSid: TWILIO_ACCOUNT_SID,
    });
  }
  return restClient;
}

// SIMULATE: ring this browser client directly (no second phone needed).
// Twilio places a call TO client:<identity>; when you Answer you hear a message.
app.post('/simulate-call', async (req, res) => {
  if (!TWILIO_CALLER_ID) {
    return res.status(400).json({ ok: false, error: 'Set TWILIO_CALLER_ID in .env first.' });
  }
  try {
    const call = await getRest().calls.create({
      to: `client:${CLIENT_IDENTITY}`,
      from: TWILIO_CALLER_ID,
      twiml:
        '<Response><Say voice="alice">This is a simulated test call to your browser. ' +
        'Answering works. Hanging up in ten seconds.</Say><Pause length="10"/></Response>',
    });
    console.log(`  -> simulated call to client:${CLIENT_IDENTITY}  (${call.sid})`);
    res.json({ ok: true, sid: call.sid });
  } catch (e) {
    console.error('  simulate-call error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// TEST: point your number here to confirm the webhook is reachable.
// You'll hear a spoken message and the call shows up in your localhost logs.
// No browser needed. (Switch the webhook to /voice once this works.)
app.post('/voice-test', (req, res) => {
  const response = new VoiceResponse();
  response.say(
    { voice: 'alice' },
    'Your Twilio webhook is working. Your computer received this call. Goodbye.'
  );
  res.type('text/xml').send(response.toString());
});

// 2) Twilio hits this webhook when your number is called.
//    We answer by dialing your browser client.
app.post('/voice', (req, res) => {
  const response = new VoiceResponse();

  const from = req.body.From || '';
  const to = req.body.To || '';

  // Distinguish direction by the FROM party:
  //  - Browser-placed calls arrive as From="client:<identity>"  -> outbound.
  //  - A real phone calling your Twilio number is anything else  -> inbound.
  if (from.startsWith('client:')) {
    // Outbound: browser -> phone number `to`
    const dial = response.dial({ callerId: TWILIO_CALLER_ID });
    dial.number(to);
  } else {
    // Inbound: PSTN caller -> ring the browser client.
    // action=/dial-status runs AFTER the dial ends so we only play the
    // "nobody answered" message when the call never actually connected.
    const dial = response.dial({
      callerId: from || TWILIO_CALLER_ID,
      timeout: 30,
      action: '/dial-status',
      method: 'POST',
    });
    dial.client(CLIENT_IDENTITY);
  }

  res.type('text/xml').send(response.toString());
});

// Runs after the inbound <Dial> finishes. DialCallStatus tells us what happened:
// 'completed' = the browser answered and the call ended normally -> say nothing.
// anything else (no-answer/busy/failed/canceled) = nobody picked up.
app.post('/dial-status', (req, res) => {
  const response = new VoiceResponse();
  const status = req.body.DialCallStatus;
  if (status !== 'completed') {
    response.say({ voice: 'alice' }, 'Nobody answered. Goodbye.');
  }
  // On 'completed' there are no verbs -> Twilio just hangs up quietly.
  res.type('text/xml').send(response.toString());
});

// TEST HARNESS: point the number's Voice webhook at /outcome/<mode> to make
// an inbound call end a chosen way, e.g. to check how a dialer classifies it.
//   ring       rings the browser client for 60s without answering the caller
//              (answerOnBridge keeps the caller's leg unanswered while it rings)
//   voicemail  rings 20s, then answers with a greeting and records a message
//   busy       refuses with busy (SIP 486)
//   reject     refuses as rejected (SIP 603)
app.post('/outcome/:mode', (req, res) => {
  const response = new VoiceResponse();
  const { mode } = req.params;
  console.log(`  outcome mode: ${mode}`);
  if (mode === 'busy') {
    response.reject({ reason: 'busy' });
  } else if (mode === 'reject') {
    response.reject({ reason: 'rejected' });
  } else if (mode === 'ring' || mode === 'voicemail') {
    const options = { answerOnBridge: true, timeout: mode === 'ring' ? 60 : 20 };
    if (mode === 'voicemail') {
      options.action = '/outcome-voicemail';
      options.method = 'POST';
    }
    response.dial(options).client(CLIENT_IDENTITY);
  } else {
    response.say({ voice: 'alice' }, `Unknown test mode ${mode}. Goodbye.`);
  }
  res.type('text/xml').send(response.toString());
});

// Voicemail for /outcome/voicemail, once the ring times out unanswered.
app.post('/outcome-voicemail', (req, res) => {
  const response = new VoiceResponse();
  if (req.body.DialCallStatus !== 'completed') {
    response.say(
      { voice: 'alice' },
      'Hi, you have reached the test voicemail. Please leave a message after the tone.'
    );
    response.record({ maxLength: 30, playBeep: true });
  }
  res.type('text/xml').send(response.toString());
});

// Run a real HTTP server only when started directly (local dev).
// On Vercel the file is imported and the Express app is used as the handler.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Browser phone running:  http://localhost:${PORT}`);
    console.log(`  Client identity:        ${CLIENT_IDENTITY}`);
    console.log(`\n  Next: expose it with  ngrok http ${PORT}`);
    console.log(`  Then set your Twilio number's Voice webhook to  https://<ngrok-url>/voice  (POST)\n`);
  });
}

module.exports = app;
