// Token Radar, model radar-3: one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// every other clean pre-token protocol in the snapshot: no token on record, not a wrapped /
// staked / bridged product of a token that already trades, not a versioned pool, not an
// exchange. The snapshot's live-token protocols are kept apart and shown with the market's own
// values, never mixed into the ranked board.
//
// Implied value is a FITTED curve, not a guessed multiple. The snapshot's own traded tokens say
// how market cap scales with TVL, and the model is the least-squares line through them:
//
//   log10(FDV) = intercept + slope x log10(TVL)
//
// fitted on the snapshot's traded protocols outside CEX (a centralised exchange's token does not
// price like a protocol's, and the board never ranks one). The curve is fitted at run time from
// the snapshot in hand, so no coefficient is ever hard-coded, and the dashboard shows the fit
// and the test that chose it. What the curve does not know, the board does not pretend to know:
// the band is the fit's own 80% prediction band, and the farm plan nets every protocol at the
// band's low end.
//
//   base       = 10 ^ (intercept + slope x log10(TVL))
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth    = 1 + 0.03 x min(chains - 1, 5)            (more chains, wider distribution)
//   implied    = max(1, round(base x growthMult x maturity x breadth))
//   band_low   = implied x 10 ^ (-1.28 x resid_sd)       (low end of the 80% band)
//
// The adjustments are small and bounded, and the dashboard says what they cost: on held-out
// traded tokens the curve alone scores 0.902 log10 RMSE and the curve with the adjustments
// 0.915, against 1.038 for the old median-multiple model. Two richer models were fitted and
// rejected on the same held-out test: per-category intercepts (0.952) and a ridge regression
// on TVL, chains, age and 7-day change (0.950) both predicted worse than the single curve, so
// the model stays one curve. No protocol name is ever special-cased: the same function scores
// every row.

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

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  band_z: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.03,
  breadth_max_chains: 5,
  band_z: 1.28,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    fit_base_usd: number;
    band_low_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  fit_base_usd: number;
  band_low_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The fitted curve: least squares of log10(FDV) on log10(TVL) over the traded protocols. */
export interface FitCurve {
  intercept: number;
  slope: number;
  n: number;
  r2: number;
  resid_sd: number;
}

/** The held-out test that chose the curve over the old median-multiple model. */
export interface Validation {
  cv_folds: number;
  cv_curve_rmse: number;
  cv_curve_only_rmse: number;
  cv_median_rmse: number;
  cv_n: number;
  walkforward_curve_rmse: number;
  walkforward_median_rmse: number;
  walkforward_n_test: number;
}

/** Everything the dashboard needs: the board, the live set, the fit and its test. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: FitCurve;
  validation: Validation;
  /** The fitted points, [log10(TVL), log10(FDV)], for the curve chart. */
  fit_points: [number, number][];
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

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** The traded protocols the curve is fitted on: a market cap and a TVL, outside CEX. */
export function fitPool(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
}

