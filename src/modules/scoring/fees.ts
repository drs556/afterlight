// Kalshi official trading fee (docs/04 §6.1). Kalshi's published general fee is
//   fee = roundup_to_cent( 0.07 × contracts × price × (1 − price) )
// with price in dollars [0,1]. At price 0.50 this is ceil($0.0175) = $0.02 per
// contract — the ~2¢ sanity check from the blueprint. Do NOT approximate; this
// is the formula, and fees.test.ts pins it against Kalshi's own examples.

/** Round a dollar amount up to the next whole cent. */
function ceilCent(usd: number): number {
  return Math.ceil(usd * 100 - 1e-9) / 100;
}

/** Total Kalshi trading fee in USD for `contracts` at `price` (dollars, [0,1]). */
export function feesUsd(price: number, contracts: number): number {
  const raw = 0.07 * contracts * price * (1 - price);
  return ceilCent(raw);
}

/** Per-contract fee at a given price (dollars, [0,1]). */
export function feePerContract(price: number): number {
  return feesUsd(price, 1);
}
