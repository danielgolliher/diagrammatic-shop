// Diagrammatic & Co. — the Catalogue page.
import { CATALOGUE, GROUPS } from '../shared/catalogue.js';
import { draw, fontsReady } from './draw.js';
import { enhance } from './ui.js';

enhance();

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");

const params = new URLSearchParams(location.search);
let group = GROUPS.some(g => g.id === params.get('c')) ? params.get('c') : 'all';
let query = '';
let ready = false;

function link(e) { return `./?s=${encodeURIComponent(e.text)}&src=${encodeURIComponent(e.id)}#atelier`; }

function card(e) {
  return `<article class="entry">
    <a class="entry-link" href="${link(e)}">
      <div class="entry-fig" data-id="${esc(e.id)}" aria-hidden="true"></div>
      <p class="entry-text">${esc(e.text)}</p>
      <p class="entry-cite">${esc(e.cite)}${e.excerpt ? ' <span class="excerpt">· excerpt</span>' : ''}</p>
      <span class="entry-cta">Commission this sentence <span aria-hidden="true">→</span></span>
    </a>
  </article>`;
}

function render() {
  const q = fold(query.trim());
  const hits = CATALOGUE.filter(e => (group === 'all' || e.group === group) && (!q || fold(`${e.text} ${e.cite}`).includes(q)));
  const list = $('#list');
  if (!hits.length) { list.innerHTML = `<p class="empty">Nothing in the catalogue matches “${esc(query)}”. You may of course <a href="./">compose any sentence of your own</a>.</p>`; return; }
  const groups = group === 'all' ? GROUPS : GROUPS.filter(g => g.id === group);
  list.innerHTML = groups.map(g => {
    const items = hits.filter(e => e.group === g.id);
    if (!items.length) return '';
    return `<section class="cat-group" aria-labelledby="g-${g.id}"><header><h2 id="g-${g.id}">${esc(g.name)}</h2><p>${esc(g.note)}</p><span class="n">${items.length} ${items.length === 1 ? 'sentence' : 'sentences'}</span></header><div class="entries">${items.map(card).join('')}</div></section>`;
  }).join('');
  if (ready) observe();
}

// figures are drawn as they scroll into view
const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); figure(en.target); }
}, { rootMargin: '300px 0px' }) : null;
function figure(el) {
  const e = CATALOGUE.find(x => x.id === el.dataset.id);
  if (!e || el.firstChild) return;
  try { el.innerHTML = draw(e.text).svg.replace(/ width="[\d.]+" height="[\d.]+"/, ''); } catch (err) { console.error(err); }
}
function observe() {
  document.querySelectorAll('.entry-fig:empty').forEach(el => (io ? io.observe(el) : figure(el)));
}

function tabs() {
  const host = $('#tabs');
  const all = [{ id: 'all', name: 'All' }, ...GROUPS];
  host.innerHTML = all.map(g => `<button type="button" role="tab" aria-selected="${g.id === group}" data-g="${g.id}">${esc(g.name)}</button>`).join('');
  host.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    group = b.dataset.g;
    host.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    const u = new URL(location.href);
    if (group === 'all') u.searchParams.delete('c'); else u.searchParams.set('c', group);
    history.replaceState(null, '', u);
    render();
    // if the bar has stuck beneath the masthead, bring the top of the list up to meet it
    const head = $('.cat-head'), mast = $('.masthead');
    const top = head.offsetTop + head.offsetHeight - (mast ? mast.offsetHeight : 0);
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }));
}

function bagCount() {
  try {
    const bag = JSON.parse(localStorage.getItem('dco-bag') || '[]');
    const n = bag.reduce((k, it) => k + (it.qty || 0), 0);
    $('#bag-count').textContent = n; $('#bag-count').dataset.n = n;
  } catch (e) { /* private window */ }
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const inWords = n => (n < 20 ? WORDS[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + WORDS[n % 10] : ''));

async function boot() {
  $('#count').textContent = inWords(CATALOGUE.length);
  bagCount();
  tabs();
  render();
  $('#search').addEventListener('input', e => { query = e.target.value; render(); });
  await fontsReady();
  ready = true;
  observe();
}
boot();
