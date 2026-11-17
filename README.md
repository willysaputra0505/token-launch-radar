# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/willysaputra0505/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/willysaputra0505/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that ranks pre-token DeFi protocols by implied launch value — what a token would be worth if the protocol's record stayed as it is. It does not predict whether or when a token is issued.

Entry for the make.fun **token-radar-01** bounty ($1,325; deadline 14 Dec 2026, 17:00 WIB).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Requires Node 22+. No dependencies beyond the Node standard library.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ph5sj25b&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

---

## Top 5 (of 177 rows)

| Rank | Protocol | TVL | Implied value |
| --- | --- | --- | --- |
| 1 | Steakhouse Financial | $2,753,981,495 | $534,663,362 |
| 2 | Gauntlet | $1,577,685,462 | $318,432,529 |
| 3 | Veda | $1,563,415,482 | $306,149,537 |
| 4 | USDD | $1,055,793,606 | $153,239,260 |
| 5 | Upshift | $499,083,733 | $109,836,010 |

Full board: `out/board.json` (177 rows). Each row also carries farm steps for that protocol.

## How it works

- Input: the sealed DefiLlama snapshot (`snapshot.json`, fetched 2026-11-14, 758 protocols, 40 on the watchlist). The program reads it from `/input/snapshot.json` (or `--input <file|dir>`).
- Model `radar-2` (`lib/model.ts`): implied value = TVL × the category's median FDV/TVL multiple from live-token protocols in the same category (whole-snapshot median when fewer than 3 peers), adjusted for 7-day TVL growth, maturity, and chain breadth.
- Output: ranked `board.json`, a static offline dashboard (`dashboard/`, no framework, no network), 3 screenshots, and `dossier.json` built with the vendored `vendor/makefun-board.ts`.

## Files

- `main.ts` — entry point, reads the snapshot and writes `/output`
- `lib/model.ts` — scoring model and board builder
- `dashboard/` — static dashboard (board, detail view, filter)
- `screenshots/` — 1-board, 2-detail, 3-filtered
- `vendor/makefun-board.ts` — vendored dossier builder
- `out/` — generated output from the local run (board, data, dashboard, screenshots, dossier)
