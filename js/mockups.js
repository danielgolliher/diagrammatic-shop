// Diagrammatic & Co. — the shop window's illustrations.
// Each product is drawn as a quiet catalogue illustration, with the customer's
// composed artwork set into its print window.  Scenes are 600 × 600.

let SEQ = 0;

// place a composed artwork <svg> into a window of the scene
function inset(art, x, y, w, h, extra = '') {
  return art.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, '<svg$1')
    .replace(/^<svg/, `<svg x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" ${extra}`);
}

function scene(id, inner, { floor = true, tone = '#f4efe4' } = {}) {
  return `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs>
    <linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8f1"/><stop offset=".72" stop-color="${tone}"/><stop offset="1" stop-color="#ebe3d3"/></linearGradient>
    <radialGradient id="${id}sh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#1b1712" stop-opacity=".28"/><stop offset="1" stop-color="#1b1712" stop-opacity="0"/></radialGradient>
    <filter id="${id}soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="${id}soft2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <rect width="600" height="600" fill="url(#${id}bg)"/>
  ${floor ? `<path d="M0 470 H600" stroke="#e2d9c6" stroke-width="1"/>` : ''}
  ${inner}
</svg>`;
}

// ---------------------------------------------------------------------------
function plate(art, opts, orient) {
  const id = 'm' + (SEQ++);
  const frame = { Black: ['#1d1b19', '#3a3632', '#0e0d0c'], White: ['#f3f1eb', '#ffffff', '#d6d1c6'], 'Red Oak': ['#a36b44', '#c08a60', '#7a4a2c'] }[opts.frame] || ['#1d1b19', '#3a3632', '#0e0d0c'];
  const land = orient === 'landscape';
  const fw = land ? 440 : 330, fh = land ? 330 : 440;
  const x = 300 - fw / 2, y = (land ? 268 : 262) - fh / 2;
  const b = 20, m = land ? 38 : 34;                 // frame and mat widths
  const ix = x + b + m, iy = y + b + m, iw = fw - 2 * (b + m), ih = fh - 2 * (b + m);
  const grain = opts.frame === 'Red Oak'
    ? Array.from({ length: 9 }, (_, k) => `<path d="M${x + 3} ${y + 6 + k * (fh - 12) / 8} q${fw / 3} ${k % 2 ? 3 : -3} ${fw - 6} 0" stroke="#8b5534" stroke-width=".6" fill="none" opacity=".35"/>`).join('')
    : '';
  return scene(id, `
    <rect x="${x + 10}" y="${y + 16}" width="${fw}" height="${fh}" fill="#1b1712" opacity=".22" filter="url(#${id}soft)"/>
    <rect x="${x}" y="${y}" width="${fw}" height="${fh}" fill="${frame[0]}"/>
    ${grain}
    <path d="M${x} ${y} h${fw} l-${b} ${b} h-${fw - 2 * b} v${fh - 2 * b} l-${b} ${b} z" fill="${frame[1]}" opacity=".35"/>
    <path d="M${x + fw} ${y + fh} h-${fw} l${b} -${b} h${fw - 2 * b} v-${fh - 2 * b} l${b} -${b} z" fill="${frame[2]}" opacity=".35"/>
    <rect x="${x + b}" y="${y + b}" width="${fw - 2 * b}" height="${fh - 2 * b}" fill="#fbfaf5"/>
    <rect x="${x + b}" y="${y + b}" width="${fw - 2 * b}" height="4" fill="#1b1712" opacity=".08"/>
    ${inset(art, ix, iy, iw, ih)}
    <rect x="${ix - 1.5}" y="${iy - 1.5}" width="${iw + 3}" height="${ih + 3}" fill="none" stroke="#d9d3c3" stroke-width="3"/>
    <rect x="${ix - .5}" y="${iy - .5}" width="${iw + 1}" height="${ih + 1}" fill="none" stroke="#b9b09c" stroke-width="1"/>
    <path d="M${x + b} ${y + b} L${x + b + (fw - 2 * b) * .55} ${y + b} L${x + b} ${y + b + (fh - 2 * b) * .55} Z" fill="#ffffff" opacity=".10"/>
  `, { floor: false, tone: '#efe8d9' });
}

