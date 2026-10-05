// Diagrammatic & Co. — composing the artwork.
// Places a diagram (and its sentence, as a caption) within a product's print
// area.  The shop window uses it for previews with nominal print sizes; the
// worker uses it with Printful's real print-file dimensions to make the file
// that is printed.  Same arithmetic both sides, so what is shown is what is made.

import { INK, PAPER } from './catalog.js';
import { noteWords } from './note.js';

const DIAGRAM_FS = 17;   // the engine's word size, in diagram units
const r = v => Math.round(v * 100) / 100;

// Should this plate turn to landscape for a wide sentence?
export function orientation(product, diagram) {
  return product.rotate && diagram.w / diagram.h > 1.2 ? 'landscape' : 'portrait';
}

export function wrap(text, maxW, size, style, measure) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && measure(t, size, style) > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// The Grammarian's Note: a justified paragraph, run in after "Analysis.—" in
// small capitals as the old grammars set it.  Returns the lines at a size that
// fits within maxH, or the smallest legible size if nothing fits.
const NOTE_LABEL = 'Analysis.—';
function setNote(runs, { size, floor, maxW, maxH, measure }) {
  const words = noteWords(runs);
  words[0] = [{ t: NOTE_LABEL, style: 'sc' }, ...words[0]];
  let s = size;
  for (;;) {
    const width = s * 36 < maxW ? s * 36 : maxW;            // a comfortable measure
    const space = measure(' ', s, 'roman');
    const wordW = words.map(w => w.reduce((a, p) => a + measure(p.t, s, p.style), 0));
    const lines = [];
    let cur = [], used = 0;
    words.forEach((w, k) => {
      const add = (cur.length ? space : 0) + wordW[k];
      if (cur.length && used + add > width) { lines.push({ words: cur, used }); cur = []; used = 0; }
      used += (cur.length ? space : 0) + wordW[k];
      cur.push(k);
    });
    if (cur.length) lines.push({ words: cur, used });
    const lead = s * 1.36;
    const h = lines.length * lead;
    if (h <= maxH || s <= floor) return { size: s, lead, width, space, lines, words, wordW, h, fits: h <= maxH };
    s = Math.max(floor, s * 0.92);
  }
}

/**
 * compose({ product, opts, W, H, inches, diagram:{w,h,write(stroke)}, caption, note, plateNo, text, measure })
 *   W, H     print area in pixels (already oriented)
 *   inches   [w, h] physical size, for legibility and line weight
 *   diagram.write({stroke, knock, ink}) → inner markup in diagram units
 *   text(s, x, y, size, style, anchor, fill) → markup for a line of type
 *   measure(s, size, style) → advance width
 *   note     the Grammarian's Note as runs of type (see note.js), or null
 * Returns { svg, textInches, scale, noteOk }
 */
