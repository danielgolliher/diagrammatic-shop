#!/bin/sh
# Run the worker locally against the stand-in Stripe and Printful, for trying the shop by hand.
cd "$(dirname "$0")/.."
printf 'STRIPE_SECRET_KEY=sk_test_local_e2e\nSTRIPE_WEBHOOK_SECRET=whsec_local_e2e\nPRINTFUL_API_KEY=pf_test_local_e2e\nPRINT_SIGNING_SECRET=sign_local_e2e\n' > .dev.vars
npx wrangler d1 execute diagrammatic-shop --local --file=schema.sql >/dev/null 2>&1
node test/mock.mjs &
MOCK=$!
trap 'kill $MOCK' EXIT
WRANGLER_SEND_METRICS=false npx wrangler dev --local --port 8787 --ip 127.0.0.1 \
  --var STRIPE_API_BASE:http://127.0.0.1:8911/stripe --var PRINTFUL_API_BASE:http://127.0.0.1:8911/printful \
  --var SITE_URL:http://localhost:8772/
