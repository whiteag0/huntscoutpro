import { NextRequest, NextResponse } from "next/server";
import { getStateData } from "@/lib/agency";
import { isLocalStore, isStoreConfigured } from "@/lib/blob-store";
import { normalizeEmail } from "@/lib/entitlement";
import { SITE } from "@/lib/emails/onboarding";
import { freeConfirmEmail } from "@/lib/emails/free-reminders";
import { stateOption } from "@/lib/free-reminders-options";
import { parseFreeSignup } from "@/lib/free-reminders-schema";
import { requestSubscription, type SignupOutcome } from "@/lib/free-reminders-store";
import { canSignFreeReminderLinks, confirmUrl } from "@/lib/free-reminders-token";
import { sendEmail } from "@/lib/onboarding";

// POST /api/free-reminders/subscribe
// { email, state, species[], residency, website (honeypot), startedAt (ms when the form rendered), source }
// Stores a pending request in the private Blob store and emails a signed confirmation link.
// The reply is the same whether or not the address is already subscribed.

export const dynamic = "force-dynamic";

// Best-effort abuse limits (per server instance). The durable per-address cap
// on confirmation emails lives in the stored record.
const WINDOW_MS = 60 * 60 * 1000;
const LIMITS = { ip: 10, email: 5 } as const;
const hits = new Map<string, number[]>();

function limited(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > max;
}

/** Faster than this from page render to submit is a bot. */
const MIN_FILL_MS = 2500;
const SOURCES = new Set(["calendar", "home", "state"]);

export async function POST(req: NextRequest) {
  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Bots: hidden field filled in, or submitted faster than a person can type. Pretend it worked.
  const startedAt = Number(raw.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return NextResponse.json({ error: "Please reload the page and try again." }, { status: 400 });
  }
  if (raw.website || Date.now() - startedAt < MIN_FILL_MS) {
    return NextResponse.json({ ok: true });
  }

  // Species must be ones this state publishes dates for.
  const state = typeof raw.state === "string" ? raw.state.trim().toLowerCase() : "";
  const data = state ? await getStateData(state) : null;
  const option = data ? stateOption(data) : null;
  const parsed = parseFreeSignup(raw, (s) => (option && s === option.slug ? option.species.map((x) => x.id) : null));
  if (!parsed.ok) return NextResponse.json({ error: "Please fix the highlighted fields.", errors: parsed.errors }, { status: 422 });
  const signup = parsed.value;

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (limited(`ip:${ip}`, LIMITS.ip) || limited(`email:${normalizeEmail(signup.email)}`, LIMITS.email)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  if (!isStoreConfigured() || !canSignFreeReminderLinks()) {
    console.error("free-reminders: storage or AUTH_SECRET not configured");
    return NextResponse.json({ error: "Reminders aren't available right now. Please try again later." }, { status: 503 });
  }

  const reply = NextResponse.json({
    ok: true,
    message: `Check ${signup.email} for a link to confirm. If this address isn't already getting ${option!.name} reminders, the email should arrive within a few minutes (check spam if it doesn't).`,
  });

  let outcome: SignupOutcome;
  try {
    outcome = await requestSubscription(signup, { source: typeof raw.source === "string" && SOURCES.has(raw.source) ? raw.source : undefined });
  } catch (err) {
    console.error("free-reminders: store write failed:", err);
    return NextResponse.json({ error: "We couldn't save your signup. Please try again in a minute." }, { status: 503 });
  }
  if (outcome.kind !== "send") {
    console.log(`free-reminders: signup ${outcome.kind} (${outcome.id.slice(0, 8)})`);
    return reply;
  }

  // Local disk store (dev / local QA only): links point at this server instead of production.
  const local = isLocalStore();
  const base = local ? req.nextUrl.origin : SITE;
  const link = confirmUrl(outcome.id, outcome.nonce, outcome.expiresSec, base);
  const email = freeConfirmEmail({
    stateName: data!.name,
    agencyName: data!.agency.name,
    species: signup.species,
    confirmUrl: link,
    mode: outcome.change ? "change" : "new",
  });

  try {
    const id = await sendEmail({
      to: signup.email,
      email,
      // Collapses double clicks within the same minute into one email.
      idempotencyKey: `hs-free-confirm-${outcome.id.slice(0, 24)}-${outcome.nonce}-${Math.floor(Date.now() / 60000)}`,
      bcc: false,
    });
    if (!id) {
      if (!local) throw new Error("RESEND_API_KEY is not set");
      console.log(`free-reminders (local, email not sent): confirm link for ${signup.email}: ${link}`);
    }
  } catch (err) {
    console.error("free-reminders: confirmation email failed:", err);
    return NextResponse.json({ error: "We couldn't send the confirmation email. Please try again in a few minutes." }, { status: 502 });
  }
  return reply;
}
