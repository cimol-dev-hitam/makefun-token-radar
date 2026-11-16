// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// What the radar ranks. A protocol is pre-token when the snapshot records no token for it (no market
// cap, no CoinGecko id, no symbol). The watchlist is the floor: every slug it names is scored. The
// radar is never limited to that floor, so it also scores every other pre-token protocol the snapshot
// carries, however small its TVL, and sets aside the protocols that already trade.
//
// What a protocol is not. A wrapped, staked, bridged or versioned product of a token that already
// trades is no launch of its own, so it never reaches the board: CEX, Bridges, Liquid Staking, Liquid
// Restaking, Restaked BTC, names ending in a version marker, names carrying a whole word wrapped,
// staked or staking, and names that begin with an exchange's own name.
//
// How implied value is derived, from the snapshot's own fields only:
//
//   implied = round( tvl_usd x category_multiple x momentum x age_discount )
//
//   category_multiple  the category's table entry, inside its family's band (stated on the page)
//   momentum           clamp(1 + clamp(change_7d, -60, 50) / 100 x 0.5, 0.70, 1.25)
//                      so seven days of growth add at most 25% and decay takes at most 30%
//   age_discount       1.10 - 0.30 x min(age_days, 1460) / 1460   (an unknown age counts 540 days)
//                      so a protocol tracked for years asks a slightly smaller multiple
//
// Every row is scored by the same three functions; no protocol name is special-cased anywhere. The
// rank is strictly ordered: implied value first, then TVL, then slug, so implied value never rises as
// rank ascends and each rank appears once.
//
// Farm plans are derived, not hand-written: category decides the action, the chains decide the funding
// route and the gas bill, TVL decides the capital, and the age decides how long the position is held.
// Two protocols of the same category differ in chain, capital, hold and wording.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One family of categories, with the band its multiples stay inside. */
export interface Family {
  key: string;
  label: string;
  band_lo: number;
  band_hi: number;
  note: string;
}

/** The five families the page states, in the order it states them. */
export const FAMILIES: Family[] = [
  { key: 'lending', label: 'Lending, credit and exchange', band_lo: 0.8, band_hi: 1.4, note: 'Balance sheet protocols: their TVL is a book that a token could take a share of.' },
  { key: 'perps', label: 'Perps and derivatives', band_lo: 1.0, band_hi: 1.6, note: 'Fee-earning order flow; the market pays most for a venue that already clears volume.' },
  { key: 'yield', label: 'Yield, vaults and curation', band_lo: 0.5, band_hi: 0.9, note: 'TVL here is other people\u2019s money passing through, so it capitalises at a discount.' },
  { key: 'infra', label: 'Chain and infrastructure', band_lo: 0.6, band_hi: 1.0, note: 'Usage that a token would have to reach beyond its own chain to grow into.' },
  { key: 'unknown', label: 'Unclassified', band_lo: 0.4, band_hi: 0.6, note: 'The record names no category, so the multiple stays at the low end.' },
];

/** Every category the snapshot names, mapped to its family and its multiple inside that family's band. */
export const CATEGORY_MULTIPLE: Record<string, { family: string; multiple: number }> = {
  // lending, credit and exchange
  Lending: { family: 'lending', multiple: 1.15 },
  'Uncollateralized Lending': { family: 'lending', multiple: 1.0 },
  'Collateral Markets': { family: 'lending', multiple: 1.05 },
  CDP: { family: 'lending', multiple: 1.1 },
  'CDP Manager': { family: 'lending', multiple: 1.0 },
  RWA: { family: 'lending', multiple: 0.95 },
  CeDeFi: { family: 'lending', multiple: 0.9 },
  'Dual-Token Stablecoin': { family: 'lending', multiple: 0.85 },
  'Stablecoin Wrapper': { family: 'lending', multiple: 0.8 },
  Dexs: { family: 'lending', multiple: 1.25 },
  'OTC Marketplace': { family: 'lending', multiple: 1.0 },
  // perps and derivatives
  Derivatives: { family: 'perps', multiple: 1.35 },
  'Interest Rate Derivatives': { family: 'perps', multiple: 1.2 },
  'Basis Trading': { family: 'perps', multiple: 1.05 },
  // yield, vaults and curation
  Yield: { family: 'yield', multiple: 0.75 },
  'Yield Aggregator': { family: 'yield', multiple: 0.65 },
  'Leveraged Farming': { family: 'yield', multiple: 0.7 },
  Farm: { family: 'yield', multiple: 0.6 },
  'Liquidity Manager': { family: 'yield', multiple: 0.55 },
  'Risk Curators': { family: 'yield', multiple: 0.8 },
  'Onchain Capital Allocator': { family: 'yield', multiple: 0.72 },
  Indexes: { family: 'yield', multiple: 0.6 },
  'Staking Pool': { family: 'yield', multiple: 0.75 },
  Restaking: { family: 'yield', multiple: 0.85 },
  // chain and infrastructure
  Chain: { family: 'infra', multiple: 0.85 },
  Payments: { family: 'infra', multiple: 0.7 },
  'Crypto Card Issuer': { family: 'infra', multiple: 0.65 },
  'Governance Incentives': { family: 'yield', multiple: 0.55 },
  Insurance: { family: 'infra', multiple: 0.65 },
  'Anchor BTC': { family: 'infra', multiple: 0.6 },
  'Decentralized BTC': { family: 'infra', multiple: 0.7 },
  'Cross Chain Bridge': { family: 'infra', multiple: 0.7 },
};

