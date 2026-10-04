// Diagrammatic & Co. — the thank-you page: what became of the order.
import { CONFIG } from './config.js';
import { byId, optionLabel, money } from '../shared/catalog.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sid = new URLSearchParams(location.search).get('session_id');

const STAGE = { 'awaiting payment': 0, received: 1, draft: 1, submitted: 1, pending: 1, inprocess: 2, onhold: 2, partial: 2, fulfilled: 3 };

function show(o) {
  const production = o.production || o.status;
  const shipped = (o.shipments || []).length > 0 || production === 'fulfilled';
  const stage = shipped ? 3 : (STAGE[production] ?? STAGE[o.status] ?? 1);
  if (o.status === 'refunded' || o.status === 'failed') {
    $('#title').textContent = 'Our Apologies';
    $('#lede').innerHTML = o.status === 'refunded'
      ? 'We were not able to have your order printed, and your payment has been refunded in full. It should appear on your statement within a few days.'
      : 'Something has gone amiss with your order. We have been alerted and will put it right.';
  } else if (!o.paid) {
    $('#lede').textContent = 'We are waiting to hear from the bank. This page will update itself.';
  } else {
    $('#lede').innerHTML = `Your order is with us${o.email ? ` and a receipt has gone to <i>${esc(o.email)}</i>` : ''}. Each piece is now being made for you; you will be sent tracking details when it is posted.`;
    try { localStorage.removeItem('dco-bag'); } catch (e) { /* fine */ }
  }
  const tl = $('#timeline');
  tl.hidden = !o.paid || o.status === 'refunded' || o.status === 'failed';
  tl.querySelectorAll('.st').forEach((el, i) => el.classList.toggle('done', i < stage));
  const rows = [];
  for (const it of o.items || []) {
    const p = byId[it.product];
    rows.push(`<div class="row"><span>${it.qty} × ${esc(p ? p.short : it.product)}</span><span style="text-align:right"><i>${esc(it.sentence)}</i><br><small style="color:var(--ink-3)">${esc(p ? optionLabel(p, it.opts) : '')}</small></span></div>`);
  }
  if (o.total != null) rows.push(`<div class="row"><span>Total paid</span><span>${money(o.total)}</span></div>`);
  for (const s of o.shipments || []) rows.push(`<div class="row"><span>Tracking</span><span>${esc(s.carrier || '')} ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.tracking || 'Follow the parcel')}</a>` : esc(s.tracking || '')}</span></div>`);
  const st = $('#status');
  st.innerHTML = rows.join('');
  st.hidden = !rows.length;
}

async function poll(n = 0) {
  if (!sid || !CONFIG.apiBase) { $('#lede').textContent = 'Thank you. Your receipt has the particulars of your order.'; return; }
  try {
    const r = await fetch(`${CONFIG.apiBase}/api/order?session_id=${encodeURIComponent(sid)}`);
    const o = await r.json();
    if (!r.ok) throw new Error(o.error);
    show(o);
    // the webhook may still be on its way; look again for a little while
    if ((o.status === 'received' || o.status === 'awaiting payment') && n < 20) setTimeout(() => poll(n + 1), 3000);
  } catch (e) {
    $('#lede').textContent = 'Thank you. Your receipt has the particulars of your order; this page could not reach our counting-house just now.';
  }
}
poll();
