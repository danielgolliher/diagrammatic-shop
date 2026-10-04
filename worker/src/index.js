// Diagrammatic & Co. — the counting-house.
// A Cloudflare Worker that stands between the shop window (GitHub Pages),
// Stripe (payment) and Printful (printing and posting):
//
//   POST /api/quote            shipping for a bag, from Printful's live rates
//   POST /api/checkout         validate the bag, keep a draft, open Stripe Checkout
//   POST /api/stripe/webhook   on payment, place the order with Printful
//   GET  /print/:draft/:n.svg  the signed, print-ready file Printful fetches
//   GET  /api/order            order status for the thank-you page
//   GET  /api/health           which keys are in place

import { byId, lookup, optionLabel, LIMITS, CURRENCY } from '../../shared/catalog.js';
import { byEntry } from '../../shared/catalogue.js';
import { parseDiagram, checkWords, checkCoverage, DiagramError } from '../../shared/svgprims.js';
import * as stripe from './stripe.js';
import * as printful from './printful.js';
import { renderPrint } from './print.js';
import { isBlocked } from './moderation.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

export default {
  // daily: forget bags that never became orders (after 30 days); keep ordered ones for two years
  async scheduled(event, env) {
    const now = Date.now();
    await env.DB.prepare('DELETE FROM drafts WHERE created < ? AND id NOT IN (SELECT draft_id FROM orders)').bind(now - 30 * 864e5).run();
    await env.DB.prepare('DELETE FROM drafts WHERE created < ?').bind(now - 730 * 864e5).run();
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      let res;
      if (url.pathname === '/api/health') res = await health(env);
      else if (url.pathname === '/api/quote' && request.method === 'POST') res = await quote(request, env);
      else if (url.pathname === '/api/checkout' && request.method === 'POST') res = await checkout(request, env, url);
      else if (url.pathname === '/api/stripe/webhook' && request.method === 'POST') return await webhook(request, env, url, ctx);
      else if (url.pathname === '/api/order' && request.method === 'GET') res = await orderStatus(url, env);
      else if (/^\/print\/[a-z0-9]+\/\d+\.svg$/.test(url.pathname)) return await printFile(url, env);
      else if (url.pathname === '/') res = json({ shop: env.SHOP_NAME || 'Diagrammatic & Co.', ok: true });
      else res = json({ error: 'Not found' }, 404);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      const status = e.status || (e instanceof DiagramError ? 400 : 500);
      if (status >= 500) console.error(e.stack || e);
      return json({ error: status >= 500 ? 'Something went amiss in the counting-house.' : e.message }, status, cors);
    }
  },
};

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = new Set((env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
  if (env.SITE_URL) allowed.add(new URL(env.SITE_URL).origin);
  const ok = allowed.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return ok ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' } : {};
}

async function health(env) {
  const key = env.STRIPE_SECRET_KEY || '';
  return json({
    ok: true,
    stripe: !!key, mode: key.startsWith('sk_live') || key.startsWith('rk_live') ? 'live' : key ? 'test' : 'unset',
    webhook: !!env.STRIPE_WEBHOOK_SECRET, printful: !!env.PRINTFUL_API_KEY, signing: !!env.PRINT_SIGNING_SECRET,
    database: !!env.DB, confirmOrders: confirmOrders(env),
  });
}

// --- the bag ------------------------------------------------------------------
function readItem(raw, i) {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, `Item ${i + 1} is malformed.`);
  const found = lookup(String(raw.product || ''), raw.opts || {});
  if (!found) throw new HttpError(400, `Item ${i + 1} is not in the collection.`);
  const qty = Math.floor(Number(raw.qty) || 0);
  if (qty < 1 || qty > LIMITS.qtyPerItem) throw new HttpError(400, `Item ${i + 1} has an unusual quantity.`);
  return { found, qty };
}

async function quote(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'An empty bag.');
  const items = body.items.slice(0, LIMITS.itemsPerOrder).map((it, i) => readItem(it, i));
  const dest = destination(body);
  const rate = await printful.shippingRate(env, dest, items.map(x => ({ variant_id: x.found.variant.pf, quantity: x.qty })));
  return json({ shipping: rate });
}

function destination(body) {
  const country = String(body.country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, 'Choose where the parcel is going.');
  const state = String(body.state || '').toUpperCase();
  if (['US', 'CA', 'AU'].includes(country) && !/^[A-Z]{2,3}$/.test(state)) throw new HttpError(400, 'Choose a state or province.');
  return { country, state: state || undefined };
}