export function compose({ product, opts, W, H, inches, diagram, caption, attribution = null, note = null, plateNo = 'I', text, measure }) {
  const spec = product.art;
  const inkName = product.ink(opts);
  const ink = INK[inkName];
  const cloth = product.cloth ? product.cloth(opts) : PAPER;
  const base = Math.min(W, H);
  const pxPerIn = W / inches[0];
  let out = '';

  if (spec.bg === 'full') out += `<rect width="${r(W)}" height="${r(H)}" fill="${PAPER}"/>`;
  if (spec.bg === 'card') {
    const rad = base * (spec.radius || 0.06);
    out += `<rect width="${r(W)}" height="${r(H)}" rx="${r(rad)}" fill="${PAPER}"/>`;
    // a fine keyline inside the card's edge, as on a printed label
    const k = base * 0.035;
    out += `<rect x="${r(k)}" y="${r(k)}" width="${r(W - 2 * k)}" height="${r(H - 2 * k)}" rx="${r(rad * 0.7)}" fill="none" stroke="${ink}" stroke-width="${r(Math.max(base * 0.004, pxPerIn * 0.012))}" opacity="0.55"/>`;
  }
  const knock = spec.bg ? PAPER : cloth;

  const withNote = !!(note && note.length && spec.note);
  let noteOk = true;
  const boxes = [];
  const [bx, by, bw, bh] = withNote && spec.noteBox ? spec.noteBox : spec.box;
  boxes.push([bx * W, by * H, bw * W, bh * H]);
  if (spec.copies === 2) boxes.push([(1 - bx - bw) * W, by * H, bw * W, bh * H]);

  let scale = 1;
  for (const [x0, y0, w0, h0] of boxes) {
    // caption
    let capSize = base * (spec.captionSmall ? 0.045 : 0.036);
    capSize = Math.max(capSize, pxPerIn * 0.085);              // never below ~6pt
    let capLines = caption ? wrap(caption, w0 * 0.96, capSize, 'italic', measure) : [];
    if (capLines.length > 3) {
      capSize *= 0.82;
      capLines = wrap(caption, w0 * 0.98, capSize, 'italic', measure);
    }
    const lead = capSize * 1.32;
    const figSize = capSize * 0.82;
    const figH = spec.fig && caption ? figSize * 1.6 : 0;
    // the source, in small capitals, beneath the sentence
    const citeSize = capSize * 0.78;
    const citeLines = attribution && capLines.length ? wrap(`— ${attribution}`, w0 * 0.96, citeSize, 'sc', measure) : [];
    const citeH = citeLines.length ? citeSize * 0.7 + citeSize * 1.3 * citeLines.length : 0;
    let capH = capLines.length ? figH + lead * capLines.length + citeH : 0;
    // the note beneath, smaller, never below about 7pt, taking at most two fifths of the box
    let set = null;
    if (withNote) {
      set = setNote(note, { size: capSize * 0.56, floor: pxPerIn * NOTE_MIN_INCHES, maxW: w0 * 0.96, maxH: h0 * 0.4, measure });
      if (!set.fits) noteOk = false;
      capH += set.size * (capLines.length ? 2.2 : 0.6) + set.h;
    }
    const gap = capLines.length || set ? Math.max(capSize * 1.4, h0 * 0.06) : 0;

    // the diagram, as large as the box allows within a sensible type size
    const maxScale = (spec.maxText * base) / DIAGRAM_FS;
    const s = Math.min(w0 / diagram.w, (h0 - capH - gap) / diagram.h, maxScale);
    scale = s;
    const dw = diagram.w * s, dh = diagram.h * s;
    const gh = dh + gap + capH;
    const top = spec.top ? y0 : y0 + (h0 - gh) / 2;
    const left = x0 + (w0 - dw) / 2;
    // line weight: never finer than about 0.9pt as printed
    const minStrokePx = pxPerIn * 0.0125;
    const stroke = Math.max(1.3, minStrokePx / s);
    out += `<g transform="translate(${r(left)} ${r(top)}) scale(${r(s * 10000) / 10000})">${diagram.write({ stroke, knock, ink })}</g>`;

    let y = top + dh + gap;
    const cx = x0 + w0 / 2;
    if (figH) {
      y += figSize;
      out += text(`Plate ${plateNo}.`, cx, y, figSize, 'sc', 'middle', ink);
      y += figSize * 0.6;
    }
    for (const ln of capLines) {
      y += lead * (ln === capLines[0] ? 0.85 : 1);
      out += text(ln, cx, y, capSize, 'italic', 'middle', ink);
    }
    if (citeLines.length) {
      y += citeSize * 0.7;
      for (const ln of citeLines) { y += citeSize * 1.3; out += text(ln, cx, y, citeSize, 'sc', 'middle', ink); }
    }
    if (set) {
      const { size: ns, lead: nl, width: nw, space, lines, words, wordW } = set;
      if (capLines.length) {
        // a short rule between the caption and the note
        y += ns * 1.35;
        out += `<line x1="${r(cx - ns * 1.6)}" y1="${r(y)}" x2="${r(cx + ns * 1.6)}" y2="${r(y)}" stroke="${ink}" stroke-width="${r(Math.max(ns * 0.05, pxPerIn * 0.008))}" opacity="0.6"/>`;
        y += ns * 0.6;
      }
      const x0 = cx - nw / 2;
      lines.forEach((ln, li) => {
        y += nl * (li === 0 ? 0.9 : 1);
        // justified, but for the last line, or where the spaces would gape
        const gaps = ln.words.length - 1;
        let extra = li < lines.length - 1 && gaps ? (nw - ln.used) / gaps : 0;
        if (extra > space * 1.6) extra = 0;
        let x = x0;
        for (const k of ln.words) {
          let px = x;
          for (const piece of words[k]) { out += text(piece.t, px, y, ns, piece.style, 'start', ink); px += measure(piece.t, ns, piece.style); }
          x += wordW[k] + space + extra;
        }
      });
    }
  }
  if (spec.mark) {
    const ms = Math.max(base * 0.016, pxPerIn * 0.08);
    out += text('Diagrammatic & Co.', W / 2, H - base * 0.045, ms, 'sc', 'middle', ink);
  }
  const textInches = (DIAGRAM_FS * scale) / pxPerIn;
  return {
    scale, textInches, noteOk,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(W)} ${r(H)}" width="${r(W)}" height="${r(H)}">${out}</svg>`,
  };
}

// The smallest a diagram's words may be printed and still read comfortably.
export const MIN_TEXT_INCHES = 0.075;
// …and the smallest the note may be set: about 7pt
export const NOTE_MIN_INCHES = 0.1;