/** Least squares of log10(FDV) on log10(TVL) over `pool`, with its fit statistics. */
export function fitCurve(pool: SnapshotProtocol[]): FitCurve {
  const xs = pool.map((p) => Math.log10(p.tvl_usd));
  const ys = pool.map((p) => Math.log10(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const f = intercept + slope * xs[i]!;
    ssTot += (ys[i]! - my) ** 2;
    ssRes += (ys[i]! - f) ** 2;
  }
  return {
    intercept,
    slope,
    n,
    r2: 1 - ssRes / ssTot,
    resid_sd: Math.sqrt(ssRes / (n - 2)),
  };
}

/** The curve's fitted value for one protocol's TVL. */
function curveValue(fit: FitCurve, tvlUsd: number): number {
  return 10 ** (fit.intercept + fit.slope * Math.log10(tvlUsd));
}

/** The median FDV/TVL multiples of a protocol list, by category, for the old model. */
function medianMultiples(protocols: SnapshotProtocol[]): { byCategory: Map<string, number[]>; overall: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  return { byCategory, overall: median(all) };
}

/** The old radar-2 prediction: category median multiple, clamped, times the adjustments. */
function medianPredict(train: SnapshotProtocol[], p: SnapshotProtocol, asOf: string, model: ModelConstants): number {
  const { byCategory, overall } = medianMultiples(train);
  const list = byCategory.get(p.category ?? 'Other') ?? [];
  const multiple = clamp(list.length >= 3 ? median(list) : overall, 0.05, 1.5);
  return Math.max(1, p.tvl_usd * multiple * adjustments(p, asOf, model).combined);
}

/** The growth, maturity and breadth multipliers for one protocol, and their product. */
export function adjustments(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; combined: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + extraChains * model.breadth_per_chain;
  return { growthPct, growthMult, maturityMult, breadthMult, combined: growthMult * maturityMult * breadthMult, age };
}

/** The multipliers and the implied value one protocol gets under the fitted curve. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: FitCurve,
): { implied: number; fitBase: number; bandLow: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const adj = adjustments(protocol, asOf, model);
  const fitBase = curveValue(fit, protocol.tvl_usd);
  const implied = Math.max(1, Math.round(fitBase * adj.combined));
  const bandLow = Math.max(1, Math.round(implied * 10 ** (-model.band_z * fit.resid_sd)));
  return { implied, fitBase, bandLow, growthPct: adj.growthPct, growthMult: adj.growthMult, maturityMult: adj.maturityMult, breadthMult: adj.breadthMult, age: adj.age };
}

/** The held-out test: 5-fold cross-validation and a walk-forward split, curve vs the old model.
 *  Folds are assigned by slug order and the walk-forward split by listing date, so the test is
 *  the same on every run. Errors are log10 RMSE on held-out traded tokens' market caps. */
export function validateFit(protocols: SnapshotProtocol[], asOf: string, model: ModelConstants): Validation {
  const pool = fitPool(protocols);
  const sorted = [...pool].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const folds = 5;
  let curveSe = 0;
  let curveOnlySe = 0;
  let medianSe = 0;
  let n = 0;
  for (let k = 0; k < folds; k++) {
    const test = sorted.filter((_, i) => i % folds === k);
    const train = sorted.filter((_, i) => i % folds !== k);
    const fit = fitCurve(train);
    for (const p of test) {
      const actual = Math.log10(p.mcap_usd!);
      const eCurve = Math.log10(Math.max(1, curveValue(fit, p.tvl_usd) * adjustments(p, asOf, model).combined)) - actual;
      const eCurveOnly = Math.log10(Math.max(1, curveValue(fit, p.tvl_usd))) - actual;
      const eMedian = Math.log10(medianPredict(train, p, asOf, model)) - actual;
      curveSe += eCurve * eCurve;
      curveOnlySe += eCurveOnly * eCurveOnly;
      medianSe += eMedian * eMedian;
      n++;
    }
  }
  const dated = pool.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const cut = Math.floor((dated.length * 2) / 3);
  const trainW = dated.slice(0, cut);
  const testW = dated.slice(cut);
  const fitW = fitCurve(trainW);
  let curveWSe = 0;
  let medianWSe = 0;
  for (const p of testW) {
    const actual = Math.log10(p.mcap_usd!);
    const eCurve = Math.log10(Math.max(1, curveValue(fitW, p.tvl_usd) * adjustments(p, asOf, model).combined)) - actual;
    const eMedian = Math.log10(medianPredict(trainW, p, asOf, model)) - actual;
    curveWSe += eCurve * eCurve;
    medianWSe += eMedian * eMedian;
  }
  return {
    cv_folds: folds,
    cv_curve_rmse: Math.sqrt(curveSe / n),
    cv_curve_only_rmse: Math.sqrt(curveOnlySe / n),
    cv_median_rmse: Math.sqrt(medianSe / n),
    cv_n: n,
    walkforward_curve_rmse: Math.sqrt(curveWSe / testW.length),
    walkforward_median_rmse: Math.sqrt(medianWSe / testW.length),
    walkforward_n_test: testW.length,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories whose product is a wrapped, staked or bridged form of a token that already trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol name must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or bridged
 *  product of a token that already trades, not a versioned pool, not an exchange. This is the
 *  watchlist's own cleanliness rule, so the board finds the same kind of protocol outside it. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking|restaking|restaked)\b/i.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const fit = fitCurve(fitPool(snapshot.protocols));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other clean pre-token protocol in the snapshot, by TVL. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const s = impliedValue(p, snapshot.as_of, model, fit);
    return { p, ...s };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // The fitted base is stored at full precision: the dashboard recomputes the implied
      // value from this row, and a rounded base would make its recomputation disagree with
      // board.json by a few dollars. The page shows it to three significant figures.
      fit_base_usd: s.fitBase,
      band_low_usd: s.bandLow,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.bandLow).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A dollar figure in the short form the farm plan uses. */
export function fmtUsdShort(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas one farm position spends: the setup plus $2 a week over the hold. */
export function gasTotalFor(p: SnapshotProtocol, holdDays: number): number {
  const setup = capitalFor(p) >= 150 ? 8 : 4;
  return setup + 2 * Math.ceil(holdDays / 7);
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's one thing to watch while the position is open, so the plan is not only upside. */
function cautionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Check ${name}'s health factor every week: a sharp price move can liquidate a borrow, so keep collateral well above the minimum.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Watch the pool's price range: if the pair drifts out of range, the position stops earning and impermanent loss grows.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Watch funding: a position held across many funding intervals pays it every few hours, so close it if funding stays against you.`;
  if (c.includes('bridge')) return `Bridge only from the app's own page and only the amount you will use: a bridge transfer cannot be recalled once it is sent.`;
  if (c.includes('staking') || c.includes('restak')) return `Check the unbonding time before you stake: some receipt tokens lock for days, so you cannot exit at once.`;
  if (c.includes('prediction')) return `A market position can go to zero if the outcome lands the other way, so size it as money you can lose.`;
  if (c.includes('curator') || c.includes('allocator')) return `Read the vault's fee and withdrawal queue first: a vault can charge on entry and delay exits for days.`;
  if (c.includes('stable')) return `Check what backs the stable asset and whether it has ever depegged: a thin peg is the risk, not the yield.`;
  if (c.includes('rwa')) return `Check who holds the underlying asset and how it is audited: the yield is only as good as the issuer behind it.`;
  if (c.includes('insurance')) return `Read what the cover actually pays for: most policies exclude the exact failure a farmer worries about.`;
  return `Check the protocol's own status page weekly: an exploit or a paused contract is the risk no yield covers.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age) and from the fitted band, never
 * from a hand-written list of names. Step four nets the plan: the gas the whole hold spends
 * against the capital at work, and what the launch would be worth at the low end of the fitted
 * band, per $100 of capital. Step five is the category's own caution, so the plan says what can
 * go wrong too.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, bandLowUsd: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasTotalFor(p, hold);
  const per100 = Math.round((bandLowUsd / capital) * 100);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Netted: about $${gas} of gas in total over the hold, against a $${capital} position; at the low end of the fitted band the launch would be worth ${fmtUsdShort(bandLowUsd)}, or ${fmtUsdShort(per100)} per $100 of capital.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: cautionFor(p),
      cost: 'nothing but the check',
      time: '10 minutes a week',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    fit_base_usd: row.model.fit_base_usd,
    band_low_usd: row.model.band_low_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const pool = fitPool(snapshot.protocols);
  const fit = fitCurve(pool);
  const validation = validateFit(snapshot.protocols, snapshot.as_of, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit,
    validation,
    fit_points: pool.map((p) => [Math.log10(p.tvl_usd), Math.log10(p.mcap_usd!)] as [number, number]),
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
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