/** The multiple an unmapped category gets: low end, the record says nothing about it. */
export const UNKNOWN_MULTIPLE = 0.5;

/** The model's constants, as the page states them. */
export interface ModelConstants {
  momentum_weight: number;
  growth_floor: number;
  growth_cap: number;
  momentum_floor: number;
  momentum_cap: number;
  age_top: number;
  age_discount: number;
  age_days_span: number;
  unknown_age_days: number;
  value_multiple_cap: number;
}

export const MODEL: ModelConstants = {
  momentum_weight: 0.5,
  growth_floor: -60,
  growth_cap: 50,
  momentum_floor: 0.7,
  momentum_cap: 1.25,
  age_top: 1.1,
  age_discount: 0.3,
  age_days_span: 1460,
  unknown_age_days: 540,
  value_multiple_cap: 1.7,
};

/** The model's version label: the page names it. */
export const MODEL_VERSION = 'radar-2 / family-bands';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  family: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    momentum: number;
    age_discount: number;
    value_multiple: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the same numbers, plus the plan, in the page's own keys. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  family: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  implied_value_usd: number;
  cat_multiple: number;
  momentum: number;
  age_discount: number;
  value_multiple: number;
  watchlist: boolean;
  band: string;
  farm_steps: string[];
}

/** A protocol that already trades: the page shows the market's own number, never a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  symbol: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the page needs: the board, the set-aside live protocols, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  families: Family[];
  multiples: Record<string, { family: string; multiple: number }>;
  unknown_multiple: number;
  counts: {
    protocols: number;
    pre_token: number;
    watchlist: number;
    board: number;
    early: number;
    live: number;
    set_aside: number;
  };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `listed_at` to `as_of`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The category's family key. */
export function familyOf(p: SnapshotProtocol): string {
  return p.category === null ? 'unknown' : (CATEGORY_MULTIPLE[p.category]?.family ?? 'unknown');
}

/** The category's own multiple, from the table, never from the protocol's name. */
export function categoryMultiple(p: SnapshotProtocol): number {
  return p.category === null ? UNKNOWN_MULTIPLE : (CATEGORY_MULTIPLE[p.category]?.multiple ?? UNKNOWN_MULTIPLE);
}

