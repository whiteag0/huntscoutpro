// Links between the Pro gates, sign-in and checkout. Client-safe, no imports.
//
// A signed-out buyer goes to /signin with callbackUrl=/pricing?checkout=1; back on
// /pricing with a session, that flag starts checkout once (see AutoCheckout).

export const CHECKOUT_PARAM = "checkout";
export const PRICING_CHECKOUT_PATH = `/pricing?${CHECKOUT_PARAM}=1`;

const BASE = "https://huntscout.invalid";

/**
 * Same-site path to return to after sign-in, or the fallback. Resolved the way the browser will
 * resolve it, so javascript:, //host, /\host and "/<tab>/host" (tabs and newlines are stripped) can't leave the site.
 */
export function safeCallbackUrl(raw: string | null | undefined, fallback = "/states"): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  try {
    const u = new URL(raw, BASE);
    return u.origin === BASE ? `${u.pathname}${u.search}${u.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/** /signin that comes back to `returnTo` (a same-site path). */
export function signInHref(returnTo: string): string {
  return `/signin?callbackUrl=${encodeURIComponent(safeCallbackUrl(returnTo, "/"))}`;
}

/** Sign-in for a buyer: comes back to /pricing and goes straight on to checkout. */
export const CHECKOUT_SIGN_IN_HREF = signInHref(PRICING_CHECKOUT_PATH);

/** True when a path (or full URL) is /pricing carrying the checkout flag. */
export function isCheckoutPath(href: string): boolean {
  try {
    const u = new URL(href, BASE);
    return u.pathname === "/pricing" && u.searchParams.get(CHECKOUT_PARAM) === "1";
  } catch {
    return false;
  }
}

/** The same URL without the checkout flag, so a reload or Back from Stripe doesn't start checkout again. */
export function withoutCheckoutParam(href: string): string {
  const u = new URL(href, BASE);
  u.searchParams.delete(CHECKOUT_PARAM);
  const rest = `${u.pathname}${u.search}${u.hash}`;
  return u.origin === BASE ? rest : `${u.origin}${rest}`;
}
