// End-to-end test of the counting-house against stand-in Stripe and Printful.
//   node test/e2e.mjs
// Starts the mock services and `wrangler dev` locally, then walks an order
// through quote → checkout → signed webhook → Printful order → print files,
// and checks the refusals (forged signatures, tampered diagrams, odd prices).
import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import opentype from 'opentype.js';
import { tagText } from '../../engine/tagger.js';
import { parseSentence, resetIds } from '../../engine/parser.js';
import { Draughtsman, toSVG } from '../../engine/layout.js';

const here = new URL('.', import.meta.url).pathname;
const root = new URL('..', import.meta.url).pathname;
const MOCK = 'http://127.0.0.1:8911';
const API = 'http://127.0.0.1:8787';
const SECRETS = { STRIPE_SECRET_KEY: 'sk_test_local_e2e', STRIPE_WEBHOOK_SECRET: 'whsec_local_e2e', PRINTFUL_API_KEY: 'pf_test_local_e2e', PRINT_SIGNING_SECRET: 'sign_local_e2e' };

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

// a diagram as the shop window would draw it
const italic = opentype.loadSync(root + 'fonts/IMFeENit28P.ttf');
const pen = new Draughtsman((s, size) => italic.getAdvanceWidth(s, size));
function diagram(sentence) {
  resetIds();
  const sen = tagText(sentence)[0];
  return toSVG(pen.sentence(parseSentence(sen.tokens, sen.end)), { title: '' }).svg;
}

