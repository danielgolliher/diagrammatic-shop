// Printful's v1 REST API: shipping rates, print-file sizes, orders.

function base(env) { return (env.PRINTFUL_API_BASE || 'https://api.printful.com').replace(/\/$/, ''); }

async function call(env, method, path, body) {
  const headers = { authorization: `Bearer ${env.PRINTFUL_API_KEY}`, 'content-type': 'application/json' };
  if (env.PRINTFUL_STORE_ID) headers['x-pf-store-id'] = env.PRINTFUL_STORE_ID;
  let res;
  try {
    res = await fetch(base(env) + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    return { ok: false, status: 0, transient: true, message: `network: ${e.message}` };
  }
  const data = await res.json().catch(() => ({}));
  const message = (data.error && (data.error.message || data.error.reason)) || (typeof data.result === 'string' ? data.result : '') || `HTTP ${res.status}`;
  return { ok: res.ok, status: res.status, data, message, transient: res.status === 429 || res.status >= 500 };
}

// Fallback rates if Printful cannot be reached for a quote (approximate, generous).
const FALLBACK = { US: 695, CA: 1195, GB: 995, AU: 1495, default: 1495 };

export async function shippingRate(env, dest, items) {
  if (env.PRINTFUL_API_KEY) {
    const res = await call(env, 'POST', '/shipping/rates', {
      recipient: { country_code: dest.country, state_code: dest.state },
      items, currency: 'USD', locale: 'en_US',
    });
    if (res.ok && Array.isArray(res.data.result) && res.data.result.length) {
      const rates = res.data.result;
      const pick = rates.find(r => r.id === 'STANDARD') || rates.slice().sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0];
      return {
        id: pick.id, name: pick.name && !/standard/i.test(pick.name) ? pick.name : 'Standard shipping',
        cents: Math.round(parseFloat(pick.rate) * 100), min: pick.minDeliveryDays || null, max: pick.maxDeliveryDays || null, live: true,
      };
    }
    if (res.status === 400) {
      const err = new Error(`We cannot ship that bag there: ${res.message}`);
      err.status = 400;
      throw err;
    }
  }
  const cents = FALLBACK[dest.country] || FALLBACK.default;
  return { id: 'STANDARD', name: 'Standard shipping', cents: cents + Math.max(0, items.length - 1) * 250, min: null, max: null, live: false };
}

const fileCache = new Map();
// The exact print area for a variant's placement: { width, height, dpi, canRotate }
export async function printArea(env, productId, variantId, placement) {
  const k = `${productId}`;
  let data = fileCache.get(k);
  if (!data && env.PRINTFUL_API_KEY) {
    const res = await call(env, 'GET', `/mockup-generator/printfiles/${productId}`);
    if (res.ok && res.data.result) { data = res.data.result; fileCache.set(k, data); }
  }
  if (!data) return null;
  const vp = (data.variant_printfiles || []).find(v => v.variant_id === variantId);
  const fileId = vp && vp.placements && vp.placements[placement];
  const pf = (data.printfiles || []).find(f => f.printfile_id === fileId);
  if (!pf) return null;
  return { width: pf.width, height: pf.height, dpi: pf.dpi, canRotate: !!pf.can_rotate };
}

export async function createOrder(env, order, confirm) {
  const res = await call(env, 'POST', `/orders${confirm ? '?confirm=true' : ''}`, order);
  if (res.ok) return { ok: true, id: String(res.data.result && res.data.result.id) };
  if (/external[ _]?id/i.test(res.message) && /(exist|already|taken|unique)/i.test(res.message)) return { ok: false, duplicate: true, id: null };
  return { ok: false, transient: res.transient || res.status === 401 || res.status === 403, message: res.message, status: res.status };
}

export async function getOrder(env, id) {
  const res = await call(env, 'GET', `/orders/${encodeURIComponent(id)}`);
  return res.ok ? res.data.result : null;
}

// an order we placed earlier, found by the external id we gave it (or null)
export async function findByExternalId(env, externalId) {
  const res = await call(env, 'GET', `/orders/@${encodeURIComponent(externalId)}`);
  return res.ok && res.data.result ? res.data.result : null;
}
