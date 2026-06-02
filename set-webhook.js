require('dotenv').config();

// Usage:
//   node set-webhook.js                              -> <ngrok>/voice-test (safe test)
//   node set-webhook.js live                         -> <ngrok>/voice
//   node set-webhook.js live https://app.vercel.app  -> that base /voice  (Vercel deploy)
//   node set-webhook.js test https://app.vercel.app  -> that base /voice-test
//
// If no base URL is given, auto-detects your running ngrok URL (port 4040).

const twilio = require('twilio');
const http = require('http');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
} = process.env;

const arg1 = process.argv[2]; // 'live' | 'test' (or a URL)
const arg2 = process.argv[3]; // optional explicit base URL

// Allow passing a URL as the first arg too.
const explicitBase = [arg1, arg2].find((a) => a && a.startsWith('http'));
const mode = arg1 === 'live' ? 'voice' : 'voice-test';

function getNgrokUrl() {
  return new Promise((resolve, reject) => {
    http
      .get('http://localhost:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const tunnels = JSON.parse(data).tunnels || [];
            const https = tunnels.find((t) => t.public_url.startsWith('https'));
            if (!https) return reject(new Error('No HTTPS ngrok tunnel found.'));
            resolve(https.public_url);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', () =>
        reject(new Error('Could not reach ngrok API at :4040. Is `ngrok http 4000` running?'))
      );
  });
}

(async () => {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET) {
    console.error('Missing Twilio creds in .env'); process.exit(1);
  }

  const base = (explicitBase || (await getNgrokUrl())).replace(/\/$/, '');
  const voiceUrl = `${base}/${mode}`;

  const client = twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
    accountSid: TWILIO_ACCOUNT_SID,
  });

  const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });
  if (!numbers.length) {
    console.error('No phone numbers found on this account.'); process.exit(1);
  }

  console.log(`\nFound ${numbers.length} number(s). Setting Voice webhook -> ${voiceUrl}\n`);
  for (const n of numbers) {
    await client.incomingPhoneNumbers(n.sid).update({
      voiceUrl,
      voiceMethod: 'POST',
    });
    console.log(`  ✓ ${n.phoneNumber}  (${n.friendlyName})`);
  }

  console.log(`\nDone. Now call your number.`);
  console.log(
    mode === 'voice-test'
      ? '  -> You should hear "Your Twilio webhook is working" and see a log in your server.'
      : '  -> Make sure the browser tab is Online (green dot), then it will ring there.'
  );
  console.log('');
})().catch((e) => {
  console.error('\nError:', e.message, '\n');
  process.exit(1);
});
