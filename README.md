# Token Radar — the pre-token protocol board

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cimol-dev-hitam/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cimol-dev-hitam/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for [make.fun](https://make.fun)'s **token-radar-01** bounty: read a sealed DefiLlama snapshot,
work out which protocols still record no token, and rank them by what their launch could be worth — with the
steps to farm each one before or after it issues.

## The model

Every protocol's implied value starts from its TVL, multiplied by a category multiple (lending, DEX, perps,
yield, infra, unknown), adjusted by seven-day TVL momentum and by how long DefiLlama has tracked it, then
ranked strictly so no two rows share a value. The category table and the momentum bands are printed on the
dashboard itself, so a reader can argue with the numbers rather than guess at them.

Protocols that record no token — the snapshot's 40-protocol watchlist plus the pre-token protocols outside it —
get a farm plan: bridge, deposit, join the points or incentive program, keep liquidity, and what to watch
before a token exists. The plans are written per category and per chain set, not copy-pasted.

## The dashboard

`dashboard/` is a static page with no network: a sortable board (rank, protocol, category, chains, TVL, 7-day
change, implied value, value/TVL multiple), search and filters by category, chain and value band, and a detail
view that opens on a row with the multiple breakdown and the farm plan. Data comes from `data.js`, which
`main.ts` writes from the same board the entry submits.

## Run it

```bash
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
node -e "const b=require('./out/board.json');console.log(b.rows.length,'rows')"
```

`main.ts` writes `out/board.json`, `out/data.js`, copies `dashboard/` and `screenshots/` into `out/`, and
writes `out/dossier.json` with `buildDossier` from `vendor/makefun-board.ts` — the same shape the scorer reads.

## Licence

MIT.
