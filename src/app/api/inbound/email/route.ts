import { NextRequest, NextResponse, after } from "next/server";
import { INBOUND_LIMITS, isInboundConfigured, webhookSecret } from "@/lib/inbound/config";
import { verifySvix } from "@/lib/inbound/svix";
import { intakeReceived, prepareDraft } from "@/lib/inbound/service";

// Resend "email.received" webhook. Verifies the Svix signature on the raw body, stores the
// message, answers 200 fast, then drafts a reply and emails the owner for approval (after()).
// Nothing here ever sends to the customer: that only happens when the owner approves.

export const dynamic = "force-dynamic";
// Drafting runs after the response; give it room for a slow model call.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const secret = webhookSecret();
  if (!secret || !isInboundConfigured()) {
    return NextResponse.json({ error: "Inbound email isn't configured." }, { status: 503 });
  }

  const length = Number(req.headers.get("content-length") || 0);
  if (length > INBOUND_LIMITS.webhookBytes) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const body = await req.text();
  if (body.length > INBOUND_LIMITS.webhookBytes) return NextResponse.json({ error: "Too large." }, { status: 413 });

  const check = verifySvix(
    secret,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") },
    body,
    { toleranceSec: INBOUND_LIMITS.signatureToleranceSec }
  );
  if (check !== "ok") {
    console.warn(`[inbound] webhook rejected: ${check}`);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: { type?: unknown; data?: { email_id?: unknown } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  // Other event types may share the endpoint; acknowledge and ignore them.
  if (event.type !== "email.received") return NextResponse.json({ ok: true, ignored: "event type" });

  try {
    const result = await intakeReceived(event.data?.email_id);
    if (result.status === "stored" && result.draft) {
      const threadId = result.threadId;
      after(async () => {
        try {
          await prepareDraft(threadId, { notify: true });
        } catch (err) {
          console.error(`[inbound] drafting failed for ${threadId}:`, err instanceof Error ? err.name : "error");
        }
      });
    }
    return NextResponse.json({ ok: true, status: result.status, ...(result.status === "ignored" ? { reason: result.reason } : {}) });
  } catch (err) {
    // 500 makes Resend retry with backoff; nothing was stored (the claim is released on failure).
    console.error("[inbound] intake failed:", err instanceof Error ? `${err.name}: ${err.message.slice(0, 120)}` : "error");
    return NextResponse.json({ error: "Temporary failure." }, { status: 500 });
  }
}