function tee(art, opts) {
  const id = 'm' + (SEQ++);
  const cloth = { Natural: '#efe6d1', White: '#fbfbf8', Black: '#1f1e1c' }[opts.color] || '#efe6d1';
  const dark = opts.color === 'Black';
  const seam = dark ? '#000000' : '#bfb49c';
  const shade = dark ? '#000' : '#7a6a4f';
  const body = 'M232 96 C258 120 342 120 368 96 L456 126 Q500 150 540 206 L490 268 Q466 252 442 240 L446 538 Q300 556 154 538 L158 240 Q134 252 110 268 L60 206 Q100 150 144 126 Z';
  return scene(id, `
    <ellipse cx="300" cy="548" rx="190" ry="16" fill="url(#${id}sh)"/>
    <path d="${body}" fill="${cloth}"/>
    <path d="${body}" fill="none" stroke="${seam}" stroke-width="1.2" opacity="${dark ? .9 : .7}"/>
    <path d="M232 96 C258 136 342 136 368 96" fill="none" stroke="${seam}" stroke-width="1.2"/>
    <path d="M236 100 C260 128 340 128 364 100" fill="none" stroke="${seam}" stroke-width=".8" opacity=".6"/>
    <path d="M158 240 Q150 200 144 126 M442 240 Q450 200 456 126" fill="none" stroke="${seam}" stroke-width=".8" opacity=".55"/>
    <path d="M490 268 L540 206 M110 268 L60 206" stroke="${seam}" stroke-width=".8" opacity=".4"/>
    <path d="M186 300 Q200 420 192 520 M410 290 Q398 420 410 520" stroke="${shade}" stroke-width="10" fill="none" opacity=".05" filter="url(#${id}soft2)"/>
    <path d="M156 536 Q300 552 444 536" stroke="${seam}" stroke-width=".8" fill="none" opacity=".6"/>
    ${inset(art, 214, 150, 172, 229)}
  `);
}

function card(art, opts) {
  const id = 'm' + (SEQ++);
  const size = opts.size;
  const ar = size === '4″×6″' ? 4 / 6 : size === '5″×7″' ? 5 / 7 : 5.83 / 8.27;
  const h = 360, w = Math.round(h * ar);
  const x = 318 - w / 2, y = 250 - h / 2 + 30;
  return scene(id, `
    <g transform="rotate(-7 230 330)">
      <rect x="120" y="225" width="300" height="214" fill="#1b1712" opacity=".15" filter="url(#${id}soft)"/>
      <rect x="112" y="214" width="300" height="214" fill="#efe7d6"/>
      <path d="M112 214 L262 330 L412 214" fill="none" stroke="#cfc4ac" stroke-width="1.2"/>
      <path d="M112 428 L230 318 M412 428 L294 318" fill="none" stroke="#ddd3bd" stroke-width="1"/>
    </g>
    <rect x="${x + 8}" y="${y + 12}" width="${w}" height="${h}" fill="#1b1712" opacity=".2" filter="url(#${id}soft)"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7f1e3"/>
    ${inset(art, x, y, w, h)}
    <rect x="${x}" y="${y}" width="3" height="${h}" fill="#1b1712" opacity=".07"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#d6ccb6" stroke-width="1"/>
  `);
}