async function waitFor(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) { /* not yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}
const post = (path, body, headers = {}) => fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:8772', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const mockState = () => fetch(MOCK + '/_state').then(r => r.json());

function signedEvent(session, type = 'checkout.session.completed', secret = SECRETS.STRIPE_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) {
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), type, data: { object: session } });
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return { payload, header: `t=${t},v1=${sig}` };
}

async function main() {
  // fresh local ledger
  rmSync(root + '.wrangler/state', { recursive: true, force: true });
  writeFileSync(root + '.dev.vars', Object.entries(SECRETS).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  execSync('npx wrangler d1 execute diagrammatic-shop --local --file=schema.sql', { cwd: root, stdio: 'ignore' });

  const mock = spawn(process.execPath, [here + 'mock.mjs'], { stdio: ['ignore', 'inherit', 'inherit'] });
  const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', '8787', '--ip', '127.0.0.1',
    '--var', `STRIPE_API_BASE:${MOCK}/stripe`, '--var', `PRINTFUL_API_BASE:${MOCK}/printful`,
    '--var', 'SITE_URL:http://localhost:8772/', '--var', 'CONTACT_EMAIL:hello@example.com', '--var', 'BLOCKED_WORDS:frobnicate'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  let devLog = '';
  dev.stdout.on('data', d => (devLog += d));
  dev.stderr.on('data', d => (devLog += d));
  const cleanup = () => { try { dev.kill('SIGINT'); } catch (e) {} try { mock.kill(); } catch (e) {} };
  process.on('exit', cleanup);

  try {
    if (!(await waitFor(MOCK + '/_state'))) throw new Error('mock did not start');
    if (!(await waitFor(API + '/api/health', 160))) { console.log(devLog); throw new Error('wrangler dev did not start'); }

    console.log('\nHealth');
    const h = await (await fetch(API + '/api/health')).json();
    ok(h.stripe && h.printful && h.webhook && h.signing && h.mode === 'test', `all keys present, test mode (${JSON.stringify(h)})`);
    ok(h.confirmOrders === false, 'test-mode payments make Printful drafts');

    const s1 = 'The old man walked slowly to the village.';
    const s2 = 'She gave him a book about birds.';
    const bag = [
      { product: 'plate', opts: { frame: 'Black', size: '12″×16″' }, qty: 1, sentence: s1, caption: true, svg: diagram(s1) },
      { product: 'tee', opts: { color: 'Black', size: 'M' }, qty: 2, sentence: s2, caption: true, svg: diagram(s2) },
      { product: 'mug', opts: { size: '11 oz' }, qty: 1, sentence: s1, caption: true, svg: diagram(s1) },
      { product: 'sticker', opts: { size: '4″×4″' }, qty: 3, sentence: s2, caption: false, svg: diagram(s2) },
    ];

    console.log('\nQuote');
    let r = await post('/api/quote', { country: 'US', state: 'NY', items: bag.map(({ product, opts, qty }) => ({ product, opts, qty })) });
    let q = await r.json();
    ok(r.ok && q.shipping && q.shipping.id === 'STANDARD' && q.shipping.cents === 1675, `live Printful rate quoted (${JSON.stringify(q.shipping)})`);
    ok(r.headers.get('access-control-allow-origin') === 'http://localhost:8772', 'CORS allows the shop window');
    r = await post('/api/quote', { country: 'US', items: [{ product: 'tee', opts: { color: 'Black', size: 'M' }, qty: 1 }] });
    ok(r.status === 400, 'US quote without a state is refused');

    console.log('\nCheckout');
    const tampered = JSON.parse(JSON.stringify(bag));
    tampered[0].price = 1;            // a client cannot set its own price
    r = await post('/api/checkout', { country: 'US', state: 'NY', items: tampered });
    let c = await r.json();
    ok(r.ok && c.url && c.id, 'checkout session opened');
    let st = await mockState();
    const sess = st.sessions[c.id];
    ok(sess && sess.amount_subtotal === 8900 + 2 * 3800 + 2600 + 3 * 800, `server prices used, not the client's (subtotal ${sess && sess.amount_subtotal})`);
    ok(sess && sess._params.shipping_address_collection.allowed_countries['0'] === 'US', 'address collection limited to the quoted country');
    ok(sess && sess._params.shipping_options['0'].shipping_rate_data.fixed_amount.amount === '1675', 'shipping carried to Stripe');
    ok(sess && /Framed Plate/.test(sess._params.line_items['0'].price_data.product_data.name), 'line items named for the collection');

    const bad = async (label, items, status = 400) => {
      const res = await post('/api/checkout', { country: 'US', state: 'NY', items });
      const j = await res.json();
      ok(res.status === status, `${label} → ${res.status} ${j.error || ''}`);
    };
    await bad('a word not in the sentence', [{ ...bag[0], svg: bag[0].svg.replace('>village<', '>pillage<') }]);
    await bad('an embedded image', [{ ...bag[0], svg: bag[0].svg.replace('<defs></defs>', '<defs></defs><image href="https://example.com/x.png"/>') }]);
    await bad('a script', [{ ...bag[0], svg: bag[0].svg.replace('<defs></defs>', '<script>alert(1)</script>') }]);
    await bad('a figure with unplaced words', [{ ...bag[0], svg: bag[0].svg.replace('class="w"', 'class="w loose"') }]);
    await bad('an unknown product', [{ ...bag[0], product: 'yacht' }]);
    await bad('an unknown size', [{ ...bag[1], opts: { color: 'Black', size: '9XL' } }]);
    await bad('a silly quantity', [{ ...bag[1], qty: 500 }]);
    await bad('a blocked word', [{ ...bag[0], sentence: 'Frobnicate the village.', svg: diagram('Frobnicate the village.') }], 422);

    console.log('\nWebhook');
    let ev = signedEvent({ ...sess, payment_status: 'paid' }, 'checkout.session.completed', 'whsec_wrong');
    r = await post('/api/stripe/webhook', ev.payload, { 'stripe-signature': ev.header });
    ok(r.status === 400, 'forged signature refused');
    ev = signedEvent({ ...sess, payment_status: 'paid' }, 'checkout.session.completed', SECRETS.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600);
    r = await post('/api/stripe/webhook', ev.payload, { 'stripe-signature': ev.header });
    ok(r.status === 400, 'stale signature refused');
    ev = signedEvent({ ...sess, payment_status: 'unpaid' });
    r = await post('/api/stripe/webhook', ev.payload, { 'stripe-signature': ev.header });
    st = await mockState();
    ok(r.ok && !Object.keys(st.orders).length, 'unpaid session waits');

    const paid = {
      ...sess, payment_status: 'paid', status: 'complete',
      customer_details: { email: 'reader@example.com', name: 'A. Reader', phone: '+12125550123', address: null },
      shipping_details: { name: 'A. Reader', address: { line1: '1 Fifth Avenue', line2: 'Apt 2', city: 'New York', state: 'NY', postal_code: '10003', country: 'US' } },
    };
    await fetch(MOCK + '/_pay/' + sess.id, { method: 'POST', body: JSON.stringify(paid) });
    ev = signedEvent(paid);
    r = await post('/api/stripe/webhook', ev.payload, { 'stripe-signature': ev.header });
    let w = await r.json();
    ok(r.ok && w.status === 'draft', `order placed with Printful as a draft (${JSON.stringify(w)})`);
    st = await mockState();
    const order = Object.values(st.orders)[0];
    ok(order && order.items.length === 4 && order.recipient.city === 'New York' && order.recipient.state_code === 'NY', 'recipient and items passed through');
    ok(order && order.items[1].variant_id === 4017 && order.items[1].quantity === 2, 'tee variant and quantity correct');
    ok(order && order.shipping === 'STANDARD' && order.retail_costs.shipping === '16.75', 'shipping method and retail costs on the packing slip');
    ok(st.files.length === 4 && st.files.every(f => f.status === 200 && /svg/.test(f.type)), `Printful fetched all ${st.files.length} print files`);

    // the files themselves
    for (const f of st.files) {
      const svg = readFileSync(here + 'out/' + f.name, 'utf8');
      ok(!/<text|<script|<image|href=/.test(svg) && /<path/.test(svg), `${f.name}: outlines only, no live text or links (${(f.bytes / 1024).toFixed(0)} KB)`);
    }
    const plate = readFileSync(here + 'out/' + st.files[0].name, 'utf8');
    ok(/viewBox="0 0 3600 2400"/.test(plate), 'wide sentence turns the plate to landscape');
    const tee = readFileSync(here + 'out/' + st.files[1].name, 'utf8');
    ok(/#f1e9d8/.test(tee) && !/#1d1914/.test(tee), 'black tee printed in light ink');

    // signed URLs only
    const u = new URL(st.files[0].url);
    r = await fetch(API + u.pathname + '?sig=0000');
    ok(r.status === 403, 'print file refuses a bad signature');
    r = await fetch(API + u.pathname.replace(/\/0\.svg/, '/9.svg') + u.search);
    ok(r.status === 403 || r.status === 404, 'print file refuses another index');

    console.log('\nRepeat delivery');
    ev = signedEvent(paid);
    r = await post('/api/stripe/webhook', ev.payload, { 'stripe-signature': ev.header });
    w = await r.json();
    st = await mockState();
    ok(r.ok && w.duplicate && Object.keys(st.orders).length === 1, 'webhook replay does not place a second order');

    console.log('\nOrder status');
    r = await fetch(API + '/api/order?session_id=' + sess.id);
    const os = await r.json();
    ok(r.ok && os.paid && os.status === 'draft' && os.production === 'draft' && os.items.length === 4 && os.email === 're••••@example.com', `status page data (${os.status}, ${os.email})`);

    console.log('\nFailures');
    // Printful refuses permanently → automatic refund
    r = await post('/api/checkout', { country: 'US', state: 'CA', items: [bag[2]] });
    c = await r.json();
    st = await mockState();
    let s2s = st.sessions[c.id];
    let paid2 = { ...s2s, payment_status: 'paid', customer_details: { email: 'x@example.com' }, shipping_details: { name: 'X', address: { line1: 'FAIL', city: 'LA', state: 'CA', postal_code: '90001', country: 'US' } } };
    ev = signedEvent(paid2);
    r = await post('/api/stripe/webhook', ev.payload, { 'stripe-signature': ev.header });
    w = await r.json();
    st = await mockState();
    ok(r.ok && w.status === 'refunded' && st.refunds.length === 1 && st.refunds[0].payment_intent === s2s.payment_intent, 'a refused order is refunded automatically');
    // Printful unavailable → 500 so Stripe retries later
    r = await post('/api/checkout', { country: 'US', state: 'CA', items: [bag[2]] });
    c = await r.json();
    st = await mockState();
    s2s = st.sessions[c.id];
    paid2 = { ...s2s, payment_status: 'paid', customer_details: { email: 'x@example.com' }, shipping_details: { name: 'X', address: { line1: 'BUSY', city: 'LA', state: 'CA', postal_code: '90001', country: 'US' } } };
    ev = signedEvent(paid2);
    r = await post('/api/stripe/webhook', ev.payload, { 'stripe-signature': ev.header });
    ok(r.status === 500, 'a busy printer asks Stripe to try again');
    r = await post('/api/quote', { country: 'ZZ', items: [{ product: 'mug', opts: { size: '11 oz' }, qty: 1 }] });
    ok(r.status === 400, 'an unshippable destination is refused at the quote');
  } finally {
    cleanup();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\n--- wrangler log ---\n' + devLog.slice(-4000)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
