// Diagrammatic & Co. — diagram primitives.
// The shop window draws a sentence with the diagram engine and sends the SVG
// with the order.  The worker never prints that markup as given: it is parsed
// here into bare primitives (lines, paths, knock-outs and words), checked, and
// written out afresh.  Every word drawn must come from the customer's sentence.

const TAG = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*="[^"]*")*)\s*(\/?)>/g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g;
const ALLOWED = new Set(['svg', 'defs', 'g', 'line', 'path', 'rect', 'text']);
const PATH_TOKEN = /[MLQC]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = v => { const n = Number(v); if (!Number.isFinite(n)) throw new Error('bad number'); return n; };
const r = v => Math.round(v * 100) / 100;

export class DiagramError extends Error {}

export function parseDiagram(svg) {
  if (typeof svg !== 'string' || svg.length > 200000) throw new DiagramError('missing or oversized diagram');
  const prims = [];
  let w = 0, h = 0, seenSvg = false;
  let openText = null, textStart = 0;
  let depth = 0;
  let m;
  TAG.lastIndex = 0;
  let last = 0;
  while ((m = TAG.exec(svg))) {
    const between = svg.slice(last, m.index);
    if (!openText && between.trim()) throw new DiagramError('stray text in diagram');
    last = TAG.lastIndex;
    const [, close, name, attrStr, selfClose] = m;
    const tag = name.toLowerCase();
    if (!ALLOWED.has(tag)) throw new DiagramError(`element <${tag}> not allowed`);
    const a = {};
    attrStr.replace(ATTR, (_, k, v) => { a[k] = v; return ''; });
    if (close) {
      if (tag === 'text' && openText) {
        openText.s = decode(svg.slice(textStart, m.index));
        if (/[<>]/.test(openText.s)) throw new DiagramError('markup inside a word');
        prims.push(openText);
        openText = null;
      }
      depth--;
      continue;
    }
    if (openText) throw new DiagramError('nested element inside a word');
    if (!selfClose) depth++;
    if (depth > 6) throw new DiagramError('too deeply nested');
    const cls = a.class || '';
    const loose = /\bloose\b/.test(cls);
    switch (tag) {
      case 'svg': {
        if (seenSvg) throw new DiagramError('nested svg');
        seenSvg = true;
        const vb = (a.viewBox || '').trim().split(/[\s,]+/).map(num);
        if (vb.length !== 4 || vb[0] !== 0 || vb[1] !== 0) throw new DiagramError('bad viewBox');
        [, , w, h] = vb;
        if (w <= 0 || h <= 0 || w > 8000 || h > 8000) throw new DiagramError('diagram out of bounds');
        break;
      }
      case 'line':
        prims.push({ t: 'line', x1: num(a.x1), y1: num(a.y1), x2: num(a.x2), y2: num(a.y2), dash: /\bdash\b/.test(cls), loose });
        break;
      case 'path': {
        const d = a.d || '';
        const toks = d.match(PATH_TOKEN) || [];
        if (toks.join('').length < d.replace(/[\s,]/g, '').length) throw new DiagramError('bad path data');
        const cmds = [];
        let cur = null;
        for (const tk of toks) {
          if (/^[MLQC]$/i.test(tk)) { cur = [tk.toUpperCase()]; cmds.push(cur); }
          else if (cur) cur.push(num(tk));
          else throw new DiagramError('bad path data');
        }
        for (const c of cmds) if ((c.length - 1) !== { M: 2, L: 2, Q: 4, C: 6 }[c[0]]) throw new DiagramError('bad path command');
        if (cmds.length > 12) throw new DiagramError('path too long');
        prims.push({ t: 'path', cmds, dash: /\bdash\b/.test(cls), loose });
        break;
      }
      case 'rect':
        if (!/\bknock\b/.test(cls)) throw new DiagramError('unexpected rectangle');
        prims.push({ t: 'knock', x: num(a.x), y: num(a.y), w: num(a.width), h: num(a.height) });
        break;
      case 'text': {
        let rot = 0;
        if (a.transform) {
          const tm = a.transform.match(/^rotate\((-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\)$/);
          if (!tm) throw new DiagramError('bad transform');
          rot = num(tm[1]);
        }
        const size = num(a['font-size'] || 17);
        if (size < 6 || size > 40) throw new DiagramError('bad type size');
        openText = { t: 'text', x: num(a.x), y: num(a.y), size, rot, role: /\blbl\b/.test(cls) ? 'lbl' : /\bund\b/.test(cls) ? 'und' : 'w', loose };
        textStart = TAG.lastIndex;
        if (selfClose) throw new DiagramError('empty word');
        break;
      }
    }
  }
  if (!seenSvg) throw new DiagramError('no diagram');
  if (openText) throw new DiagramError('unclosed word');
  // everything must sit within the drawing
  const inside = (x, y) => x > -60 && y > -60 && x < w + 60 && y < h + 60;
  let lines = 0, paths = 0, texts = 0;
  for (const p of prims) {
    if (p.t === 'line') { lines++; if (!inside(p.x1, p.y1) || !inside(p.x2, p.y2)) throw new DiagramError('line outside drawing'); }
    if (p.t === 'path') { paths++; for (const c of p.cmds) for (let k = 1; k < c.length; k += 2) if (!inside(c[k], c[k + 1])) throw new DiagramError('path outside drawing'); }
    if (p.t === 'text') { texts++; if (!inside(p.x, p.y)) throw new DiagramError('word outside drawing'); }
  }
  if (lines > 1500 || paths > 300 || texts > 400) throw new DiagramError('diagram too intricate');
  return { w, h, prims };
}

// --- words ----------------------------------------------------------------
const FUNCTION_WORDS = new Set(`you that whom which who what not do does did is am are was were be been will would shall should
  can could have has had us we it its and or but nor x them him her me i they he she there here`.split(/\s+/));

const norm = s => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\- ]+/g, ' ');

