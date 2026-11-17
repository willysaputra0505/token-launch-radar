# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/willysaputra0505/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/willysaputra0505/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that ranks pre-token DeFi protocols by implied launch value — what a token would be worth if the protocol's record stayed as it is. It does not predict whether or when a token is issued.

Entry for the make.fun **token-radar-01** bounty ($1,325; deadline 14 Dec 2026, 17:00 WIB).

Revision 4 is a dashboard overhaul: the model is unchanged from radar-3 — the page changed, not the arithmetic. It adds a headline finding with the fit's own band, a top-10 deep dive with sensitivity ranges (TVL halved and doubled) and the nearest traded comparables per protocol, and a section that maps each of the brief's criteria to the part of the page that answers it.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Requires Node 22+. No dependencies beyond the Node standard library.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ph5sj25b&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

---

## Top 5 (of 197 rows)

| Rank | Protocol | TVL | Implied value |
| --- | --- | --- | --- |
| 1 | Steakhouse Financial | $2,753,981,495 | $62,636,355 |
| 2 | Sentora Curator | $2,757,585,593 | $56,992,793 |
| 3 | Gauntlet | $1,577,685,462 | $50,059,872 |
| 4 | Veda | $1,563,415,482 | $48,360,314 |
| 5 | USDD | $1,055,793,606 | $37,742,444 |

Full board: `out/board.json` (197 rows). Each row also carries farm steps for that protocol.

## How it works

- Input: the sealed DefiLlama snapshot (`snapshot.json`, fetched 2026-11-14, 758 protocols, 40 on the watchlist). The program reads it from `/input/snapshot.json` (or `--input <file|dir>`).
- Model `radar-3` (`lib/model.ts`): implied value = the fitted log-log curve's value for the protocol's TVL — `log10(FDV) = 3.382 + 0.472 × log10(TVL)`, least squares over the snapshot's 119 traded protocols outside CEX (R² 0.14, residual SD 0.90 in log10) — adjusted for 7-day TVL growth, maturity, and chain breadth. The curve is fitted at run time from the snapshot, never hard-coded.
- Held-out test (shown on the dashboard): 5-fold cross-validation log10 RMSE 0.915 for the curve vs 1.038 for the old median-multiple model; walk-forward (fit the oldest two-thirds, test the newest third) 1.061 vs 1.194. Per-category intercepts and a ridge regression on TVL, chains, age and 7-day change were fitted and rejected — both predicted worse out of sample than the single curve. Every farm plan is netted at the low end of the fit's 80% prediction band.
- Dashboard (revision 4): a headline finding with the fit's band, the top 10 examined with sensitivity ranges and nearest traded comparables (same category, closest TVL first, computed at build time from the snapshot's traded tokens), and a section mapping the brief's five criteria to the page. The detail view for each top-10 protocol shows the comparables table and what the headline would need the market to pay; where a category has almost no traded name, the page says so.
- Output: ranked `board.json`, a static offline dashboard (`dashboard/`, no framework, no network), 3 screenshots, and `dossier.json` built with the vendored `vendor/makefun-board.ts`.

## Files

- `main.ts` — entry point, reads the snapshot and writes `/output`
- `lib/model.ts` — scoring model and board builder
- `dashboard/` — static dashboard (board, detail view, filter)
- `screenshots/` — 1-board, 2-detail, 3-filtered
- `vendor/makefun-board.ts` — vendored dossier builder
- `out/` — generated output from the local run (board, data, dashboard, screenshots, dossier)
