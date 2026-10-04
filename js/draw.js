// Diagrammatic & Co. — drawing a sentence in the shop window.
import { tagText } from '../engine/tagger.js';
import { parseSentence, resetIds } from '../engine/parser.js';
import { Draughtsman, toSVG } from '../engine/layout.js';
import { parseDiagram, checkWords, checkCoverage } from '../shared/svgprims.js';

const ctx = document.createElement('canvas').getContext('2d');
const widths = new Map();
const FAMILY = { italic: 'italic {s}px "IM Fell English"', roman: '{s}px "IM Fell English"', sc: '{s}px "IM Fell English SC"' };
export function measure(s, size, style = 'italic') {
  const k = style + size + '|' + s;
  let w = widths.get(k);
  if (w == null) { ctx.font = FAMILY[style].replace('{s}', size) + ', Georgia, serif'; w = ctx.measureText(s).width; widths.set(k, w); }
  return w;
}
export const pen = new Draughtsman(measure);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function textEl(s, x, y, size, style, anchor, fill) {
  const fam = style === 'sc' ? "'IM Fell English SC'" : "'IM Fell English'";
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size.toFixed(2)}" font-family="${fam}, Georgia, serif" font-style="${style === 'italic' ? 'italic' : 'normal'}" text-anchor="${anchor === 'middle' ? 'middle' : 'start'}" fill="${fill}">${esc(s)}</text>`;
}

export async function fontsReady() {
  try {
    await Promise.race([
      Promise.all(['italic 17px "IM Fell English"', '17px "IM Fell English"', '17px "IM Fell English SC"'].map(f => document.fonts.load(f))),
      new Promise(r => setTimeout(r, 3000)),
    ]);
  } catch (e) { /* fall back to Georgia's measures */ }
  widths.clear();
}

const drawings = new Map();
export function draw(sentence) {
  if (drawings.has(sentence)) return drawings.get(sentence);
  resetIds();
  const sens = tagText(sentence);
  if (!sens.length) throw new Error('Write a sentence first.');
  const sen = sens[0];
  const tree = parseSentence(sen.tokens, sen.end);
  const svg = toSVG(pen.sentence(tree), { title: '' }).svg;
  const d = parseDiagram(svg);
  checkWords(d.prims, sentence);
  let complete = !d.prims.some(x => x.loose) && sens.length === 1;
  try { checkCoverage(d.prims, sentence); } catch (e) { complete = false; }
  const out = { sentence, svg, tree, w: d.w, h: d.h, prims: d.prims, complete, multiple: sens.length > 1, firstSentence: sen.raw };
  drawings.set(sentence, out);
  return out;
}