/** The whole score of one protocol under `model`. */
export interface Score {
  implied: number;
  catMultiple: number;
  growthPct: number;
  momentum: number;
  ageDiscount: number;
  valueMultiple: number;
  age: number | null;
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function scoreProtocol(p: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): Score {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const momentum = clamp(1 + (growthPct / 100) * model.momentum_weight, model.momentum_floor, model.momentum_cap);
  const ageForModel = age ?? model.unknown_age_days;
  const ageDiscount = model.age_top - model.age_discount * (clamp(ageForModel, 0, model.age_days_span) / model.age_days_span);
  const catMultiple = categoryMultiple(p);
  const implied = Math.max(1, Math.round(p.tvl_usd * catMultiple * momentum * ageDiscount));
  const valueMultiple = p.tvl_usd > 0 ? round4(implied / p.tvl_usd) : catMultiple;
  // Momentum and the age discount are kept at full precision: the page multiplies the same doubles
  // again and must land on the same dollar, so only the display rounds them.
  return { implied, catMultiple, growthPct, momentum, ageDiscount, valueMultiple, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped, staked or bridged product. */
const PRODUCT_WORD = /\b(wrapped|staked|staking|bridged)\b/i;
/** An exchange's own name at the start of a protocol's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** Categories whose protocols are a product of a token that already trades, or an exchange itself. */
const NOT_A_LAUNCH = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a pre-token protocol is a launch of its own rather than a product of one that trades. */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && NOT_A_LAUNCH.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** Value bands the page filters by, richest first. */
export const VALUE_BANDS: { key: string; label: string; min: number }[] = [
  { key: 'b1', label: 'over $1B', min: 1_000_000_000 },
  { key: 'b2', label: '$250M to $1B', min: 250_000_000 },
  { key: 'b3', label: '$50M to $250M', min: 50_000_000 },
  { key: 'b4', label: 'under $50M', min: 0 },
];

/** The band an implied value falls in. */
export function bandOf(value: number): string {
  for (const band of VALUE_BANDS) if (value >= band.min) return band.key;
  return 'b4';
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const watched = new Set(snapshot.watchlist);
  const chosen: SnapshotProtocol[] = [];
  const seen = new Set<string>();
  // The watchlist first: every slug it names is scored, even one the snapshot's rules would now drop.
  for (const slug of snapshot.watchlist) {
    const p = snapshot.protocols.find((q) => q.slug === slug);
    if (p !== undefined && !seen.has(p.slug)) {
      chosen.push(p);
      seen.add(p.slug);
    }
  }
  // Then the early radar: every other pre-token protocol, whatever its TVL. TVL desc, then slug.
  const rest = snapshot.protocols
    .filter((p) => !seen.has(p.slug) && isLaunchCandidate(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of rest) {
    chosen.push(p);
    seen.add(p.slug);
  }
  const scored = chosen.map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map(({ p, s }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    family: familyOf(p),
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    watchlist: watched.has(p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.catMultiple,
      growth_pct: s.growthPct,
      momentum: s.momentum,
      age_discount: s.ageDiscount,
      value_multiple: s.valueMultiple,
      age_days: s.age,
    },
    farm_steps: farmSteps(p, s.age).map(stepText),
  }));
}

// ------------------------------------------------------------------ farm plans

/** A step as one string: its action, then its cost and its time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`.replace(/\s+/g, ' ');
  if (s.length > 600) {
    const cut = s.slice(0, 596);
    const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '), cut.lastIndexOf(' '));
    s = cut.slice(0, at > 240 ? at : 596).trim();
    if (!/[.!]$/.test(s)) s = `${s}.`;
  }
  if (s.length < 20) s = `${s} Keep the position open and re-check the protocol's own page.`;
  return s;
}

/** Chains whose gas is cheap enough that the cost line is cents, not dollars. */
const L2 = new Set(['Base', 'Arbitrum', 'Optimism', 'Unichain', 'Katana', 'Monad', 'Plasma', 'Arc', 'Blast', 'Scroll', 'Linea', 'Mantle', 'zkSync Era', 'Sonic', 'Berachain', 'Ink', 'World Chain', 'ApeChain', 'Corn', 'Mode', 'MegaETH', 'Soneium', 'Celo', 'Op_Bnb', 'Swellchain', 'Starknet', 'Taiko', 'MetalL2', 'RISE', 'Sophon', 'Zircuit']);
const ALT_L1 = new Set(['Solana', 'Avalanche', 'Binance', 'Polygon', 'Sui', 'Aptos', 'Tron', 'TON', 'Near', 'Sei', 'Hyperliquid L1', 'Flare', 'CORE', 'Bittensor', 'Stellar', 'Ripple', 'Cardano', 'Cosmos', 'Injective', 'X Layer', 'Somnia', 'Citrea', 'Babylon Genesis', 'Plume', 'Provenance', 'Nibiru', 'Story', 'Tempo', 'Stable']);
const BTC_LIKE = new Set(['Bitcoin', 'Babylon Genesis', 'Stacks', 'BOB', 'BSquared', 'Hemi', 'Citrea', 'Bitlayer', 'Zcash', 'RSK']);

/** A chain's gas bill for one transaction, in dollars. */
function gasFor(chain: string): [number, number] {
  if (chain === 'Ethereum') return [3, 9];
  if (BTC_LIKE.has(chain)) return [1.5, 6];
  if (L2.has(chain)) return [0.05, 0.3];
  if (ALT_L1.has(chain)) return [0.01, 0.12];
  return [0.1, 0.6];
}

/** A readable dollar range, e.g. "about $0.05 to $0.30". */
function gasText(range: [number, number], copies = 1): string {
  const f = (n: number): string => (n < 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 10 ? 1 : 0)}`);
  return `about ${f(range[0] * copies)} to ${f(range[1] * copies)}`;
}

/** The asset a protocol's own chain settles in, for the funding step. */
function assetFor(chain: string): string {
  if (BTC_LIKE.has(chain)) return 'BTC';
  if (chain === 'Bittensor') return 'TAO';
  if (chain === 'Solana') return 'USDC (SPL)';
  if (chain === 'Sui') return 'USDC on Sui';
  if (chain === 'Stellar') return 'USDC on Stellar';
  if (chain === 'Ripple') return 'USD on the XRP ledger';
  return 'USDC';
}

/** How much capital one position in this protocol wants, from its own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 75_000_000) return 120;
  return 60;
}

/** How long to hold, from the protocol's age: younger protocols need a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** A stable hash of a slug, so wording varies between rows but never between runs. */
function hash(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Pick one of several wordings by the slug's own hash. */
function pick<T>(slug: string, salt: number, options: T[]): T {
  return options[hash(`${slug}:${salt}`) % options.length]!;
}

/** Step 1, the route in: which wallet, which chain, which bridge, what it costs. */
function fundingStep(p: SnapshotProtocol, capital: number): FarmStep {
  const chain = p.chains[0] ?? 'its main chain';
  const other = p.chains[1];
  const asset = assetFor(chain);
  const gas = gasText(gasFor(chain), chain === 'Ethereum' ? 3 : 2);
  if (other !== undefined && pick(p.slug, 1, [true, false])) {
    return {
      text: `Fund one wallet with $${capital} of ${asset} plus gas, then bridge only what this position needs into ${chain} with that chain's canonical bridge — not a swap site's bridge button that routes through a third protocol.`,
      cost: `${gas} for the deposit and the bridge`,
      time: '30 to 45 minutes the first time',
    };
  }
  return {
    text: `Open a fresh wallet on ${chain}, fund it with $${capital} of ${asset} plus gas, and make ${p.name} the only protocol it farms, so the position is easy to unwind and to prove.`,
    cost: `${gas} for the first transactions`,
    time: '10 to 15 minutes',
  };
}

/** Step 2, the action: what this protocol's own category asks of a depositor. */
function actionStep(p: SnapshotProtocol, capital: number): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  const chain = p.chains[0] ?? 'its main chain';
  const gas = gasText(gasFor(chain), chain === 'Ethereum' ? 2 : 1);
  const name = p.name;
  const usd = `$${capital}`;

  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('index')) {
    return {
      text: `Deposit ${usd} of USDC into one ${name} vault on ${chain}: the one whose collateral is a blue-chip asset and whose curator fee is under 10% of the yield. Keep the vault shares in the wallet that deposited.`,
      cost: `${gas} for the deposit`,
      time: '15 minutes, then nothing until you withdraw',
    };
  }
  if (c.includes('dex') || c.includes('otc')) {
    return {
      text: `Provide ${usd} of liquidity to ${name}'s deepest pool on ${chain} — the one pairing its main asset with USDC — and note the fee tier and current range before you sign. A single-sided deposit counts if the pool offers one.`,
      cost: `${gas}, plus the pool's own fee on the first swap`,
      time: '20 minutes to open the position',
    };
  }
  if (c.includes('cdp') || c.includes('collateral') || c.includes('stablecoin') || c.includes('dual-token')) {
    return {
      text: `Open a ${name} vault on ${chain} with ${usd} of the collateral it accepts and mint its stable asset against it at no more than half the allowed ratio, so a drawdown never forces a liquidation.`,
      cost: `${gas} for the open and the mint`,
      time: '20 minutes',
    };
  }
  if (c.includes('rwa')) {
    return {
      text: `Buy ${usd} of ${name}'s tokenised yield asset on ${chain} and hold it in the wallet you farm with, so the balance shows in every snapshot instead of sitting in a wallet you later emptied.`,
      cost: `${gas}, plus any issue or redemption fee the asset states`,
      time: '15 minutes',
    };
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('basis')) {
    return {
      text: `Deposit ${usd} of USDC as margin on ${name} (${chain}) and place one hedge at no more than 2x. Leave it open a week so the venue records both a deposit and volume, then close and reopen once.`,
      cost: `${gas}, plus about 0.05% of the size a side in trading fees`,
      time: '20 minutes to open, a week to hold',
    };
  }
  if (c.includes('insurance')) {
    return {
      text: `Buy ${usd} of cover from ${name} on ${chain} for a protocol you already use, and keep the policy active: the record that counts is a policy that was paid for, not one that was quoted.`,
      cost: `a premium of roughly 2% to 5% of ${usd}, plus ${gas}`,
      time: '15 minutes',
    };
  }
  if (c.includes('payment') || c.includes('card')) {
    return {
      text: `Open a ${name} account on ${chain}, move ${usd} of USDC onto its balance and make one small real payment, so the account shows use rather than a deposit that never moved.`,
      cost: `${gas}, plus the amount you actually spend`,
      time: '20 minutes',
    };
  }
  if (c.includes('governance')) {
    return {
      text: `Lock ${usd} of the protocol's voting asset with ${name} on ${chain} and vote once in an open proposal: an address that has voted is the one a future allocation is easiest to count.`,
      cost: `${gas} for the lock and the vote`,
      time: '15 minutes',
    };
  }
  if (c.includes('prediction')) {
    return {
      text: `Fund ${usd} on ${name} (${chain}) and take one position in a market that resolves within a month, then let it settle instead of closing it early.`,
      cost: `${gas}, and the position's own stake`,
      time: '10 minutes, then the market\u2019s close',
    };
  }
  if (c.includes('chain')) {
    return {
      text: `Delegate ${usd} worth of ${chain}'s staking asset to a validator through ${name}'s staking page, outside the top ten so the delegation is not more of the same, and keep the receipt in that wallet.`,
      cost: `${gas} for the delegation`,
      time: '15 minutes, unbonding later',
    };
  }
  if (c.includes('restak') || c.includes('staking pool')) {
    return {
      text: `Stake ${usd} of ${chain}'s staking asset through ${name} and hold the liquid receipt in the wallet that staked it; read the receipt's redemption terms before you size the position.`,
      cost: `${gas} for the stake`,
      time: '15 minutes',
    };
  }
  if (c.includes('leveraged farm') || c.includes('liquidity manager')) {
    return {
      text: `Point ${usd} at one ${name} managed position on ${chain} — the strategy with the longest live track record — and let it rebalance a month before you judge it.`,
      cost: `${gas}, plus the manager's fee`,
      time: '20 minutes, a month to hold',
    };
  }
  if (c.includes('yield') || c.includes('farm')) {
    return {
      text: `Deposit ${usd} of USDC into ${name}'s largest vault on ${chain} and keep the vault shares rather than an IOU, so the balance compounds inside the protocol and counts in its snapshots.`,
      cost: `${gas} for the deposit`,
      time: '10 minutes',
    };
  }
  if (c.includes('lend')) {
    return {
      text: `Supply ${usd} of USDC to ${name} on ${chain}, then borrow a quarter of it back against the same collateral, so the protocol's own books show both a supply and a borrow.`,
      cost: `${gas} for the two transactions`,
      time: '20 minutes',
    };
  }
  return {
    text: `Deposit ${usd} of USDC into ${name} on ${chain}, keep the receipt the protocol issues, and leave the position open rather than moving it between wallets.`,
    cost: `${gas} for the deposit`,
    time: '15 minutes',
  };
}

