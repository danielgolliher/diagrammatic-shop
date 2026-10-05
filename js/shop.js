// Diagrammatic & Co. — the shop window.
import { analyse } from '../engine/analysis.js';
import { PRODUCTS, byId, defaultOptions, lookup, optionLabel, money, LIMITS } from '../shared/catalog.js';
import { CATALOGUE, byEntry } from '../shared/catalogue.js';
import { writePrims } from '../shared/svgprims.js';
import { noteRuns } from '../shared/note.js';
import { compose, orientation, MIN_TEXT_INCHES } from '../shared/compose.js';
import { mockup, PREVIEW } from './mockups.js';
import { CONFIG } from './config.js';
import { COUNTRIES, REGIONS } from './places.js';
import { measure, textEl, draw, fontsReady } from './draw.js';
import { enhance } from './ui.js';

enhance();

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } },
};
const entryFor = (sentence, id) => (id && byEntry[id] && byEntry[id].text === sentence ? byEntry[id] : CATALOGUE.find(e => e.text === sentence) || null);

const listOf = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

const PX_PER_IN = 100;
// the Grammarian's Note for a drawing, as runs of type, written once
function noteOf(d) {
  if (!d.noteRuns) { try { d.noteRuns = noteRuns(analyse(d.tree)); } catch (e) { d.noteRuns = []; } }
  return d.noteRuns;
}
const takesNote = id => !!byId[id].art.note;

function artwork(drawing, productId, opts, caption, { preview = true, cite = null, note = false } = {}) {
  const base = byId[productId];
  const pv = preview && PREVIEW[productId];
  const product = pv ? { ...base, art: pv.art, area: pv.area } : base;
  let inches = product.area(opts).slice();
  const orient = orientation(base, drawing);
  if (orient === 'landscape' && inches[1] > inches[0]) inches = [inches[1], inches[0]];
  const W = inches[0] * PX_PER_IN, H = inches[1] * PX_PER_IN;
  const diagram = { w: drawing.w, h: drawing.h, write: ({ stroke, knock, ink }) => writePrims(drawing.prims, { ink, knock, stroke }) };
  const out = compose({ product, opts, W, H, inches, diagram, caption: caption ? drawing.sentence : null, attribution: caption ? cite : null, note: note && takesNote(productId) ? noteOf(drawing) : null, text: textEl, measure });
  return { ...out, orient };
}
// will the figure's words, and the note's, print large enough to read?
function fit(drawing, productId, opts, caption, cite = null, note = false) {
  const a = artwork(drawing, productId, opts, caption, { preview: false, cite, note });
  return { text: a.textInches >= MIN_TEXT_INCHES, note: a.noteOk };
}
function legible(drawing, productId, opts, caption, cite = null, note = false) {
  const f = fit(drawing, productId, opts, caption, cite, note);
  return f.text && f.note;
}
function picture(drawing, productId, opts, caption, cite = null, note = false) {
  const a = artwork(drawing, productId, opts, caption, { cite, note });
  return mockup(productId, opts, a.svg, a.orient);
}
// the citation printed beneath the sentence, when it comes from the Catalogue and the customer wants it
const currentCite = () => (state.entry && state.withCite ? state.entry.cite : null);

// --- state ---------------------------------------------------------------
const params = new URLSearchParams(location.search);
const state = {
  sentence: params.get('s') || store.get('dco-sentence', '') || $('#sentence').value,
  product: PRODUCTS.some(p => p.id === params.get('p')) ? params.get('p') : 'plate',
  opts: Object.fromEntries(PRODUCTS.map(p => [p.id, defaultOptions(p)])),
  caption: true,
  qty: 1,
  figure: false,
  drawing: null,
  entry: null,
  withCite: true,
  note: false,
};
state.entry = entryFor(state.sentence, params.get('src'));
let bag = store.get('dco-bag', []).filter(it => lookup(it.product, it.opts));
let dest = store.get('dco-dest', { country: 'US', state: 'NY' });

