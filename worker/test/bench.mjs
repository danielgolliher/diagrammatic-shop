import opentype from 'opentype.js'
import { readFileSync } from 'fs'
import { tagText } from '../../engine/tagger.js'
import { parseSentence, resetIds } from '../../engine/parser.js'
import { Draughtsman, toSVG } from '../../engine/layout.js'
import { byId } from '../../shared/catalog.js'
import { parseDiagram, writePrims, checkWords } from '../../shared/svgprims.js'
import { Outliner } from '../src/outline.js'
import { compose } from '../../shared/compose.js'
const ab = f => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const t0 = performance.now()
const F = { italic: opentype.parse(ab(new URL('../fonts/', import.meta.url).pathname + 'IMFeENit28P.ttf')), sc: opentype.parse(ab(new URL('../fonts/', import.meta.url).pathname + 'IMFeENsc28P.ttf')) }
console.log('font parse ms', (performance.now() - t0).toFixed(1))
const O = { italic: new Outliner(F.italic), sc: new Outliner(F.sc) }
const pen = new Draughtsman((s, size) => F.italic.getAdvanceWidth(s, size))
const measure = (s, size, st='italic') => (O[st]||O.italic).width(s, size)
const outline = (text, x, y, size, rot, st='italic') => (O[st]||O.italic).group(text, x, y, size, rot)
const outlineOld = (text, x, y, size, rot, st='italic') => { const p = (F[st]||F.italic).getPath(text, 0, 0, size); const a = rot*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a); let d=''; for (const c of p.commands) { const P=(px,py)=>`${(x+px*ca-py*sa).toFixed(1)} ${(y+px*sa+py*ca).toFixed(1)}`; if(c.type==='M')d+='M'+P(c.x,c.y); else if(c.type==='L')d+='L'+P(c.x,c.y); else if(c.type==='Q')d+='Q'+P(c.x1,c.y1)+' '+P(c.x,c.y); else if(c.type==='C')d+='C'+P(c.x1,c.y1)+' '+P(c.x2,c.y2)+' '+P(c.x,c.y); else d+='Z' } return d }
for (const s of ['The old man walked slowly to the village.', 'When I was young, I lived in a small village near the sea, where my father worked as a fisherman.']) {
  resetIds(); const sen = tagText(s)[0]
  const svg = toSVG(pen.sentence(parseSentence(sen.tokens, sen.end)), { title: '' }).svg
  for (const pid of ['plate', 'mug', 'tee']) {
    const product = byId[pid]; const opts = { frame: 'Black', size: pid==='plate'?'12″×16″':pid==='mug'?'11 oz':'M', color:'Black' }
    const runs = []
    let out
    for (let k = 0; k < 6; k++) {
      const t = performance.now()
      const d = parseDiagram(svg); checkWords(d.prims, s)
      const text = (str, x, y, size, style, anchor, fill) => { const w = measure(str, size, style); return `<g fill="${fill}">${outline(str, anchor==='middle'?x-w/2:x, y, size, 0, style)}</g>` }
      out = compose({ product, opts, W: 3600, H: 2400, inches: [12, 8], diagram: { w: d.w, h: d.h, write: ({stroke, knock, ink}) => writePrims(d.prims, { ink, knock, stroke, toPath: (t, x, y, sz, rot) => outline(t, x, y, sz, rot) }) }, caption: s, text, measure })
      runs.push(performance.now() - t)
    }
    console.log(pid, s.length, 'chars: ms', runs.map(x => x.toFixed(1)).join(' '), 'KB', (out.svg.length/1024).toFixed(0))
  }
}