function mug(art) {
  const id = 'm' + (SEQ++);
  return scene(id, `
    <defs>
      <linearGradient id="${id}gl" x1="0" x2="1"><stop offset="0" stop-color="#d9d6cf"/><stop offset=".18" stop-color="#ffffff"/><stop offset=".5" stop-color="#f7f6f2"/><stop offset=".86" stop-color="#e2dfd8"/><stop offset="1" stop-color="#c9c5bc"/></linearGradient>
    </defs>
    <ellipse cx="300" cy="474" rx="168" ry="20" fill="url(#${id}sh)"/>
    <path d="M398 222 C478 212 486 330 404 364" fill="none" stroke="#cfcbc2" stroke-width="30" stroke-linecap="round"/>
    <path d="M398 222 C478 212 486 330 404 364" fill="none" stroke="#f6f5f1" stroke-width="20" stroke-linecap="round"/>
    <path d="M182 168 L182 444 Q182 470 210 470 L390 470 Q418 470 418 444 L418 168 Z" fill="url(#${id}gl)"/>
    <ellipse cx="300" cy="168" rx="118" ry="20" fill="#f3f2ee" stroke="#cfcbc2" stroke-width="1.2"/>
    <ellipse cx="300" cy="170" rx="106" ry="15" fill="#e6e3dc"/>
    ${inset(art, 198, 206, 204, 226)}
    <rect x="214" y="186" width="14" height="270" rx="7" fill="#ffffff" opacity=".55"/>
  `);
}

function tote(art, opts) {
  const id = 'm' + (SEQ++);
  const cloth = opts.color === 'Black' ? '#211f1c' : '#e9e0cd';
  const seam = opts.color === 'Black' ? '#000' : '#b8ab90';
  return scene(id, `
    <ellipse cx="300" cy="542" rx="170" ry="14" fill="url(#${id}sh)"/>
    <path d="M238 232 C238 120 268 92 300 92 C332 92 362 120 362 232" fill="none" stroke="${cloth}" stroke-width="22"/>
    <path d="M238 232 C238 120 268 92 300 92 C332 92 362 120 362 232" fill="none" stroke="${seam}" stroke-width="1" opacity=".5"/>
    <path d="M182 226 L418 226 L428 540 L172 540 Z" fill="${cloth}"/>
    <path d="M182 226 L418 226 L428 540 L172 540 Z" fill="none" stroke="${seam}" stroke-width="1.2" opacity=".7"/>
    <path d="M181 240 L419 240" stroke="${seam}" stroke-width=".8" stroke-dasharray="3 3" opacity=".6"/>
    ${inset(art, 202, 262, 196, 224)}
  `);
}

function sticker(art, opts) {
  const id = 'm' + (SEQ++);
  const bumper = opts.size === '15″×3.75″';
  const w = bumper ? 420 : 250, h = bumper ? 105 : 250;
  const x = 300 - w / 2, y = 296 - h / 2;
  return scene(id, `
    <defs><linearGradient id="${id}nb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f3a33"/><stop offset="1" stop-color="#1e2621"/></linearGradient></defs>
    <rect x="70" y="70" width="460" height="460" rx="14" fill="#1b1712" opacity=".25" filter="url(#${id}soft)"/>
    <rect x="62" y="58" width="460" height="460" rx="12" fill="url(#${id}nb)"/>
    <rect x="62" y="58" width="22" height="460" fill="#000" opacity=".22"/>
    <rect x="96" y="58" width="2" height="460" fill="#000" opacity=".18"/>
    <g transform="rotate(-4 300 296)">
      <rect x="${x + 4}" y="${y + 7}" width="${w}" height="${h}" rx="${Math.min(w, h) * .07}" fill="#000" opacity=".35" filter="url(#${id}soft2)"/>
      ${inset(art, x, y, w, h)}
    </g>
  `, { floor: false, tone: '#efe8d9' });
}

export function mockup(productId, opts, art, orient) {
  switch (productId) {
    case 'plate': return plate(art, opts, orient);
    case 'tee': return tee(art, opts);
    case 'card': return card(art, opts);
    case 'mug': return mug(art, opts);
    case 'tote': return tote(art, opts);
    case 'sticker': return sticker(art, opts);
    default: return scene('x', '');
  }
}

// a mug shows one face at a time; its preview artwork is a single copy
export const PREVIEW = {
  mug: { area: () => [3.7, 4.1], art: { bg: null, box: [0.04, 0.06, 0.92, 0.88], caption: true, fig: false, mark: false, maxText: 0.075 } },
};
