// Stand-ins for Stripe and Printful, for testing the worker end to end without
// real accounts.  Printful's stand-in fetches every print file it is given,
// as the real one does, and keeps it for inspection.
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { PRODUCTS } from '../../shared/catalog.js';

const WORKER = process.env.WORKER || 'http://127.0.0.1:8787';
const WHSEC = process.env.WHSEC || 'whsec_local_e2e';

const PORT = Number(process.env.MOCK_PORT || 8911);
const OUT = process.env.MOCK_OUT || new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

export const state = { sessions: {}, orders: {}, refunds: [], files: [], rateCalls: 0 };

// roughly the shapes Printful reports (pixels at the given dpi)
const PRINTFILES = {
  795: { width: 2400, height: 3600, dpi: 300, can_rotate: true },   // window inside the mat
  71: { width: 1800, height: 2400, dpi: 150, can_rotate: false },
  568: { width: 1500, height: 2100, dpi: 300, can_rotate: false },
  19: { width: 2475, height: 1155, dpi: 300, can_rotate: false },
  367: { width: 2100, height: 2400, dpi: 150, can_rotate: false },
  358: { width: 1200, height: 1200, dpi: 300, can_rotate: false },
};

function body(req) {
  return new Promise(res => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => res(b)); });
}
function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}
function unflatten(params) {
  const out = {};
  for (const [k, v] of params) {
    const keys = k.replace(/\]/g, '').split('[');
    let o = out;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) o[key] = v;
      else o = o[key] ||= {};
    });
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const raw = await body(req);
  const p = url.pathname;
  // ---- test controls
  if (p === '/_state') return send(res, 200, state);
  if (p === '/_reset') { state.sessions = {}; state.orders = {}; state.refunds = []; state.files = []; return send(res, 200, { ok: true }); }
  if (p.startsWith('/_pay/')) {
    const s = state.sessions[p.slice(6)];
    Object.assign(s, JSON.parse(raw || '{}'));
    return send(res, 200, s);
  }
  // ---- a pretend Stripe Checkout page, for trying the shop by hand
  const pay = p.match(/^\/pay\/([^/]+)(\/complete)?$/);
  if (pay) {
    const sess = state.sessions[pay[1]];
    if (!sess) return send(res, 404, { error: 'no such session' });
    if (!pay[2]) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      const lines = Object.values(sess._params.line_items).map(li => `<li>${li.quantity} × ${li.price_data.product_data.name} — $${(li.price_data.unit_amount / 100).toFixed(2)}<br><small>${li.price_data.product_data.description}</small></li>`).join('');
      return res.end(`<!doctype html><meta charset="utf-8"><title>Test checkout</title><body style="font:16px system-ui;max-width:560px;margin:40px auto;padding:0 16px">
        <p style="background:#fde68a;padding:8px 12px">Stand-in for Stripe Checkout (local testing only)</p><h1>Pay Diagrammatic &amp; Co.</h1><ul>${lines}</ul>
        <p>Total $${(sess.amount_total / 100).toFixed(2)} incl. shipping</p>
        <form method="post" action="/pay/${sess.id}/complete"><button style="font-size:18px;padding:10px 20px">Pay (test)</button></form>
        <p><a href="${sess._params.cancel_url}">Cancel</a></p></body>`);
    }
    Object.assign(sess, {
      payment_status: 'paid', status: 'complete',
      customer_details: { email: 'reader@example.com', name: 'A. Reader', phone: '+12125550123' },
      shipping_details: { name: 'A. Reader', address: { line1: '1 Fifth Avenue', city: 'New York', state: 'NY', postal_code: '10003', country: sess._params.shipping_address_collection.allowed_countries['0'] } },
    });
    const payload = JSON.stringify({ id: 'evt_' + Date.now(), type: 'checkout.session.completed', data: { object: sess } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', WHSEC).update(`${t}.${payload}`).digest('hex');
    const wr = await fetch(WORKER + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
    console.log('webhook →', wr.status, await wr.text());
    res.writeHead(303, { location: sess._params.success_url.replace('{CHECKOUT_SESSION_ID}', sess.id) });
    return res.end();
  }
  // ---- Stripe
  if (p.startsWith('/stripe/')) {
    if (!/^Bearer sk_test_/.test(req.headers.authorization || '')) return send(res, 401, { error: { message: 'Invalid API key' } });
    const sp = p.slice(7);
    if (sp === '/v1/checkout/sessions' && req.method === 'POST') {
      const params = unflatten(new URLSearchParams(raw));
      const id = 'cs_test_' + Math.random().toString(36).slice(2, 14);
      const amount = Object.values(params.line_items).reduce((s, li) => s + Number(li.price_data.unit_amount) * Number(li.quantity), 0);
      const ship = Number(params.shipping_options[0].shipping_rate_data.fixed_amount.amount);
      state.sessions[id] = {
        id, object: 'checkout.session', url: `http://localhost:${PORT}/pay/${id}`, payment_status: 'unpaid', status: 'open',
        metadata: params.metadata, client_reference_id: params.client_reference_id, currency: 'usd',
        amount_subtotal: amount, amount_total: amount + ship, shipping_cost: { amount_total: ship },
        total_details: { amount_tax: 0 }, payment_intent: 'pi_test_' + id.slice(8), _params: params,
      };
      return send(res, 200, state.sessions[id]);
    }
    const m = sp.match(/^\/v1\/checkout\/sessions\/(.+)$/);
    if (m && req.method === 'GET') return state.sessions[m[1]] ? send(res, 200, state.sessions[m[1]]) : send(res, 404, { error: { message: 'No such session' } });
    if (sp === '/v1/refunds' && req.method === 'POST') {
      const params = unflatten(new URLSearchParams(raw));
      state.refunds.push(params);
      return send(res, 200, { id: 're_test_1', object: 'refund', status: 'succeeded', ...params });
    }
    return send(res, 404, { error: { message: 'mock stripe: no route ' + sp } });
  }
  // ---- Printful
  if (p.startsWith('/printful/')) {
    if (!/^Bearer pf_test/.test(req.headers.authorization || '')) return send(res, 401, { code: 401, result: 'Unauthorized', error: { reason: 'Unauthorized', message: 'Unauthorized' } });
    const pp = p.slice(9);
    if (pp === '/shipping/rates') {
      state.rateCalls++;
      const b = JSON.parse(raw);
      if (b.recipient.country_code === 'ZZ') return send(res, 400, { code: 400, result: 'Invalid country', error: { message: 'Recipient country is not supported' } });
      const n = b.items.reduce((s, i) => s + i.quantity, 0);
      return send(res, 200, { code: 200, result: [
        { id: 'STANDARD', name: 'Flat Rate (Estimated delivery: 3-6 business days)', rate: (4.75 + (n - 1) * 2).toFixed(2), currency: 'USD', minDeliveryDays: 3, maxDeliveryDays: 6 },
        { id: 'PRINTFUL_FAST', name: 'Express', rate: '14.50', currency: 'USD', minDeliveryDays: 1, maxDeliveryDays: 3 },
      ] });
    }
    const pfm = pp.match(/^\/mockup-generator\/printfiles\/(\d+)$/);
    if (pfm) {
      const id = Number(pfm[1]);
      const f = PRINTFILES[id];
      return send(res, 200, { code: 200, result: {
        product_id: id, available_placements: { default: 'Front' },
        printfiles: [{ printfile_id: 1, ...f, fill_mode: 'fit' }],
        variant_printfiles: Object.values((PRODUCTS.find(x => x.printful === id) || { variants: {} }).variants).map(v => ({ variant_id: v.pf, placements: { default: 1 } })),
      } });
    }
    if (pp.startsWith('/orders') && req.method === 'POST') {
      const confirm = ['1', 'true'].includes(url.searchParams.get('confirm'));
      const o = JSON.parse(raw);
      for (const k of ['external_id', 'recipient', 'items']) if (!o[k]) return send(res, 400, { code: 400, error: { message: `Missing ${k}` } });
      if (Object.values(state.orders).some(x => x.external_id === o.external_id)) return send(res, 400, { code: 400, error: { message: 'Order with this External ID already exists' } });
      if (o.recipient.address1 === 'FAIL') return send(res, 400, { code: 400, error: { message: 'Recipient address is not valid' } });
      if (o.recipient.address1 === 'BUSY') return send(res, 503, { code: 503, error: { message: 'Service unavailable' } });
      // fetch the print files, as Printful does
      for (const [i, it] of o.items.entries()) {
        for (const f of it.files) {
          const r = await fetch(f.url);
          const text = await r.text();
          const name = `${o.external_id}-${i}.svg`;
          if (r.ok) writeFileSync(OUT + name, text);
          state.files.push({ url: f.url, status: r.status, type: r.headers.get('content-type'), bytes: text.length, name });
        }
      }
      const id = 1000 + Object.keys(state.orders).length;
      state.orders[id] = { ...o, id, status: confirm ? 'pending' : 'draft', confirm };
      return send(res, 200, { code: 200, result: { id, status: state.orders[id].status } });
    }
    const om = pp.match(/^\/orders\/(.+)$/);
    if (om && req.method === 'GET') {
      const key = decodeURIComponent(om[1]);
      const o = key.startsWith('@') ? Object.values(state.orders).find(x => x.external_id === key.slice(1)) : state.orders[key];
      return o ? send(res, 200, { code: 200, result: { id: o.id, status: o.status, shipments: [] } }) : send(res, 404, { code: 404, error: { message: 'Not found' } });
    }
    return send(res, 404, { code: 404, error: { message: 'mock printful: no route ' + pp } });
  }
  send(res, 404, { error: 'mock: unknown' });
});

server.listen(PORT, () => console.log(`mock stripe+printful on :${PORT}`));
