// Diagrammatic & Co. — the Grammarian's Note.
// The shop window writes the note with the engine's analysis (engine/analysis.js)
// as a little HTML: roman text, <i>quoted words</i>, and
// <span class="clause-no">clause labels</span>.  Here it is read into runs of
// type for composing, and checked: every word in it must be a word of the
// sentence or a word of the grammarian's own vocabulary, so a note can say
// nothing the analysis could not have said.  Used by the shop and the worker.

import { sentenceWords } from './svgprims.js';

export class NoteError extends Error {}

export const NOTE_CHARS = 4000;

// every word the analysis writes for itself (see engine/analysis.js)
export const NOTE_VOCAB = new Set(`
  a an the this that it is are be as by of to in for with from and or but not no nothing here
  sentence sentences phrase phrases verb verbs word words clause clauses subject predicate object complement
  simple compound complex declarative interrogative imperative exclamatory
  joins join independent conjunction conjunctions opening came before what stands stand apart set above below
  interjection interjections rest noun nouns address first second third fourth fifth sixth next
  adjective adjectives adverb adverbs adverbial article possessive numeral proper pronoun relative
  modified apposition itself used only introduce introduced expletive understood
  indirect direct elliptical prepositional infinitive participial gerund nominative objective
  completing describing parenthetical construction question tag could fitted diagram diagrammed
  has have would within analysed two
`.split(/\s+/).filter(Boolean));

// words the diagram may supply that the sentence leaves out ("you, understood")
const UNDERSTOOD = new Set(['you', 'that', 'which', 'who', 'not', 'do', 'will', 'can', 'shall', 'am', 'is']);

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const TAGS = new Set(['<i>', '</i>', '<span class="clause-no">', '<span class="unplaced">', '</span>']);

// note HTML → [{ t, style }] with style 'roman' | 'italic' | 'sc'
export function noteRuns(html) {
  const src = String(html || '').replace(/[\u0000-\u001f\u007f]/g, ' ');
  if (src.length > NOTE_CHARS) throw new NoteError('the grammarian’s note is longer than we can set');
  const runs = [];
  let italic = 0, label = 0;
  for (const tok of src.match(/<[^>]*>|[^<]+/g) || []) {
    if (tok[0] === '<') {
      if (!TAGS.has(tok)) throw new NoteError('the grammarian’s note carries markup we do not set');
      if (tok === '<i>') italic++;
      else if (tok === '</i>') italic = Math.max(0, italic - 1);
      else if (tok === '</span>') label = Math.max(0, label - 1);
      else if (tok === '<span class="clause-no">') label++;
      continue;
    }
    const t = tok.replace(/&(?:amp|lt|gt|quot|#39);/g, m => ENTITIES[m]);
    const style = italic ? 'italic' : label ? 'sc' : 'roman';
    const last = runs[runs.length - 1];
    if (last && last.style === style) last.t += t; else runs.push({ t, style });
  }
  const text = runs.map(r => r.t).join('').trim();
  if (!text) throw new NoteError('the grammarian’s note is empty');
  return runs;
}

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").replace(/[^a-z0-9'\- ]+/g, ' ');

// throws NoteError naming the first word that has no business in the note
export function checkNote(runs, sentence) {
  const words = sentenceWords(norm(sentence));
  const allowed = w => words.has(w) || NOTE_VOCAB.has(w) || UNDERSTOOD.has(w) || /^\d{1,2}$/.test(w);
  for (const raw of norm(runs.map(r => r.t).join(' ')).split(/\s+/)) {
    const w = raw.replace(/^['\-]+|['\-]+$/g, '');
    if (!w || allowed(w)) continue;
    if (w.split(/['\-]/).every(p => !p || allowed(p))) continue;
    throw new NoteError(`the word “${w}” has no place in the grammarian’s note`);
  }
}

// runs → words, each a list of pieces set without a space between them
export function noteWords(runs) {
  const out = [];
  let cur = null;
  for (const r of runs) {
    for (const part of r.t.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { cur = null; continue; }
      if (!cur) { cur = []; out.push(cur); }
      cur.push({ t: part, style: r.style });
    }
  }
  return out;
}
