// A short, conservative list of slurs we will not print, kept as truncated
// SHA-256 hashes so the words themselves are not spelled out in the source.
// The shop owner can add plain words with the BLOCKED_WORDS setting.
const HASHED = new Set(["120f6e5b4ea32f65bda6","5b3ae48be122f7ed19b4","08a841e996781e9e77d3","341d56384afc0f47b34c","8f5083e3e5c7dc8932f2","1e02eec4f1095143be28","9915ba2d822280f22c28","17bde8b4064612e266ea","c3de533e9b7fe63b79f6","268651b3ece980102f18","98b52c4b6b7d1f48e747","044eb98b18769b887d5a","f9d0d9b18ae9033a5ea3","45cd3e1bb472d8e285a1","cc02032349c833ac5e97","82159dd02870c13ec30e","eef3bd091670c3447022","0ce875d620076b533c6e","16ea09fc78ca83ca502c","402f7ebd98864afed481","158869a97379229b7681","c1cabb6f6e431f9c4dea","e7b98c6aa5b944e0b315","daec0c235d3135fc1c60","f0fec9b2c0b4491ed4d0","1aa4a107dc2a0437d193","3c8400b402baa7f1b8ca","79301d9ccedae2a293a9","22fc75e65a0e9d343240","17a110e5332848721f27","333f7618092958c75b8c","da0a6b1b9213d48ff10c","3b1e0d7c5dd45583867e","7122c9a14ba2d20ebb6e","566f532d486c947709d3","517ae3f73216da641d8d"]);

async function sha(word) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(word));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

export async function isBlocked(sentence, extra = []) {
  const words = sentence.toLowerCase().replace(/[’‘]/g, "'").split(/[^a-z']+/).map(w => w.replace(/'s?$/, '')).filter(Boolean);
  const extraSet = new Set(extra);
  for (const w of new Set(words)) {
    if (extraSet.has(w)) return true;
    if (HASHED.has(await sha(w))) return true;
  }
  return false;
}
