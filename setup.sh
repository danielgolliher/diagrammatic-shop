#!/usr/bin/env bash
# Diagrammatic & Co. — open the counting-house.
#
# Run this once you have a Stripe account, a Printful account and a
# Cloudflare account (see SETUP.md).  It will:
#   1. sign you in to Cloudflare (a browser window opens),
#   2. create the order ledger (a free D1 database),
#   3. deploy the Worker that takes payments and places orders,
#   4. store your Stripe and Printful keys as encrypted Worker secrets,
#   5. register the Stripe webhook and store its signing secret,
#   6. point the website at the Worker, and offer to publish it.
#
# Safe to run again — for instance with live Stripe keys when you are ready.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
WORKER="$ROOT/worker"
STRIPE_VERSION="2024-06-20"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }
die()  { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "Node.js is needed (https://nodejs.org). Install it and run this again."
command -v curl >/dev/null || die "curl is needed."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18 or newer is needed (you have $(node -v))."

say "Diagrammatic & Co. — opening the counting-house"
cd "$WORKER"
[ -d node_modules ] || { note "Installing tools…"; npm install --silent; }
W="npx --yes wrangler"

say "1. Cloudflare"
if ! $W whoami 2>/dev/null | grep -qi "associated with the email\|You are logged in"; then
  note "A browser window will open; sign in to Cloudflare and allow access."
  $W login
fi
$W whoami | grep -i "email" || true

say "2. The order ledger (D1 database)"
if grep -q 'REPLACE_WITH_D1_DATABASE_ID' wrangler.toml; then
  EXISTING=$($W d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const l=JSON.parse(s);const d=l.find(x=>x.name==="diagrammatic-shop");console.log(d?d.uuid:"")}catch(e){console.log("")}})')
  if [ -n "$EXISTING" ]; then DBID="$EXISTING"; note "Found the existing ledger."
  else
    OUT=$($W d1 create diagrammatic-shop 2>&1) || { echo "$OUT"; die "Could not create the database."; }
    DBID=$(printf '%s' "$OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  fi
  [ -n "$DBID" ] || die "Could not read the database id."
  sed -i.bak "s/REPLACE_WITH_D1_DATABASE_ID/$DBID/" wrangler.toml && rm -f wrangler.toml.bak
fi
$W d1 execute diagrammatic-shop --remote --file=schema.sql --yes >/dev/null
note "Ledger ready."

say "3. Your details"
CURRENT_EMAIL=$(grep -E '^CONTACT_EMAIL' wrangler.toml | sed -E 's/.*= *"(.*)"/\1/')
read -r -p "  Email address customers may write to [${CURRENT_EMAIL:-none}]: " EMAIL
EMAIL="${EMAIL:-$CURRENT_EMAIL}"
[ -n "$EMAIL" ] || die "A contact email is needed for packing slips and the policies page."
case "$EMAIL" in *@*.*) ;; *) die "That does not look like an email address." ;; esac
sed -i.bak -E "s|^CONTACT_EMAIL = .*|CONTACT_EMAIL = \"$EMAIL\"|" wrangler.toml && rm -f wrangler.toml.bak

SITE_URL=$(grep -E '^SITE_URL' wrangler.toml | sed -E 's/.*= *"(.*)"/\1/')
read -r -p "  Address of the shop website [$SITE_URL]: " NEW_SITE
if [ -n "$NEW_SITE" ]; then
  case "$NEW_SITE" in */) ;; *) NEW_SITE="$NEW_SITE/" ;; esac
  sed -i.bak -E "s|^SITE_URL = .*|SITE_URL = \"$NEW_SITE\"|" wrangler.toml && rm -f wrangler.toml.bak
  ORIGIN=$(node -e "console.log(new URL(process.argv[1]).origin)" "$NEW_SITE")
  sed -i.bak -E "s|^ALLOWED_ORIGINS = .*|ALLOWED_ORIGINS = \"$ORIGIN\"|" wrangler.toml && rm -f wrangler.toml.bak
  SITE_URL="$NEW_SITE"
fi

say "4. Deploying the Worker"
DEPLOY=$($W deploy 2>&1) || { echo "$DEPLOY"; die "Deploy failed."; }
API=$(printf '%s' "$DEPLOY" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)
[ -n "$API" ] || { echo "$DEPLOY"; read -r -p "  Paste the Worker's https address: " API; }
note "Worker live at $API"