// --- composing -----------------------------------------------------------
function composeSentence(text, sourceId = null) {
  const s = text.replace(/\s+/g, ' ').trim();
  const err = $('#compose-error');
  err.textContent = '';
  if (!s) { err.textContent = 'Write a sentence, and we shall draw it.'; return false; }
  if (s.length > LIMITS.sentenceChars) { err.textContent = `A little long for our presses — ${LIMITS.sentenceChars} characters at most.`; return false; }
  try {
    const d = draw(s);
    state.sentence = s;
    state.drawing = d;
    state.entry = entryFor(s, sourceId);
    if (d.multiple) err.textContent = 'We set one sentence per piece; the first has been drawn.';
  } catch (e) {
    console.error(e);
    err.textContent = 'That one defeated our compositor. Try phrasing it another way.';
    return false;
  }
  store.set('dco-sentence', state.sentence);
  const u = new URL(location.href);
  u.searchParams.set('s', state.sentence);
  if (state.entry) u.searchParams.set('src', state.entry.id); else u.searchParams.delete('src');
  history.replaceState(null, '', u);
  renderAll();
  return true;
}

function renderAll() {
  renderSpecimen(state.drawing);
  renderStage();
  renderThumbs();
  renderPanel();
  renderGrid();
}

// the plate beside the hero, which follows the sentence as it is written
const quiet = window.matchMedia('(prefers-reduced-motion: reduce)');
let shown = '';
function renderSpecimen(d) {
  const fig = $('#specimen-fig');
  if (!fig || !d || d.sentence === shown) return;
  shown = d.sentence;
  // drawn a touch larger than life, and never wider than the plate
  const svg = d.svg.replace(/ width="([\d.]+)" height="([\d.]+)"/, (m, w, h) => ` width="${Math.round(w * 1.65)}" height="${Math.round(h * 1.65)}"`);
  fig.innerHTML = svg;
  const el = fig.querySelector('svg');
  el.setAttribute('aria-label', `The diagram of “${d.sentence}”`);
  $('#specimen-cap').textContent = d.sentence;
  if (!quiet.matches && el.animate) el.animate([{ opacity: 0.25, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,.61,.36,1)' });
}
let typing;
function previewTyping(text) {
  clearTimeout(typing);
  typing = setTimeout(() => {
    const s = text.replace(/\s+/g, ' ').trim();
    if (!s || s.length > LIMITS.sentenceChars) return;
    try { renderSpecimen(draw(s)); } catch (e) { /* keep the last good figure */ }
  }, 220);
}

function renderStage() {
  const stage = $('#stage');
  const d = state.drawing;
  if (!d) return;
  if (state.figure) {
    stage.innerHTML = `<div class="figure-view">${d.svg.replace('<svg ', '<svg style="color:#1b1712" ')}</div>`;
    const svg = stage.querySelector('svg');
    svg.querySelectorAll('line, path').forEach(el => { el.setAttribute('stroke', '#1b1712'); el.setAttribute('fill', 'none'); el.setAttribute('stroke-width', '1.3'); if (el.classList.contains('dash')) el.setAttribute('stroke-dasharray', '4.5 4'); });
    svg.querySelectorAll('text').forEach(el => { el.setAttribute('fill', '#1b1712'); el.setAttribute('font-family', "'IM Fell English', Georgia, serif"); el.setAttribute('font-style', 'italic'); });
    svg.querySelectorAll('rect').forEach(el => el.setAttribute('fill', '#fffdf8'));
    svg.setAttribute('aria-label', `The diagram of “${d.sentence}”`);
  } else {
    stage.innerHTML = picture(d, state.product, state.opts[state.product], state.caption, currentCite(), state.note);
    stage.querySelector('svg').setAttribute('aria-label', `${byId[state.product].name} bearing the diagram of “${d.sentence}”`);
  }
  $('#toggle-figure').textContent = state.figure ? 'Return to the piece' : 'View the figure alone';
}

function renderThumbs() {
  const host = $('#thumbs');
  host.innerHTML = '';
  for (const p of PRODUCTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.setAttribute('aria-pressed', String(p.id === state.product));
    b.setAttribute('aria-label', p.name);
    b.innerHTML = picture(state.drawing, p.id, state.opts[p.id], state.caption, currentCite(), state.note);
    b.addEventListener('click', () => choose(p.id, false));
    host.appendChild(b);
  }
}

function minPrice(p) { return Math.min(...Object.values(p.variants).map(v => v.price)); }

function renderGrid() {
  const host = $('#grid');
  host.innerHTML = '';
  for (const p of PRODUCTS) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'card';
    c.innerHTML = `<div class="pic">${picture(state.drawing, p.id, state.opts[p.id], true, currentCite())}</div><p class="k">${esc(p.kicker)}</p><p class="n">${esc(p.name)}</p><p class="p">from ${money(minPrice(p))}</p>`;
    c.setAttribute('aria-label', `${p.name}, from ${money(minPrice(p))}`);
    c.addEventListener('click', () => choose(p.id, true));
    host.appendChild(c);
  }
}

function choose(id, scroll) {
  state.product = id;
  state.figure = false;
  state.qty = 1;
  renderStage();
  renderPanel();
  document.querySelectorAll('#thumbs .thumb').forEach((t, i) => t.setAttribute('aria-pressed', String(PRODUCTS[i].id === id)));
  if (scroll) $('#atelier').scrollIntoView({ behavior: 'smooth' });
}

function renderPanel() {
  const p = byId[state.product];
  const opts = state.opts[p.id];
  const found = lookup(p.id, opts);
  const d = state.drawing;
  const complete = d.complete;
  const f = fit(d, p.id, opts, state.caption, currentCite(), state.note);
  const ok = complete && f.text && f.note;
  const panel = $('#panel');
  const optHTML = p.options.map(o => {
    const cur = o.values.find(v => v.v === opts[o.key]);
    const btns = o.values.map(v => {
      const sel = v.v === opts[o.key];
      const fits = legible(d, p.id, { ...opts, [o.key]: v.v }, state.caption, currentCite(), state.note);
      const label = v.label || v.v;
      if (v.swatch) return `<button type="button" class="choice swatch" role="radio" aria-checked="${sel}" aria-label="${esc(label)}" title="${esc(label)}" data-k="${o.key}" data-v="${esc(v.v)}"><span style="background:${v.swatch}"></span></button>`;
      return `<button type="button" class="choice" role="radio" aria-checked="${sel}" data-k="${o.key}" data-v="${esc(v.v)}"${fits ? '' : ' title="Too fine to read at this size"'}>${esc(label)}</button>`;
    }).join('');
    return `<fieldset class="opt"><legend>${esc(o.label)} <span class="val">${esc(cur ? (cur.label || cur.v) : '')}</span></legend><div class="choices" role="radiogroup" aria-label="${esc(o.label)}">${btns}</div></fieldset>`;
  }).join('');
  panel.innerHTML = `
    <p class="kicker">${esc(p.kicker)}</p>
    <h2>${esc(p.name)}</h2>
    <p class="price">${money(found.variant.price)}</p>
    <p class="blurb">${esc(p.blurb)}</p>
    <div class="sentence-card"><div class="lbl"><span>${state.entry ? 'From the Catalogue' : 'Your sentence'}</span><button type="button" id="edit-sentence">Change</button></div><div class="s">${esc(d.sentence)}</div>${state.entry ? `<div class="cite">— ${esc(state.entry.cite)}</div>` : ''}</div>
    ${optHTML}
    <label class="check"><input type="checkbox" id="caption" ${state.caption ? 'checked' : ''}> <span>Set the sentence in italic beneath the figure</span></label>
    ${state.entry && state.caption ? `<label class="check"><input type="checkbox" id="with-cite" ${state.withCite ? 'checked' : ''}> <span>…with its source beneath it</span></label>` : ''}
    ${takesNote(p.id)
      ? `<label class="check"><input type="checkbox" id="with-note" ${state.note ? 'checked' : ''}> <span>Add the Grammarian’s Note: the sentence parsed in words, as the old grammars did, set small beneath the figure <button type="button" class="read-note" id="read-note">Read it</button></span></label>`
      : `<p class="check-off">The Grammarian’s Note is set on ${listOf(PRODUCTS.filter(x => x.art.note).map(x => 'the ' + x.short.toLowerCase()))}; the ${esc(p.short.toLowerCase())} has no room for it.</p>`}
    <div class="buy">
      <div class="qty" aria-label="Quantity"><button type="button" data-q="-1" aria-label="One fewer">−</button><output id="qty">${state.qty}</output><button type="button" data-q="1" aria-label="One more">+</button></div>
      <button class="btn" type="button" id="add" ${ok ? '' : 'disabled'}>Add to Bag — ${money(found.variant.price * state.qty)}</button>
    </div>
    ${!complete ? `<p class="warn">Our compositor could not find a place for every word of this sentence, and we print only complete figures. Try phrasing it a little differently.</p>`
      : !f.text ? `<p class="warn">At this size the words would print too small to read comfortably. A larger size, or the framed plate, will serve it better.</p>`
      : !f.note ? `<p class="warn">The Grammarian’s Note runs too long to set legibly on this piece at this size. A larger size, or the framed plate, will take it.</p>` : ''}
    <ul class="assure">
      <li>Made to order; leaves the printer in 2–5 business days</li>
      <li>Shipping quoted in your bag before you pay</li>
      <li>Replaced at no cost if it arrives damaged or misprinted</li>
    </ul>
    <details class="more"><summary>The Particulars</summary><div class="body"><p>${p.details.map(esc).join(' · ')}.</p></div></details>
    <details class="more" id="note-details"><summary>The Grammarian’s Note</summary><div class="body"><p>${analyse(d.tree)}</p></div></details>
  `;
  panel.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => {
    state.opts[p.id] = { ...state.opts[p.id], [b.dataset.k]: b.dataset.v };
    renderStage(); renderPanel();
    const t = document.querySelectorAll('#thumbs .thumb')[PRODUCTS.indexOf(p)];
    if (t) t.innerHTML = picture(state.drawing, p.id, state.opts[p.id], state.caption, currentCite(), state.note);
  }));
  $('#caption').addEventListener('change', e => { state.caption = e.target.checked; renderStage(); renderPanel(); renderThumbs(); });
  const wc = $('#with-cite');
  if (wc) wc.addEventListener('change', e => { state.withCite = e.target.checked; renderStage(); renderPanel(); renderThumbs(); });
  const wn = $('#with-note');
  if (wn) wn.addEventListener('change', e => { state.note = e.target.checked; renderStage(); renderPanel(); renderThumbs(); });
  const rn = $('#read-note');
  if (rn) rn.addEventListener('click', e => {
    e.preventDefault();
    const det = $('#note-details');
    det.open = true;
    det.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  panel.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    state.qty = Math.max(1, Math.min(LIMITS.qtyPerItem, state.qty + Number(b.dataset.q)));
    $('#qty').textContent = state.qty;
    $('#add').textContent = `Add to Bag — ${money(found.variant.price * state.qty)}`;
  }));
  $('#add').addEventListener('click', addToBag);
  $('#edit-sentence').addEventListener('click', () => { const i = $('#sentence'); i.focus(); i.select(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

// --- the Catalogue on the front page -------------------------------------
function renderFeatured() {
  const host = $('#featured');
  if (!host) return;
  const picks = CATALOGUE.filter(e => e.featured).slice(0, 6);
  const fig = e => { try { return draw(e.text).svg.replace(/ width="[\d.]+" height="[\d.]+"/, ''); } catch (err) { return ''; } };
  host.innerHTML = picks.map(e => `<article class="entry"><a class="entry-link" href="?s=${encodeURIComponent(e.text)}&src=${encodeURIComponent(e.id)}" data-entry="${esc(e.id)}">
      <div class="entry-fig" aria-hidden="true">${fig(e)}</div>
      <p class="entry-text">${esc(e.text)}</p><p class="entry-cite">${esc(e.cite)}</p><span class="entry-cta">Commission this sentence <span aria-hidden="true">→</span></span></a></article>`).join('');
  host.querySelectorAll('[data-entry]').forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault();
    const e = byEntry[a.dataset.entry];
    $('#sentence').value = e.text;
    if (composeSentence(e.text, e.id)) $('#atelier').scrollIntoView({ behavior: 'smooth' });
  }));
}