export function sentenceWords(sentence) {
  const words = new Set();
  for (const raw of norm(sentence).split(/\s+/)) {
    if (!raw) continue;
    const w = raw.replace(/^['\-]+|['\-]+$/g, '');
    if (!w) continue;
    words.add(w);
    for (const part of w.split(/['\-]/)) if (part) words.add(part);
  }
  return words;
}

export function wordAllowed(piece, words) {
  const p = piece.replace(/^['\-]+|['\-]+$/g, '');
  if (!p) return true;
  if (words.has(p) || FUNCTION_WORDS.has(p)) return true;
  if (p.length >= 2) for (const w of words) if (w.includes(p)) return true;   // halves of a word split over a bent line
  return false;
}

export function checkWords(prims, sentence) {
  const words = sentenceWords(sentence);
  for (const p of prims) {
    if (p.t !== 'text') continue;
    for (const piece of norm(p.s.replace(/[()…]/g, ' ')).split(/\s+/)) {
      if (piece && !wordAllowed(piece, words)) throw new DiagramError(`the word “${piece}” is not in the sentence`);
    }
  }
}

// The other direction: every word of the sentence must appear in the figure,
// so nothing the customer wrote can go missing from what is printed.
const EXPANSIONS = { "won't": ['will', 'not'], "can't": ['can', 'not'], "shan't": ['shall', 'not'], "ain't": ['am', 'not'] };
export function checkCoverage(prims, sentence) {
  const pieces = [];
  for (const p of prims) if (p.t === 'text' && !p.loose) for (const w of norm(p.s.replace(/[()…]/g, ' ')).split(/\s+/)) if (w) pieces.push(w.replace(/^['\-]+|['\-]+$/g, ''));
  const have = new Set(pieces);
  const joined = (w) => {
    // a word split over a bent or stepped line: two pieces that make it up
    for (const a of pieces) if (w.startsWith(a) && a.length < w.length && have.has(w.slice(a.length))) return true;
    return false;
  };
  const drawn = w => have.has(w) || joined(w);
  for (const raw of norm(sentence.replace(/[…]/g, ' ')).split(/\s+/)) {
    const w = raw.replace(/^['\-]+|['\-]+$/g, '');
    if (!w || !/[a-z0-9]/.test(w)) continue;
    if (drawn(w)) continue;
    if (w.includes("'")) {
      if (EXPANSIONS[w] && EXPANSIONS[w].every(drawn)) continue;
      const [head, tail] = [w.slice(0, w.indexOf("'")), w.slice(w.indexOf("'") + 1)];
      const base = tail === 't' ? head.replace(/n$/, '') : head;      // don't → do, isn't → is
      if ((base && drawn(base)) || (tail && drawn(tail))) continue;
    }
    if (w.includes('-') && w.split('-').every(x => !x || drawn(x))) continue;
    throw new DiagramError(`the word “${w}” is missing from the figure`);
  }
}

// --- writing out ----------------------------------------------------------
// opts: { ink, knock, stroke, toPath(text, x, y, size, rotDeg, role) → path data | null }
export function writePrims(prims, opts) {
  const { ink = '#1d1914', knock = '#f6f0e2', stroke = 1.3, toPath = null } = opts;
  const dash = `${r(stroke * 3.4)} ${r(stroke * 3)}`;
  const solid = [], dashed = [], knocks = [], words = [];
  for (const p of prims) {
    if (p.loose) continue;
    if (p.t === 'line') (p.dash ? dashed : solid).push(`M${r(p.x1)} ${r(p.y1)}L${r(p.x2)} ${r(p.y2)}`);
    else if (p.t === 'path') (p.dash ? dashed : solid).push(p.cmds.map(c => c[0] + c.slice(1).map(r).join(' ')).join(''));
    else if (p.t === 'knock') knocks.push(`<rect x="${r(p.x)}" y="${r(p.y)}" width="${r(p.w)}" height="${r(p.h)}" rx="2"/>`);
    else if (p.t === 'text') {
      if (toPath) {
        const d = toPath(p.s, p.x, p.y, p.size, p.rot, p.role);
        if (d) words.push(d.charAt(0) === '<' ? d : `<path d="${d}"/>`);
      } else {
        const tr = p.rot ? ` transform="rotate(${r(p.rot)} ${r(p.x)} ${r(p.y)})"` : '';
        words.push(`<text x="${r(p.x)}" y="${r(p.y)}" font-size="${p.size}"${tr}>${esc(p.s)}</text>`);
      }
    }
  }
  const lineAttrs = `fill="none" stroke="${ink}" stroke-width="${r(stroke)}" stroke-linecap="round" stroke-linejoin="round"`;
  let out = '';
  if (solid.length) out += `<path ${lineAttrs} d="${solid.join('')}"/>`;
  if (dashed.length) out += `<path ${lineAttrs.replace('stroke-linecap="round"', 'stroke-linecap="butt"')} stroke-dasharray="${dash}" d="${dashed.join('')}"/>`;
  if (knocks.length) out += `<g fill="${knock}">${knocks.join('')}</g>`;
  if (words.length) out += toPath ? `<g fill="${ink}">${words.join('')}</g>` : `<g fill="${ink}" font-family="'IM Fell English', Georgia, serif" font-style="italic">${words.join('')}</g>`;
  return out;
}
