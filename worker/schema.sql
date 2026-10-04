-- Diagrammatic & Co. — the ledger
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,          -- travels to Stripe as metadata and to Printful as external_id
  created INTEGER NOT NULL,
  data TEXT NOT NULL            -- JSON: items (with the sentence and its diagram), destination, shipping
);
CREATE TABLE IF NOT EXISTS orders (
  session_id TEXT PRIMARY KEY,  -- Stripe Checkout Session id
  draft_id TEXT NOT NULL,
  status TEXT NOT NULL,         -- draft | submitted | failed | refunded
  printful_id TEXT,
  message TEXT,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS drafts_created ON drafts (created);
