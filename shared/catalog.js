// Diagrammatic & Co. — the collection.
// One source of truth for the shop window and for the counting-house (the
// worker).  Prices are in US cents.  `pf` is the Printful catalog variant id.
// Wholesale costs noted beside each product were Printful's list prices when
// this catalog was written (October 2026); retail prices are set here.

export const CURRENCY = 'usd';

// ink and paper used in the artwork
export const INK = { dark: '#1d1914', light: '#f1e9d8' };
export const PAPER = '#f6f0e2';

export const PRODUCTS = [
  {
    id: 'plate',
    name: 'The Framed Plate',
    short: 'Framed plate',
    kicker: 'For the study',
    blurb: 'Your sentence drawn as a plate from an old grammar, printed on heavyweight matte paper, set behind a white mat and framed in solid wood.',
    details: ['Museum-grade matte paper', 'Ivory mat board', 'Solid wood frame, ready to hang', 'Acrylic glazing'],
    printful: 795, placement: 'default',
    options: [
      { key: 'frame', label: 'Frame', values: [
        { v: 'Black', swatch: '#1b1a18' }, { v: 'White', swatch: '#f4f2ec' }, { v: 'Red Oak', swatch: '#a8714a' }] },
      { key: 'size', label: 'Size', values: [{ v: '12″×16″' }, { v: '16″×20″' }, { v: '18″×24″' }] },
    ],
    // wholesale ≈ $36.41 / $45.73 / $50.93
    variants: {
      'Black|12″×16″': { pf: 20256, price: 8900 }, 'Black|16″×20″': { pf: 20262, price: 11900 }, 'Black|18″×24″': { pf: 20265, price: 13900 },
      'White|12″×16″': { pf: 20258, price: 8900 }, 'White|16″×20″': { pf: 20264, price: 11900 }, 'White|18″×24″': { pf: 20267, price: 13900 },
      'Red Oak|12″×16″': { pf: 20257, price: 8900 }, 'Red Oak|16″×20″': { pf: 20263, price: 11900 }, 'Red Oak|18″×24″': { pf: 20266, price: 13900 },
    },
    // nominal print area (inches) for previews; the worker uses Printful's real print file size
    area: v => ({ '12″×16″': [12, 16], '16″×20″': [16, 20], '18″×24″': [18, 24] }[v.size]),
    rotate: true,           // a wide sentence turns the plate to landscape
    art: { bg: 'full', box: [0.1, 0.12, 0.8, 0.66], caption: true, fig: true, mark: true, maxText: 0.075 },
    ink: () => 'dark',
  },
  {
    id: 'tee',
    name: 'The Atelier Tee',
    short: 'Tee',
    kicker: 'To be worn',
    blurb: 'A soft, combed-cotton tee with the diagram printed across the chest, the sentence set beneath it in italic.',
    details: ['100% combed ring-spun cotton', 'Bella + Canvas 3001, unisex fit', 'Printed to order with water-based inks'],
    printful: 71, placement: 'default',
    options: [
      { key: 'color', label: 'Colour', values: [
        { v: 'Natural', swatch: '#efe6d1' }, { v: 'White', swatch: '#fbfbf9' }, { v: 'Black', swatch: '#1c1b1a' }] },
      { key: 'size', label: 'Size', values: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map(v => ({ v })) },
    ],
    // wholesale ≈ $11.92 (XS–XL), $13.92 (2XL), $15.92 (3XL)
    variants: tee({
      Natural: { XS: 14681, S: 14682, M: 14683, L: 14684, XL: 14685, '2XL': 14686, '3XL': 14687 },
      White: { XS: 9526, S: 4011, M: 4012, L: 4013, XL: 4014, '2XL': 4015, '3XL': 5294 },
      Black: { XS: 9527, S: 4016, M: 4017, L: 4018, XL: 4019, '2XL': 4020, '3XL': 5295 },
    }, { XS: 3800, S: 3800, M: 3800, L: 3800, XL: 3800, '2XL': 4000, '3XL': 4200 }),
    area: () => [12, 16],
    art: { bg: null, box: [0.1, 0.05, 0.8, 0.5], caption: true, fig: false, mark: false, maxText: 0.065, top: true },
    ink: v => (v.color === 'Black' ? 'light' : 'dark'),
    cloth: v => ({ Natural: '#efe6d1', White: '#fbfbf9', Black: '#1c1b1a' }[v.color]),
  },
  {
    id: 'card',
    name: 'The Correspondence Card',
    short: 'Card',
    kicker: 'For a letter',
    blurb: 'A folded card with your diagrammed sentence on the front and the inside left blank for your own hand. Sent with an envelope.',
    details: ['Heavyweight coated stock', 'Blank inside', 'Envelope included'],
    printful: 568, placement: 'default',
    options: [{ key: 'size', label: 'Size', values: [{ v: '4″×6″' }, { v: '5″×7″' }, { v: '5.83″×8.27″', label: 'A5' }] }],
    // wholesale ≈ $2.55 / $2.95 / $3.75
    variants: { '4″×6″': { pf: 14457, price: 900 }, '5″×7″': { pf: 14458, price: 1100 }, '5.83″×8.27″': { pf: 14460, price: 1400 } },
    area: v => ({ '4″×6″': [4, 6], '5″×7″': [5, 7], '5.83″×8.27″': [5.83, 8.27] }[v.size]),
    art: { bg: 'full', box: [0.1, 0.14, 0.8, 0.6], caption: true, fig: true, mark: false, maxText: 0.07 },
    ink: () => 'dark',
  },
  {
    id: 'mug',
    name: 'The Morning Mug',
    short: 'Mug',
    kicker: 'For the breakfast table',
    blurb: 'A glossy ceramic mug with your sentence on both sides, so it reads the right way round in either hand.',
    details: ['Glossy white ceramic', 'Dishwasher and microwave safe', 'Printed on both sides'],
    printful: 19, placement: 'default',
    options: [{ key: 'size', label: 'Size', values: [{ v: '11 oz' }, { v: '15 oz' }] }],
    // wholesale ≈ $6.07 / $8.11
    variants: { '11 oz': { pf: 1320, price: 2600 }, '15 oz': { pf: 4830, price: 3000 } },
    area: v => (v.size === '15 oz' ? [8.5, 4] : [8.5, 3.5]),
    art: { bg: null, copies: 2, box: [0.06, 0.12, 0.38, 0.76], caption: true, fig: false, mark: false, maxText: 0.07 },
    ink: () => 'dark',
  },
  {
    id: 'tote',
    name: 'The Market Tote',
    short: 'Tote',
    kicker: 'For errands',
    blurb: 'A sturdy organic-cotton tote for books and bread, with your sentence drawn on the front.',
    details: ['100% organic cotton twill', 'Econscious EC8000', 'Reinforced handles'],
    printful: 367, placement: 'default',
    options: [{ key: 'color', label: 'Colour', values: [{ v: 'Oyster', swatch: '#e9e0cd' }, { v: 'Black', swatch: '#1c1b1a' }] }],
    // wholesale ≈ $15.87
    variants: { Oyster: { pf: 10458, price: 4400 }, Black: { pf: 10457, price: 4400 } },
    area: () => [14, 16],
    art: { bg: null, box: [0.1, 0.18, 0.8, 0.56], caption: true, fig: false, mark: false, maxText: 0.065 },
    ink: v => (v.color === 'Black' ? 'light' : 'dark'),
    cloth: v => ({ Oyster: '#e9e0cd', Black: '#1c1b1a' }[v.color]),
  },
  {
    id: 'sticker',
    name: 'The Vinyl Sticker',
    short: 'Sticker',
    kicker: 'For the notebook',
    blurb: 'A durable vinyl sticker cut as a small ivory card, for a laptop, a notebook or a water bottle.',
    details: ['Durable, high-opacity vinyl', 'Bubble-free application', 'Kiss-cut'],
    printful: 358, placement: 'default',
    options: [{ key: 'size', label: 'Size', values: [{ v: '4″×4″' }, { v: '5.5″×5.5″' }, { v: '15″×3.75″', label: 'Bumper 15″×3¾″' }] }],
    // wholesale ≈ $2.54 / $2.74 / $5.47
    variants: { '4″×4″': { pf: 10164, price: 800 }, '5.5″×5.5″': { pf: 10165, price: 1000 }, '15″×3.75″': { pf: 16362, price: 1600 } },
    area: v => ({ '4″×4″': [4, 4], '5.5″×5.5″': [5.5, 5.5], '15″×3.75″': [15, 3.75] }[v.size]),
    art: { bg: 'card', radius: 0.07, box: [0.09, 0.1, 0.82, 0.8], caption: true, fig: false, mark: false, maxText: 0.06, captionSmall: true },
    ink: () => 'dark',
  },
];

function tee(ids, prices) {
  const out = {};
  for (const [color, sizes] of Object.entries(ids)) for (const [size, pf] of Object.entries(sizes)) out[`${color}|${size}`] = { pf, price: prices[size] };
  return out;
}

export const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

// options object {frame:'Black', size:'12″×16″'} → variant key
export function variantKey(product, opts) {
  return product.options.map(o => opts[o.key]).join('|');
}
export function defaultOptions(product) {
  const o = {};
  for (const opt of product.options) o[opt.key] = opt.values[product.id === 'tee' && opt.key === 'size' ? 2 : 0].v;
  return o;
}
export function lookup(productId, opts) {
  const p = byId[productId];
  if (!p) return null;
  const key = variantKey(p, opts);
  const v = p.variants[key];
  if (!v) return null;
  return { product: p, key, variant: v, opts };
}
export function optionLabel(product, opts) {
  return product.options.map(o => {
    const val = o.values.find(x => x.v === opts[o.key]);
    return val ? (val.label || val.v) : opts[o.key];
  }).join(' · ');
}
export const money = cents => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);

export const LIMITS = { sentenceChars: 220, svgBytes: 120000, itemsPerOrder: 12, qtyPerItem: 20 };