// --- the bag -------------------------------------------------------------
function saveBag() {
  store.set('dco-bag', bag);
  const n = bag.reduce((k, it) => k + it.qty, 0);
  const c = $('#bag-count');
  c.textContent = n; c.dataset.n = n;
}

function addToBag() {
  const p = byId[state.product];
  const opts = { ...state.opts[p.id] };
  const source = state.entry ? state.entry.id : null;
  const cite = !!(state.entry && state.withCite && state.caption);
  const note = !!(state.note && takesNote(p.id));
  const same = bag.find(it => it.product === p.id && it.sentence === state.sentence && it.caption === state.caption && !!it.cite === cite && !!it.note === note && JSON.stringify(it.opts) === JSON.stringify(opts));
  if (same) same.qty = Math.min(LIMITS.qtyPerItem, same.qty + state.qty);
  else bag.push({ id: Math.random().toString(36).slice(2, 10), product: p.id, opts, qty: state.qty, sentence: state.sentence, caption: state.caption, source, cite, note });
  if (bag.length > LIMITS.itemsPerOrder) { bag.pop(); toast(`At most ${LIMITS.itemsPerOrder} pieces to an order`); }
  saveBag();
  const b = $('#open-bag'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  openBag();
}

let quoteSeq = 0;
let lastQuote = null;
function renderBag() {
  const lines = $('#lines');
  const foot = $('#bag-foot');
  if (!bag.length) {
    lines.innerHTML = '<p class="empty">Your bag is empty.<br>Compose a sentence and choose its setting.</p>';
    foot.innerHTML = '';
    return;
  }
  lines.innerHTML = '';
  for (const it of bag) {
    const p = byId[it.product];
    const f = lookup(it.product, it.opts);
    let pic = '';
    const itCite = it.cite && it.source && byEntry[it.source] ? byEntry[it.source].cite : null;
    try { pic = picture(draw(it.sentence), it.product, it.opts, it.caption, itCite, it.note); } catch (e) { /* drawn at checkout */ }
    const row = document.createElement('div');
    row.className = 'line';
    row.innerHTML = `<div class="pic">${pic}</div>
      <div><p class="nm">${esc(p.name)}</p><p class="op">${esc(optionLabel(p, it.opts))}${it.caption ? '' : ' · without caption'}${it.note ? ' · with the Grammarian’s Note' : ''}</p><p class="se">${esc(it.sentence)}</p>${itCite ? `<p class="op">— ${esc(itCite)}</p>` : ''}
        <div class="ctl"><div class="qty"><button type="button" data-d="-1" aria-label="One fewer">−</button><output>${it.qty}</output><button type="button" data-d="1" aria-label="One more">+</button></div><button type="button" class="rm">Remove</button></div></div>
      <div class="amt">${money(f.variant.price * it.qty)}</div>`;
    row.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      it.qty = Math.max(1, Math.min(LIMITS.qtyPerItem, it.qty + Number(b.dataset.d)));
      saveBag(); renderBag();
    }));
    row.querySelector('.rm').addEventListener('click', () => { bag = bag.filter(x => x !== it); saveBag(); renderBag(); });
    lines.appendChild(row);
  }
  const subtotal = bag.reduce((s, it) => s + lookup(it.product, it.opts).variant.price * it.qty, 0);
  const regions = REGIONS[dest.country];
  foot.innerHTML = `
    <div class="ship">
      <div class="${regions ? '' : 'full'}"><label for="ship-country">Ship to</label><select id="ship-country">${COUNTRIES.map(([c, n]) => `<option value="${c}"${c === dest.country ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      ${regions ? `<div><label for="ship-state">${dest.country === 'CA' ? 'Province' : 'State'}</label><select id="ship-state">${regions.map(([c, n]) => `<option value="${c}"${c === dest.state ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : ''}
    </div>
    <div class="sum"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="sum"><span>Shipping</span><span id="ship-amt" class="note">${CONFIG.apiBase ? 'Calculating…' : 'Calculated at checkout'}</span></div>
    <div class="sum total"><span>Total</span><span id="total-amt">${money(subtotal)}</span></div>
    <button class="btn wide" type="button" id="checkout">Proceed to Checkout</button>
    <p class="err" id="checkout-err" role="alert"></p>
    <p class="fine">Payment is taken securely by Stripe. Taxes, where due, are shown before you pay.</p>`;
  $('#ship-country').addEventListener('change', e => {
    dest.country = e.target.value;
    const r = REGIONS[dest.country];
    dest.state = r ? r[0][0] : '';
    store.set('dco-dest', dest); renderBag();
  });
  const ss = $('#ship-state');
  if (ss) ss.addEventListener('change', e => { dest.state = e.target.value; store.set('dco-dest', dest); requestQuote(subtotal); });
  $('#checkout').addEventListener('click', checkout);
  requestQuote(subtotal);
}

async function requestQuote(subtotal) {
  if (!CONFIG.apiBase) return;
  const seq = ++quoteSeq;
  const items = bag.map(({ product, opts, qty }) => ({ product, opts, qty }));
  try {
    const r = await fetch(CONFIG.apiBase + '/api/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items, country: dest.country, state: dest.state }) });
    const j = await r.json();
    if (seq !== quoteSeq) return;
    if (!r.ok) throw new Error(j.error || 'No quote');
    lastQuote = j.shipping;
    const amt = $('#ship-amt');
    if (amt) { amt.textContent = money(j.shipping.cents) + (j.shipping.min ? ` · ${j.shipping.min}–${j.shipping.max} days` : ''); amt.classList.remove('note'); }
    const tot = $('#total-amt');
    if (tot) tot.textContent = money(subtotal + j.shipping.cents);
  } catch (e) {
    if (seq !== quoteSeq) return;
    const amt = $('#ship-amt');
    if (amt) { amt.textContent = e.message && /ship/i.test(e.message) ? e.message : 'Calculated at checkout'; amt.classList.add('note'); }
  }
}

async function checkout() {
  const btn = $('#checkout');
  const err = $('#checkout-err');
  err.textContent = '';
  if (!CONFIG.apiBase) {
    err.textContent = 'Our counting-house opens shortly. Your bag will keep until then.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'One moment…';
  try {
    const items = bag.map(it => ({ product: it.product, opts: it.opts, qty: it.qty, sentence: it.sentence, caption: it.caption, source: it.source || undefined, cite: !!it.cite, note: it.note ? analyse(draw(it.sentence).tree) : undefined, svg: draw(it.sentence).svg }));
    const r = await fetch(CONFIG.apiBase + '/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items, country: dest.country, state: dest.state, site: location.origin + location.pathname }) });
    const j = await r.json();
    if (!r.ok || !j.url) throw new Error(j.error || 'The counting-house did not answer.');
    store.set('dco-pending', { at: Date.now(), count: bag.length });
    location.href = j.url;
  } catch (e) {
    err.textContent = e.message;
    btn.disabled = false;
    btn.textContent = 'Proceed to Checkout';
  }
}

let lastFocus = null;
function openBag() {
  lastFocus = document.activeElement;
  renderBag();
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('open');
  setTimeout(() => $('#close-bag').focus(), 50);
}
function closeBag() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').classList.remove('open');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

let toastTimer;
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// --- boot ----------------------------------------------------------------
async function boot() {
  await fontsReady();
  $('#sentence').value = state.sentence;
  if (!composeSentence(state.sentence, params.get('src'))) composeSentence('The old man walked slowly to the village.');
  saveBag();

  $('#sentence').addEventListener('input', e => previewTyping(e.target.value));
  $('#compose').addEventListener('submit', e => {
    e.preventDefault();
    if (composeSentence($('#sentence').value)) $('#atelier').scrollIntoView({ behavior: 'smooth' });
  });
  document.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => {
    const e = byEntry[b.dataset.src];
    if (!e) return;
    $('#sentence').value = e.text;
    if (composeSentence(e.text, e.id)) $('#atelier').scrollIntoView({ behavior: 'smooth' });
  }));
  renderFeatured();
  $('#toggle-figure').addEventListener('click', () => { state.figure = !state.figure; renderStage(); });
  $('#open-bag').addEventListener('click', openBag);
  $('#close-bag').addEventListener('click', closeBag);
  $('#scrim').addEventListener('click', closeBag);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#drawer').classList.contains('open')) closeBag(); });
  if (location.hash === '#bag') { history.replaceState(null, '', location.pathname + location.search); openBag(); }
}

boot();
