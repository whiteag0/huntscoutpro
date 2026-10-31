import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/onboarding";
import { stateRequestNotification } from "@/lib/emails/onboarding";
import { parseStateRequest } from "@/lib/state-request-schema";
import { STATE_LIST } from "@/data/state-list";
import { SPECIES_LABELS } from "@/data/types";
import { METHOD_OPTIONS } from "@/lib/preferences-schema";

export const dynamic = "force-dynamic";

const NOTIFY_TO = process.env.STATE_REQUEST_TO || "adam@huntscoutpro.com";

// Best-effort abuse limits (per server instance).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

const RESIDENCY_LABELS = { resident: "Resident", nonresident: "Nonresident", both: "Both", "": "" } as const;

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

  // Bots: hidden field filled in, or the form submitted faster than a person can type.
  const startedAt = Number(raw.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return NextResponse.json({ error: "Please reload the page and try again." }, { status: 400 });
  }
  if (raw.website || Date.now() - startedAt < 2500) {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseStateRequest(raw);
  if (!parsed.ok) return NextResponse.json({ error: "Please fix the highlighted fields.", errors: parsed.errors }, { status: 422 });
  const r = parsed.value;

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (limited(`ip:${ip}`) || limited(`email:${r.email}`)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const session = await auth();
  const account = session?.user?.email
    ? `${session.user.email}${session.user.isPro ? " (Pro member)" : " (signed in, not a member)"}`
    : "Not signed in";

  const state = STATE_LIST.find((s) => s.slug === r.state)!;
  const home = STATE_LIST.find((s) => s.abbrev === r.homeState);
  const lines: [string, string][] = [
    ["State requested", state.name],
    ["Name", r.name],
    ["Email", r.email],
    ["Phone", r.phone],
    ["Residency for this state", RESIDENCY_LABELS[r.residency]],
    ["Home state", home ? home.name : ""],
    ["Species", r.species.map((s) => (SPECIES_LABELS as Record<string, string>)[s]).join(", ")],
    ["Method of take", r.methods.map((m) => METHOD_OPTIONS.find((o) => o.id === m)?.label || m).join(", ")],
    ["When they plan to hunt", r.timeframe],
    ["Notes", r.notes],
    ["Email them when it's live", r.notify ? "Yes" : "No"],
    ["HuntScout account", account],
  ];

  // Same request twice in a day (double submit) sends one email; any change sends a new one.
  // The key covers everything in the email body, as Resend rejects a reused key with a different payload.
  const day = new Date().toISOString().slice(0, 10);
  const idem = createHash("sha256").update(JSON.stringify([day, lines])).digest("hex").slice(0, 40);

  try {
    const id = await sendEmail({
      to: NOTIFY_TO,
      email: stateRequestNotification({ stateName: state.name, name: r.name, email: r.email, lines }),
      replyTo: r.email,
      idempotencyKey: `hs-state-req-${idem}`,
    });
    if (!id) throw new Error("Email is not configured");
  } catch (err) {
    console.error("State request email failed:", err);
    return NextResponse.json(
      { error: "We couldn't send your request. Please email adam@huntscoutpro.com instead." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