/** Step 3, the loop: the cadence that keeps an address active across snapshots. */
function cadenceStep(p: SnapshotProtocol, hold: number): FarmStep {
  const chain = p.chains[0] ?? 'its main chain';
  const weekly = gasText(gasFor(chain), 2);
  const day = pick(p.slug, 2, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  return pick(p.slug, 3, [
    {
      text: `Set a ${day} reminder and change the ${p.name} position once a week for ${hold} days: a small top-up, a claim, a repay and re-borrow, or a vote. Spread the calls across the week rather than batching them.`,
      cost: `${weekly} a week, no new capital after the first deposit`,
      time: '10 minutes a week',
    },
    {
      text: `Return to ${p.name} once a week for ${hold} days and do one thing that changes the position, from the same wallet: add a little, claim the yield, or vote if a proposal is open.`,
      cost: `${weekly} a week`,
      time: '10 to 15 minutes a week',
    },
  ]);
}

/** Step 4, the incentive: which program to join, and what to do when there is none. */
function programStep(p: SnapshotProtocol): FarmStep {
  const chain = p.chains[0] ?? 'its main chain';
  return pick(p.slug, 4, [
    {
      text: `Open ${p.name}'s own app and join its points, quest or leaderboard tab before the first deposit: a position opened before registration usually misses the first epoch. If it publishes no program, keep the deposit history — that is the record.`,
      cost: 'nothing to join; a points program that asks for money is not one',
      time: '10 minutes, once',
    },
    {
      text: `Check whether ${p.name} publishes a points program, a quest board or a deposit streak on ${chain}, register the farming wallet in it and screenshot the registration. If not, the deposit history is the record to keep.`,
      cost: 'no fee, and never pay to claim',
      time: '10 minutes, once',
    },
  ]);
}

/** Step 5, the watch: what to look for, and the hold that spans several snapshots. */
function watchStep(p: SnapshotProtocol, hold: number): FarmStep {
  return pick(p.slug, 5, [
    {
      text: `Hold at least ${hold} days, and once a month read ${p.name}'s governance forum and treasury page for a token, fee-switch or buyback proposal: that post is the earliest public sign a token is being designed, and it names the snapshot that will count.`,
      cost: 'the position stays at work',
      time: `${hold} days to hold, 10 minutes a month`,
    },
    {
      text: `Keep the position ${hold} days and watch two things at ${p.name}: a governance post mentioning token design or a fee switch, and a 30% move in its TVL within a month. Either one is a reason to resize.`,
      cost: 'the position stays at work',
      time: `${hold} days, a 10 minute review a month`,
    },
  ]);
}

/** Step 6, the exit: the log, and the one rule that keeps the wallet. */
function exitStep(p: SnapshotProtocol): FarmStep {
  return pick(p.slug, 6, [
    {
      text: `Log the wallet, the dates, the size and every transaction hash, and withdraw only through ${p.name}'s own app. A claim link that arrives by message is not the protocol, and nothing legitimate asks for a seed phrase.`,
      cost: 'nothing but the log',
      time: '10 minutes, and one withdrawal to leave',
    },
    {
      text: `Keep a one-page log per position — wallet, dates, size, hashes, the program joined — and check it before any claim. Claim from ${p.name}'s own site only, and never sign a transaction you cannot read.`,
      cost: 'nothing',
      time: '10 minutes now, 5 minutes at exit',
    },
  ]);
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. Everything in it follows
 * from the protocol's record — category, chains, TVL, age — and the wording varies by slug, never by
 * a table of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [fundingStep(p, capital), actionStep(p, capital), cadenceStep(p, hold), programStep(p), watchStep(p, hold), exitStep(p)];
}

/** The protocols that already trade, by market cap, for the page's set-aside list. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && (p.mcap_usd ?? 0) > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, symbol: p.symbol, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    family: row.family,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    listed_at: row.listed_at,
    implied_value_usd: row.implied_value_usd,
    cat_multiple: row.model.category_multiple,
    momentum: row.model.momentum,
    age_discount: row.model.age_discount,
    value_multiple: row.model.value_multiple,
    watchlist: row.watchlist,
    band: bandOf(row.implied_value_usd),
    farm_steps: row.farm_steps,
  };
}

/** Everything the page renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const traded = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    families: FAMILIES,
    multiples: CATEGORY_MULTIPLE,
    unknown_multiple: UNKNOWN_MULTIPLE,
    counts: {
      protocols: snapshot.protocols.length,
      pre_token: preToken,
      watchlist: snapshot.watchlist.length,
      board: board.length,
      early,
      live: live.length,
      set_aside: traded,
    },
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    } satisfies SnapshotProtocol;
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows`;
  if (board.length > 4000) return `the board holds ${board.length} rows`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && new Set(board.map((r) => r.implied_value_usd)).size === 1) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
  }
  return null;
}

/** A compact data.js: the page's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
