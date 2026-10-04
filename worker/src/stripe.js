// Stripe, spoken to directly over its REST API (no SDK needed in a Worker).
import { CURRENCY } from '../../shared/catalog.js';

const VERSION = '2024-06-20';   // pinned: session.shipping_details lives where this code expects it

function base(env) { return (env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, ''); }

// flatten nested params into Stripe's form encoding: a[b][0][c]=…
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(env, method, path, params, idempotencyKey) {
  const headers = { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'stripe-version': VERSION };
  let body;
  if (params) { body = form(params).toString(); headers['content-type'] = 'application/x-www-form-urlencoded'; }
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(base(env) + path, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Stripe: ${(data.error && data.error.message) || res.status}`);
    err.status = res.status >= 500 ? 502 : 400;
    throw err;
  }
  return data;
}

export async function createCheckout(env, { draftId, items, rate, dest, successUrl, cancelUrl, describe }) {
  const line_items = items.map(it => {
    const d = describe(it);
    return { quantity: it.qty, price_data: { currency: CURRENCY, unit_amount: it.price, product_data: { name: d.name, description: d.description, metadata: { product: it.product, variant: it.pf } } } };
  });
  const params = {
    mode: 'payment',
    line_items,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: draftId,
    metadata: { draft_id: draftId },
    payment_intent_data: { metadata: { draft_id: draftId }, description: `Diagrammatic & Co. order ${draftId}` },
    shipping_address_collection: { allowed_countries: [dest.country] },
    shipping_options: [{ shipping_rate_data: {
      type: 'fixed_amount', display_name: rate.name,
      fixed_amount: { amount: rate.cents, currency: CURRENCY },
      delivery_estimate: rate.min ? { minimum: { unit: 'business_day', value: rate.min }, maximum: { unit: 'business_day', value: rate.max || rate.min + 4 } } : undefined,
    } }],
    phone_number_collection: { enabled: 'true' },
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    submit_type: 'pay',
    custom_text: { submit: { message: 'Each piece is made to order and usually leaves the printer within 2–5 business days.' } },
  };
  if ((env.STRIPE_AUTOMATIC_TAX || 'false') === 'true') params.automatic_tax = { enabled: 'true' };
  return call(env, 'POST', '/v1/checkout/sessions', params, `checkout-${draftId}`);
}

export const getSession = (env, id) => call(env, 'GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`);

export const refund = (env, paymentIntent, note) =>
  call(env, 'POST', '/v1/refunds', { payment_intent: paymentIntent, metadata: { note } }, `refund-${paymentIntent}`);

// Stripe-Signature: t=timestamp,v1=hex(hmac_sha256(secret, `${t}.${payload}`))
export async function verifySignature(payload, header, secret, toleranceSec = 300) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = header.split(',').filter(p => p.trim().startsWith('v1=')).map(p => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return sigs.some(s => s.length === expected.length && [...s].reduce((acc, ch, i) => acc | (ch.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}
