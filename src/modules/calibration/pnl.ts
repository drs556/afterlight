// Paper PnL (docs/04 §9): for every snapshot that was actionable, simulate
// entry at the fee-adjusted cost with f_used sizing, held to resolution.
// Pure, no I/O. `c` (feeAdjustedCost) already embeds the Kalshi fee and the
// exit-friction reserve, so it is fee-included by construction.

export interface PaperPnlInput {
  ticker: string;
  /** "yes" | "no" — the direction the score picked. */
  direction: "yes" | "no" | null;
  /** Fee-adjusted per-contract cost of the chosen direction, (0,1). */
  feeAdjustedCost: number | null;
  /** Kelly fraction of bankroll actually sized. */
  kellyUsed: number | null;
  actionable: boolean;
  /** Resolved outcome: 1 = YES happened, 0 = NO happened. */
  outcome: 0 | 1;
}

export interface PaperPnlRow {
  ticker: string;
  won: boolean;
  stakeUsd: number;
  pnlUsd: number;
}

export interface PaperPnlResult {
  rows: PaperPnlRow[];
  totalPnlUsd: number;
  totalStakedUsd: number;
  wins: number;
  losses: number;
}

/**
 * Simulate paper trading every actionable, resolved row. A contract costs `c`
 * dollars and pays $1 on a win: ROI is (1−c)/c on a win, −1 (total loss) on a
 * loss. Dollars staked = kellyUsed × bankroll.
 */
export function paperPnl(inputs: PaperPnlInput[], bankrollUsd: number): PaperPnlResult {
  const rows: PaperPnlRow[] = [];
  let wins = 0;
  let losses = 0;
  let totalStaked = 0;
  let totalPnl = 0;

  for (const i of inputs) {
    if (!i.actionable) continue;
    if (i.direction === null || i.feeAdjustedCost === null || i.kellyUsed === null) continue;
    const c = i.feeAdjustedCost;
    if (c <= 0 || c >= 1) continue; // degenerate cost, skip

    const won = (i.direction === "yes" && i.outcome === 1) || (i.direction === "no" && i.outcome === 0);
    const stake = i.kellyUsed * bankrollUsd;
    const pnl = won ? stake * ((1 - c) / c) : -stake;

    rows.push({ ticker: i.ticker, won, stakeUsd: stake, pnlUsd: pnl });
    totalStaked += stake;
    totalPnl += pnl;
    if (won) wins++;
    else losses++;
  }

  return { rows, totalPnlUsd: totalPnl, totalStakedUsd: totalStaked, wins, losses };
}
