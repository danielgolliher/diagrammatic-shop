# Diagrammatic & Co.

*Purveyors of fine sentences.*

A small boutique where anyone can write a sentence, see it diagrammed the way Reed & Kellogg's grammar books drew sentences, and order it as a framed plate, a tee, a correspondence card, a mug, a tote or a sticker. Payment is by Stripe and fulfilment by Printful, with no hand work in between.

**The Catalogue** (`catalogue.html`, data in `shared/catalogue.js`) offers 78 sentences from the American founding documents and public-domain literature. Each was checked word for word against its source and is diagrammed completely. A catalogue piece can be printed with its source beneath it; the Worker looks the citation up in the catalogue itself and adds it only when the wording matches exactly.

**The Grammarian's Note.** On the framed plate, the card, the tee and the tote, a customer can add the sentence's analysis in words, set small beneath the figure in the manner of the old grammars ("Analysis.—This is a simple declarative sentence…"). The browser writes the note with the engine's analysis. The Worker accepts only its own markup (italics and clause labels), and every word must be a word of the sentence or one of the grammarian's fixed vocabulary (`shared/note.js`). The mug and the sticker have no room for a note.

**Shop:** https://danielgolliher.github.io/diagrammatic-shop/
**To take real orders:** see [SETUP.md](SETUP.md).

## How it fits together

```
 GitHub Pages (this site)            Cloudflare Worker (worker/)            Stripe        Printful
 ─────────────────────────           ───────────────────────────            ──────        ────────
 compose the diagram in the   ──►   /api/quote     ─── live shipping rates ───────────────►  ✓
 browser; preview it on each        /api/checkout  ─── validate, keep a draft,
 product; bag; checkout                            open Stripe Checkout ──────────► pay
                                    /api/stripe/webhook ◄── signed "paid" event ─────┘
                                                   ─── place the order ───────────────────►  ✓
                                    /print/…svg    ◄── Printful fetches the print file ─────┘
 thanks.html ◄─────────────────────  /api/order     ─── status & tracking
```

- **Composing.** The browser runs the Diagrammatic engine (`engine/`, copied from the [free diagrammer](https://github.com/danielgolliher/diagrammatic)) and sends the diagram's SVG along with the order.
- **Trust nothing from the browser.**
  - The Worker re-parses that SVG into bare primitives (lines, slanted paths, words). Anything else, such as images, scripts or links, is refused, and so is any word that is not in the customer's sentence.
  - Prices and Printful variant ids come only from `shared/catalog.js` on the server.
- **Print files.**
  - At print time the Worker re-draws the figure and outlines every word in IM Fell, so the printer needs no font.
  - `shared/compose.js` places the figure on Printful's exact print area, the same composition the shop window previews.
  - Glyph outlines are cached once per glyph, so a print file renders in under a millisecond of CPU, well inside Cloudflare's free tier.
- **Safety nets.**
  - Stripe webhooks are signature-checked.
  - Orders are idempotent (the draft id is Printful's `external_id`).
  - Printful outages make Stripe retry, and a permanent refusal triggers an automatic refund.
  - Test-mode payments create Printful drafts only.

## Layout

| Path | What it holds |
| --- | --- |
| `index.html`, `css/shop.css`, `js/shop.js` | The shop window: hero, atelier, collection, bag |
| `js/mockups.js` | Product illustrations, with the customer's artwork set into each |
| `catalogue.html`, `js/catalogue.js` | The Catalogue: browse, search and commission famous sentences |
| `thanks.html`, `js/thanks.js` | Order status after payment |
| `policies.html` | Shipping, returns, privacy, terms |
| `shared/` | Catalogue, SVG and note validation, artwork composition (used by both the site and the Worker) |
| `engine/` | The diagram engine (tagger, parser, layout, analysis) |
| `worker/` | The Cloudflare Worker, D1 schema, and end-to-end tests with stand-in Stripe and Printful services |
| `setup.sh` | One-command setup once the accounts exist |

## Working on it

```bash
python3 tools/serve.py 8772                 # the site, uncached, at http://localhost:8772
cd worker && npm install
node test/e2e.mjs                           # 55 checks: quote → checkout → webhook → Printful → print files
node test/cand-check.mjs -q                 # every Catalogue sentence diagrams in full, and its note passes
./test/dev.sh                               # Worker + stand-in Stripe/Printful for trying the shop by hand,
                                            # then open http://localhost:8772/?api=http://127.0.0.1:8787
```

## Credits

- Diagramming method: Alonzo Reed and Brainerd Kellogg, *Higher Lessons in English* (1877).
- IM Fell types: digitized by Igino Marini, used under the SIL Open Font License.
- Part-of-speech tagging: compromise (MIT).
- Font outlines: opentype.js (MIT).