async function checkout(request, env, url) {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'The shop is not yet taking orders.');
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'An empty bag.');
  if (body.items.length > LIMITS.itemsPerOrder) throw new HttpError(400, `At most ${LIMITS.itemsPerOrder} items to an order.`);
  const dest = destination(body);
  const blocked = (env.BLOCKED_WORDS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const items = [];
  for (const [i, raw] of body.items.entries()) {
    const { found, qty } = readItem(raw, i);
    const sentence = String(raw.sentence || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!sentence) throw new HttpError(400, `Item ${i + 1} has no sentence.`);
    if (sentence.length > LIMITS.sentenceChars) throw new HttpError(400, `Item ${i + 1}: the sentence is longer than we can set.`);
    if (await isBlocked(sentence, blocked)) throw new HttpError(422, `We are unable to print the sentence in item ${i + 1}.`);
    const svg = String(raw.svg || '');
    if (svg.length > LIMITS.svgBytes) throw new HttpError(400, `Item ${i + 1}: the diagram is too intricate to print.`);
    const d = parseDiagram(svg);           // throws DiagramError → 400
    checkWords(d.prims, sentence);
    if (d.prims.some(x => x.loose)) throw new HttpError(400, `Item ${i + 1}: not every word found its place in the figure.`);
    checkCoverage(d.prims, sentence);
    // a sentence from the Catalogue may carry its source; the wording must match exactly
    const entry = raw.source && byEntry[String(raw.source)];
    const attribution = entry && entry.text === sentence && raw.cite !== false && raw.caption !== false ? entry.cite : null;
    items.push({
      product: found.product.id, opts: found.opts, key: found.key, pf: found.variant.pf, price: found.variant.price,
      qty, sentence, caption: raw.caption !== false, attribution, svg,
    });
  }

  // shipping, quoted live; Printful's method id travels with the order
  const rate = await printful.shippingRate(env, dest, items.map(x => ({ variant_id: x.pf, quantity: x.qty })));
  const draftId = randomId();
  await env.DB.prepare('INSERT INTO drafts (id, created, data) VALUES (?, ?, ?)')
    .bind(draftId, Date.now(), JSON.stringify({ items, dest, shipping: rate })).run();

  const site = (env.SITE_URL || body.site || url.origin).replace(/\/?$/, '/');
  const session = await stripe.createCheckout(env, {
    draftId, items, rate, dest,
    successUrl: `${site}thanks.html?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${site}#bag`,
    describe: it => ({ name: `${byId[it.product].name} — ${optionLabel(byId[it.product], it.opts)}`, description: `“${it.sentence.slice(0, 180)}${it.sentence.length > 180 ? '…' : ''}”` }),
  });
  return json({ url: session.url, id: session.id });
}

// --- payment received ---------------------------------------------------------
async function webhook(request, env, url, ctx) {
  const payload = await request.text();
  const ok = await stripe.verifySignature(payload, request.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET || '');
  if (!ok) return json({ error: 'bad signature' }, 400);
  const event = JSON.parse(payload);
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return json({ received: true, ignored: event.type });
  const session = event.data && event.data.object;
  if (!session || session.payment_status !== 'paid') return json({ received: true, waiting: true });
  const result = await fulfil(env, session, url.origin);
  return json(result.retry ? { error: result.message } : { received: true, ...result }, result.retry ? 500 : 200);
}

