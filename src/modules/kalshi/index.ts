import { HttpKalshiClient } from "./http-client";
import { FixtureKalshiClient } from "./fixture-client";
import type { KalshiClient } from "./types";

export type { KalshiClient, NormalizedMarket } from "./types";

/**
 * Returns the live client when Kalshi credentials are present, otherwise the
 * fixture client. This is the single seam the jobs depend on.
 */
export function getKalshiClient(): KalshiClient {
  const keyId = process.env.KALSHI_API_KEY_ID;
  const privateKeyPem = process.env.KALSHI_API_PRIVATE_KEY;
  if (keyId && privateKeyPem) {
    return new HttpKalshiClient({ keyId, privateKeyPem });
  }
  return new FixtureKalshiClient();
}

export function usingFixtures(): boolean {
  return !(process.env.KALSHI_API_KEY_ID && process.env.KALSHI_API_PRIVATE_KEY);
}