say "5. Keys (typed here, stored encrypted at Cloudflare; never written to disk)"
read -r -s -p "  Stripe secret key (sk_test_… to rehearse, sk_live_… to trade): " STRIPE_KEY; echo
case "$STRIPE_KEY" in sk_test_*|sk_live_*|rk_test_*|rk_live_*) ;; *) die "That is not a Stripe secret key." ;; esac
read -r -s -p "  Printful API token (leave blank to keep the current one): " PF_KEY; echo
read -r -p "  Printful store id (only if your token covers several stores; else blank): " PF_STORE

curl -fsS https://api.stripe.com/v1/balance -u "$STRIPE_KEY:" >/dev/null || die "Stripe did not accept that key."
if [ -n "$PF_KEY" ]; then
  HDR=(-H "Authorization: Bearer $PF_KEY"); [ -n "$PF_STORE" ] && HDR+=(-H "X-PF-Store-Id: $PF_STORE")
  curl -fsS "${HDR[@]}" https://api.printful.com/stores >/dev/null || die "Printful did not accept that token."
  printf '%s' "$PF_KEY" | $W secret put PRINTFUL_API_KEY >/dev/null
fi
if [ -n "$PF_STORE" ]; then printf '%s' "$PF_STORE" | $W secret put PRINTFUL_STORE_ID >/dev/null; fi
printf '%s' "$STRIPE_KEY" | $W secret put STRIPE_SECRET_KEY >/dev/null
if ! $W secret list 2>/dev/null | grep -q PRINT_SIGNING_SECRET; then
  node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))' | tr -d '\n' | $W secret put PRINT_SIGNING_SECRET >/dev/null
fi
note "Keys stored."

say "6. Stripe webhook"
HOOK_URL="$API/api/stripe/webhook"
# remove any earlier endpoint for this address, so payments are announced once
EXISTING_HOOKS=$(curl -fsS "https://api.stripe.com/v1/webhook_endpoints?limit=100" -u "$STRIPE_KEY:" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const u=process.argv[1];for(const e of JSON.parse(s).data)if(e.url===u)console.log(e.id)})' "$HOOK_URL")
for id in $EXISTING_HOOKS; do curl -fsS -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$id" -u "$STRIPE_KEY:" >/dev/null; done
HOOK=$(curl -fsS https://api.stripe.com/v1/webhook_endpoints -u "$STRIPE_KEY:" \
  -d url="$HOOK_URL" -d api_version="$STRIPE_VERSION" -d description="Diagrammatic & Co. — place orders with Printful" \
  -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=checkout.session.async_payment_succeeded")
WHSEC=$(printf '%s' "$HOOK" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).secret||""))')
[ -n "$WHSEC" ] || die "Stripe did not return a webhook secret."
printf '%s' "$WHSEC" | $W secret put STRIPE_WEBHOOK_SECRET >/dev/null
note "Webhook registered: $HOOK_URL"

say "7. Checking"
sleep 3
HEALTH=$(curl -fsS "$API/api/health")
echo "  $HEALTH"
printf '%s' "$HEALTH" | grep -q '"printful":true' || note "Printful key not set — run again with your Printful token."

say "8. The website"
CONFIG="$ROOT/js/config.js"
sed -i.bak -E "s|^  apiBase: .*|  apiBase: '$API',|; s|^  contactEmail: .*|  contactEmail: '$EMAIL',|" "$CONFIG" && rm -f "$CONFIG.bak"
note "js/config.js now points at $API"
cd "$ROOT"
if git rev-parse --git-dir >/dev/null 2>&1; then
  read -r -p "  Publish the updated site to GitHub Pages now? [Y/n] " PUB
  if [ "${PUB:-Y}" != "n" ] && [ "${PUB:-Y}" != "N" ]; then
    git add js/config.js worker/wrangler.toml
    git commit -m "Open the counting-house: point the shop at its Worker" >/dev/null || true
    git push && note "Published. GitHub Pages refreshes within a minute or two."
  fi
fi

MODE=$(printf '%s' "$STRIPE_KEY" | grep -q live && echo live || echo test)
say "Done. The shop is open in $MODE mode."
if [ "$MODE" = test ]; then
  note "Rehearse an order with Stripe's test card 4242 4242 4242 4242 (any future date, any CVC)."
  note "Test-mode orders reach Printful as drafts only — nothing is printed or charged."
  note "When you are ready to trade, run ./setup.sh again with your sk_live_ key."
else
  note "Live mode: paid orders are sent to Printful and printed automatically."
fi