async function fulfil(env, session, origin) {
  const draftId = session.metadata && session.metadata.draft_id || session.client_reference_id;
  if (!draftId) return { status: 'ignored', message: 'not one of ours' };
  const existing = await env.DB.prepare('SELECT status FROM orders WHERE session_id = ?').bind(session.id).first();
  if (existing && ['submitted', 'draft', 'refunded'].includes(existing.status)) return { status: existing.status, duplicate: true };
  const row = await env.DB.prepare('SELECT data FROM drafts WHERE id = ?').bind(draftId).first();
  if (!row) return { retry: true, message: 'draft not found' };
  const draft = JSON.parse(row.data);

  const ship = session.shipping_details || (session.collected_information && session.collected_information.shipping_details) || {};
  const addr = ship.address || (session.customer_details && session.customer_details.address) || {};
  const recipient = {
    name: ship.name || (session.customer_details && session.customer_details.name) || 'Customer',
    address1: addr.line1, address2: addr.line2 || undefined, city: addr.city,
    state_code: ['US', 'CA', 'AU'].includes(addr.country) ? addr.state || undefined : undefined, country_code: addr.country, zip: addr.postal_code,
    email: session.customer_details && session.customer_details.email || undefined,
    phone: session.customer_details && session.customer_details.phone || undefined,
  };
  const sign = n => printSignature(env, draftId, n);
  const items = [];
  for (const [n, it] of draft.items.entries()) {
    const p = byId[it.product];
    items.push({
      variant_id: it.pf, quantity: it.qty, retail_price: (it.price / 100).toFixed(2),
      name: `${p.name} — ${optionLabel(p, it.opts)}`.slice(0, 120),
      files: [{ type: p.placement, url: `${origin}/print/${draftId}/${n}.svg?sig=${await sign(n)}` }],
    });
  }
  const subtotal = draft.items.reduce((s, it) => s + it.price * it.qty, 0);
  const shippingCents = (session.shipping_cost && session.shipping_cost.amount_total) ?? draft.shipping.cents;
  const order = {
    external_id: draftId,
    shipping: draft.shipping.id || 'STANDARD',
    recipient, items,
    retail_costs: {
      currency: (session.currency || CURRENCY).toUpperCase(), subtotal: (subtotal / 100).toFixed(2),
      shipping: (shippingCents / 100).toFixed(2), tax: ((session.total_details && session.total_details.amount_tax || 0) / 100).toFixed(2),
      total: ((session.amount_total || 0) / 100).toFixed(2),
    },
    packing_slip: {
      email: env.CONTACT_EMAIL || undefined,
      message: env.PACKING_MESSAGE || 'Made to order for you. With our compliments.',
      store_name: env.SHOP_NAME || 'Diagrammatic & Co.',
    },
  };
  const confirm = confirmOrders(env);
  const now = Date.now();
  // already placed (a retried delivery, or a ledger write that failed after Printful accepted)?
  const placed = await printful.findByExternalId(env, draftId).catch(() => null);
  const res = placed ? { ok: false, duplicate: true, id: String(placed.id) } : await printful.createOrder(env, order, confirm);
  const save = (status, printfulId, message) => env.DB.prepare(
    'INSERT INTO orders (session_id, draft_id, status, printful_id, message, updated) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET status = excluded.status, printful_id = excluded.printful_id, message = excluded.message, updated = excluded.updated',
  ).bind(session.id, draftId, status, printfulId || null, message || null, now).run();

  if (res.ok || res.duplicate) {
    await save(confirm ? 'submitted' : 'draft', res.id, res.duplicate ? 'already placed' : null);
    return { status: confirm ? 'submitted' : 'draft', printful: res.id, duplicate: !!res.duplicate };
  }
  if (res.transient) return { retry: true, message: res.message };
  // before refunding, make certain Printful really has no order for this payment
  const after = await printful.findByExternalId(env, draftId).catch(() => 'unknown');
  if (after === 'unknown') return { retry: true, message: 'could not confirm the refusal' };
  if (after) { await save(confirm ? 'submitted' : 'draft', String(after.id), 'found after refusal'); return { status: 'submitted', printful: String(after.id) }; }
  // a permanent refusal: give the customer their money back rather than leave them waiting
  let refunded = false;
  if ((env.AUTO_REFUND || 'true') !== 'false' && session.payment_intent) {
    try { await stripe.refund(env, session.payment_intent, `Printful declined the order: ${res.message}`.slice(0, 450)); refunded = true; }
    catch (e) { console.error('refund failed', e); }
  }
  await save(refunded ? 'refunded' : 'failed', null, res.message);
  return { status: refunded ? 'refunded' : 'failed', message: res.message };
}

function confirmOrders(env) {
  const v = (env.PRINTFUL_CONFIRM || 'auto').toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return /^(sk|rk)_live/.test(env.STRIPE_SECRET_KEY || '');   // test-mode payments make Printful drafts only
}

// --- the print file -----------------------------------------------------------
async function printFile(url, env) {
  const [, , draftId, file] = url.pathname.split('/');
  const n = parseInt(file, 10);
  const sig = url.searchParams.get('sig') || '';
  if (!env.PRINT_SIGNING_SECRET || !timingSafeEqual(sig, await printSignature(env, draftId, n))) return new Response('Forbidden', { status: 403 });
  const row = await env.DB.prepare('SELECT data FROM drafts WHERE id = ?').bind(draftId).first();
  if (!row) return new Response('Not found', { status: 404 });
  const draft = JSON.parse(row.data);
  const item = draft.items[n];
  if (!item) return new Response('Not found', { status: 404 });
  const svg = await renderPrint(env, item, n);
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'private, max-age=86400' } });
}

async function printSignature(env, draftId, n) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PRINT_SIGNING_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${draftId}:${n}`));
  return [...new Uint8Array(mac)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- order status ---------------------------------------------------------------
async function orderStatus(url, env) {
  const sid = url.searchParams.get('session_id') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) throw new HttpError(400, 'Unknown order.');
  const row = await env.DB.prepare('SELECT * FROM orders WHERE session_id = ?').bind(sid).first();
  let session = null;
  try { session = await stripe.getSession(env, sid); } catch (e) { if (!row) throw new HttpError(404, 'Unknown order.'); }
  const out = {
    paid: session ? session.payment_status === 'paid' : true,
    email: session && session.customer_details ? maskEmail(session.customer_details.email) : null,
    total: session ? session.amount_total : null,
    status: row ? row.status : (session && session.payment_status === 'paid' ? 'received' : 'awaiting payment'),
  };
  if (row && row.printful_id) {
    const pf = await printful.getOrder(env, row.printful_id).catch(() => null);
    if (pf) {
      out.production = pf.status;
      out.shipments = (pf.shipments || []).map(s => ({ carrier: s.carrier, service: s.service, tracking: s.tracking_number, url: s.tracking_url, shipped: s.ship_date }));
    }
  }
  if (session && session.metadata && session.metadata.draft_id) {
    const d = await env.DB.prepare('SELECT data FROM drafts WHERE id = ?').bind(session.metadata.draft_id).first();
    if (d) out.items = JSON.parse(d.data).items.map(it => ({ product: it.product, opts: it.opts, qty: it.qty, sentence: it.sentence, cite: it.attribution || null }));
  }
  return json(out);
}

function maskEmail(e) {
  if (!e) return null;
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

function randomId() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
