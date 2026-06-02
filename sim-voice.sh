#!/usr/bin/env bash
# Simulate the exact POST Twilio sends to /voice on an INBOUND call.
# This validates the webhook logic and produces a server log line.
# NOTE: it returns TwiML only — it does NOT ring the browser (only a real
# inbound call does). To ring the browser, use:  curl -X POST localhost:4000/simulate-call
set -euo pipefail

BASE="${1:-http://localhost:4000}"          # pass an ngrok URL to test through the tunnel
FROM="${2:-+59170000000}"                    # pretend external caller
TO="${3:-+17722387667}"                      # your Twilio number

echo "POST $BASE/voice   (From=$FROM  To=$TO)"
echo "-------------------------------------------------------"
curl -s -X POST "$BASE/voice" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "ngrok-skip-browser-warning: 1" \
  --data-urlencode "CallSid=CAsimulated0000000000000000000000" \
  --data-urlencode "AccountSid=ACsimulated" \
  --data-urlencode "From=$FROM" \
  --data-urlencode "To=$TO" \
  --data-urlencode "CallStatus=ringing" \
  --data-urlencode "Direction=inbound" \
  --data-urlencode "ApiVersion=2010-04-01"
echo
echo "-------------------------------------------------------"
echo 'Expected: <Dial ...><Client>Ricardo</Client></Dial>'
