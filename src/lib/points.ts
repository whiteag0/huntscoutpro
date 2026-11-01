import "server-only";
import { stripe } from "@/lib/stripe";
import { POINTS_KEY, POINTS_MAX_CHARS, parsePoints, serializePoints, type PointsMap } from "@/lib/points-schema";

// Structured point balances live next to the member's other preferences, as one
// metadata key on the purchase's PaymentIntent. Only POINTS_KEY is written here,
// so the hs_pref_* keys managed by src/lib/preferences.ts are never touched.

export class PointsTooLongError extends Error {
  constructor(public readonly length: number) {
    super(`Point list is ${length} characters; the limit is ${POINTS_MAX_CHARS}.`);
  }
}

/** Points saved on a PaymentIntent's metadata (already fetched). */
export function pointsFromMetadata(md: Record<string, string> | null | undefined): PointsMap {
  return parsePoints(md?.[POINTS_KEY]).points;
}

export async function readPoints(paymentIntentId: string): Promise<PointsMap> {
  if (!stripe) return {};
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return pointsFromMetadata(pi.metadata as Record<string, string>);
}

/** Replace the saved points. An empty map removes the key. Returns the stored string. */
export async function writePoints(paymentIntentId: string, points: PointsMap): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  const value = serializePoints(points);
  if (value.length > POINTS_MAX_CHARS) throw new PointsTooLongError(value.length);
  // Stripe merges metadata by key; an empty string deletes just this key.
  await stripe.paymentIntents.update(paymentIntentId, { metadata: { [POINTS_KEY]: value } });
  return value;
}
