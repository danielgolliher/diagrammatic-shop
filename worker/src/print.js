// The print file: the customer's diagram, checked and redrawn with every word
// cut into outlines (so no font is needed at the printer), composed onto the
// product's exact print area as reported by Printful.

import opentype from 'opentype.js';
import italicTTF from '../fonts/IMFeENit28P.ttf';
import romanTTF from '../fonts/IMFeENrm28P.ttf';
import scTTF from '../fonts/IMFeENsc28P.ttf';
import { byId } from '../../shared/catalog.js';
import { parseDiagram, writePrims } from '../../shared/svgprims.js';
import { compose, orientation } from '../../shared/compose.js';
import { printArea } from './printful.js';
import { Outliner } from './outline.js';

const FONTS = { italic: opentype.parse(italicTTF), roman: opentype.parse(romanTTF), sc: opentype.parse(scTTF) };
const OUT = { italic: new Outliner(FONTS.italic), roman: new Outliner(FONTS.roman), sc: new Outliner(FONTS.sc) };
// read every printable glyph now, at start-up, so no request pays for it
for (const o of Object.values(OUT)) for (let c = 32; c < 127; c++) o.glyph(String.fromCharCode(c));
for (const ch of '’‘“”…—–·éèàçñöüï') OUT.italic.glyph(ch);

export const measure = (s, size, style = 'italic') => (OUT[style] || OUT.italic).width(s, size);
const outline = (s, x, y, size, rot, style = 'italic') => (OUT[style] || OUT.italic).group(s, x, y, size, rot);

export async function renderPrint(env, item) {
  const product = byId[item.product];
  const d = parseDiagram(item.svg);
  const opts = item.opts;
  const nominal = product.area(opts);
  const real = await printArea(env, product.printful, item.pf, product.placement).catch(() => null);
  let W, H, inches;
  if (real) { W = real.width; H = real.height; inches = [real.width / real.dpi, real.height / real.dpi]; }
  else { inches = nominal; W = nominal[0] * 150; H = nominal[1] * 150; }
  if (orientation(product, d) === 'landscape' && H > W && (!real || real.canRotate)) { [W, H] = [H, W]; inches = [inches[1], inches[0]]; }

  const text = (s, x, y, size, style, anchor, fill) => {
    const w = measure(s, size, style);
    const x0 = anchor === 'middle' ? x - w / 2 : x;
    return `<g fill="${fill}">${outline(s, x0, y, size, 0, style)}</g>`;
  };
  const diagram = {
    w: d.w, h: d.h,
    write: ({ stroke, knock, ink }) => writePrims(d.prims, {
      ink, knock, stroke,
      toPath: (s, x, y, size, rot) => outline(s, x, y, size, rot, 'italic'),
    }),
  };
  const out = compose({ product, opts, W, H, inches, diagram, caption: item.caption ? item.sentence : null, plateNo: 'I', text, measure });
  return out.svg;
}
