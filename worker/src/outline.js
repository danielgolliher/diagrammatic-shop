// A quick glyph outliner.  opentype.js's getPath rebuilds every glyph on each
// call; here each glyph's outline is read once (in font units) and then only
// scaled, rotated and written out — fast enough for a Worker's CPU budget.

export class Outliner {
  constructor(font) {
    this.font = font;
    this.upm = font.unitsPerEm;
    this.glyphs = new Map();     // char → { adv, cmds: Float-ish arrays, idx }
  }
  glyph(ch) {
    let g = this.glyphs.get(ch);
    if (!g) {
      const gl = this.font.charToGlyph(ch);
      const cmds = [];
      for (const c of gl.path.commands) {
        if (c.type === 'Z') cmds.push(['Z']);
        else if (c.type === 'M' || c.type === 'L') cmds.push([c.type, c.x, c.y]);
        else if (c.type === 'Q') cmds.push(['Q', c.x1, c.y1, c.x, c.y]);
        else if (c.type === 'C') cmds.push(['C', c.x1, c.y1, c.x2, c.y2, c.x, c.y]);
      }
      // the glyph's own outline as path data, in font units (y up), written once
      let d = '';
      for (const c of cmds) d += c[0] + c.slice(1).map(Math.round).join(' ');
      g = { adv: gl.advanceWidth || 0, cmds, ref: gl, d };
      this.glyphs.set(ch, g);
    }
    return g;
  }
  width(text, size) {
    const s = size / this.upm;
    let w = 0, prev = null;
    for (const ch of text) {
      const g = this.glyph(ch);
      if (prev) w += this.font.getKerningValue(prev.ref, g.ref) * s;
      w += g.adv * s;
      prev = g;
    }
    return w;
  }
  // markup for text whose baseline starts at (x, y), rotated rotDeg about that
  // point: one group, each glyph placed by a transform on its cached outline
  group(text, x, y, size, rotDeg = 0) {
    const s = size / this.upm;
    const R = v => Math.round(v * 100) / 100;
    let out = `<g transform="translate(${R(x)} ${R(y)})${rotDeg ? ` rotate(${R(rotDeg)})` : ''} scale(${Math.round(s * 1e6) / 1e6} ${-Math.round(s * 1e6) / 1e6})">`;
    let pen = 0, prev = null;
    for (const ch of text) {
      const g = this.glyph(ch);
      if (prev) pen += this.font.getKerningValue(prev.ref, g.ref);
      if (g.d) out += pen ? `<path transform="translate(${Math.round(pen)} 0)" d="${g.d}"/>` : `<path d="${g.d}"/>`;
      pen += g.adv;
      prev = g;
    }
    return out + '</g>';
  }

  // path data for text whose baseline starts at (x, y), rotated rotDeg about that point
  path(text, x, y, size, rotDeg = 0) {
    const s = size / this.upm;
    const a = rotDeg * Math.PI / 180, ca = Math.cos(a) * s, sa = Math.sin(a) * s;
    let d = '', pen = 0, prev = null;
    const R = v => Math.round(v * 10) / 10;
    for (const ch of text) {
      const g = this.glyph(ch);
      if (prev) pen += this.font.getKerningValue(prev.ref, g.ref);
      for (const c of g.cmds) {
        if (c[0] === 'Z') { d += 'Z'; continue; }
        d += c[0];
        for (let k = 1; k < c.length; k += 2) {
          const gx = c[k] + pen, gy = -c[k + 1];          // font units, y flipped
          d += R(x + gx * ca - gy * sa) + ' ' + R(y + gx * sa + gy * ca) + (k + 2 < c.length ? ' ' : '');
        }
      }
      pen += g.adv;
      prev = g;
    }
    return d;
  }
}
