# Opening the shop: what only the owner can do

The website, the payment and fulfilment code, the print-file renderer and the tests are all done. What remains needs **your accounts and your keys**. That is roughly an hour of sign-ups, followed by a single script.

## 1. Accounts to create

| Service | What it does | What you need from it |
| --- | --- | --- |
| **Stripe** (stripe.com) | Takes card payments; you are paid out to your bank. | Complete *account activation* (business details and bank account). Copy your **secret key** from Developers → API keys. Start with the test key `sk_test_…`. |
| **Printful** (printful.com) | Prints, packs and posts each order. | Create a store of type **"Manual order platform / API"**. Add a **billing method** (Billing → Billing methods), because Printful charges you its wholesale cost for each order. Create a **private token** at developers.printful.com → *Your tokens*, limited to that store, with **all scopes** selected. The Worker uses orders, shipping rates, the file library and the mockup generator's print-file sizes. |
| **Cloudflare** (cloudflare.com) | Runs the small "counting-house" service that connects the two. The free plan is enough. | Just the account. The script signs you in. |

## 2. Run the setup script

From this folder, in Terminal:

```bash
./setup.sh
```

It asks for your contact email, then your Stripe key and Printful token. You type these into your own terminal, and they are stored encrypted at Cloudflare. Then it:

1. creates the order database,
2. deploys the Worker,
3. registers the Stripe webhook,
4. points the website at the Worker,
5. offers to publish the site.

It needs Node.js 18 or newer.

## 3. Rehearse, then open

- **Rehearse in test mode.** With the `sk_test_` key, place an order on the live site using Stripe's test card `4242 4242 4242 4242` (any future expiry date, any CVC). In test mode, orders reach Printful as **drafts**, so nothing is printed or charged. You can see the draft, and open its print file, in your Printful dashboard.
- **Open for trade.** Run `./setup.sh` again with your `sk_live_` key. From then on, every paid order goes to Printful automatically and is printed and posted with no further action from you.

## 4. Settings to choose in the dashboards

- **Stripe → Settings → Public details:** business name *Diagrammatic & Co.*, a support email, and a statement descriptor (e.g. `DIAGRAMMATIC`).
- **Stripe → Settings → Customer emails:** turn on **successful payment** receipts. This is the customer's order confirmation.
- **Stripe → Settings → Branding:** background `#f8f4eb`, button/accent `#1b1712`, and a serif font, so Checkout matches the shop.
- **Printful → Settings → Notifications / packing slips:** let Printful email customers when their order ships, and add a return address. The packing slip already carries the shop name and your contact email.
- **Promotional codes (optional):** create them in Stripe → Products → Coupons. Checkout already accepts them.

## 5. Things to decide

- **The policies page** (`policies.html`) is a sensible draft that describes how the shop actually works. Read it, put in your legal business name if you have one, and change anything you would phrase differently.
- **Sales tax.** In the US you may need to collect sales tax in states where you meet nexus thresholds. Stripe Tax can do this automatically: register in Stripe → Tax, then set `STRIPE_AUTOMATIC_TAX = "true"` in `worker/wrangler.toml` and run `./setup.sh` again. Separately, Printful may charge *you* sales tax on its wholesale price unless you give it a resale certificate (Printful → Settings → Billing → Tax).
- **Prices** live in `shared/catalog.js`, together with Printful's wholesale costs as of October 2026. Edit them, commit, push, then run `cd worker && npx wrangler deploy` so the Worker charges the same prices the site shows.
- **Blocked words.** A short built-in list of slurs is refused automatically. To add more, list them in `BLOCKED_WORDS` in `worker/wrangler.toml` (comma-separated) and redeploy.

## What runs without you

- **Payment:** Stripe Checkout takes the payment and emails a receipt.
- **Order placement:** the Worker receives Stripe's signed webhook and places the Printful order with print-ready vector artwork. The artwork is generated from the customer's sentence and sized to Printful's exact print area.
- **Retries:** if Printful is briefly unavailable, Stripe retries the webhook for up to three days. Duplicate deliveries never create duplicate orders.
- **Refunds:** if Printful rejects an order outright (an undeliverable address, for example), the customer is refunded automatically and the thank-you page says so.
- **Order status:** the thank-you page shows each order's progress and tracking.

## What may still need you occasionally

- Customer emails, which arrive at your contact address.
- Damaged-in-transit or misprint claims. You file these with Printful through its dashboard, within 30 days; Printful reprints at no cost when the fault is theirs.
- Disputes or chargebacks, which arrive in Stripe.
