// Checks that sentences diagram completely (no unplaced words, every word drawn)
// and that the Grammarian's Note for each passes the worker's vocabulary check.
//   node test/cand-check.mjs -q          check the whole Catalogue, listing only failures
import opentype from 'opentype.js'
import { readFileSync } from 'fs'
import { tagText } from '../../engine/tagger.js'
import { parseSentence, resetIds, show } from '../../engine/parser.js'
import { Draughtsman, toSVG } from '../../engine/layout.js'
import { parseDiagram, checkWords, checkCoverage } from '../../shared/svgprims.js'
import { analyse } from '../../engine/analysis.js'
import { noteRuns, checkNote } from '../../shared/note.js'
const italic = opentype.loadSync(new URL('../fonts/IMFeENit28P.ttf', import.meta.url).pathname)
const pen = new Draughtsman((s, size) => italic.getAdvanceWidth(s, size))
// with no file given, check every sentence in the Catalogue
const file = process.argv.slice(2).find(a => !a.startsWith('-'))
const C = file ? JSON.parse(readFileSync(file, 'utf8')) : (await import('../../shared/catalogue.js')).CATALOGUE.map(e => ({ text: e.text }))
let ok = 0
for (const c of C) {
  resetIds(); const sens = tagText(c.text); const sen = sens[0]
  const tree = parseSentence(sen.tokens, sen.end)
  const svg = toSVG(pen.sentence(tree), { title: '' }).svg
  let status = 'ok'
  try { const d = parseDiagram(svg); checkWords(d.prims, c.text); if (d.prims.some(p => p.loose)) status = 'LOOSE'; else if (sens.length > 1) status = 'MULTI'; else checkCoverage(d.prims, c.text); c.w = d.w; c.h = d.h } catch (e) { status = 'MISS ' + e.message }
  if (status === 'ok') try { checkNote(noteRuns(analyse(tree)), c.text) } catch (e) { status = 'NOTE ' + e.message }
  if (status === 'ok') ok++
  if (!process.argv.includes('-q') || status !== 'ok') console.log((status + '      ').slice(0, 6), c.w | 0, 'x', c.h | 0, '|', c.text.slice(0, 80), '\n        ', show(tree).slice(0, 300))
}
console.log('complete:', ok, '/', C.length)
