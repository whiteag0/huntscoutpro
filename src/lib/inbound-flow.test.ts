// Run with: npm test
// Service-level flow against the local store with a fake Resend that enforces idempotency keys
// the way Resend does (same key + different payload = 409). Made-up data only.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.AUTH_SECRET = "review-secret-0123456789abcdef0123456789";
process.env.EMAIL_INBOUND_ADDRESS = "replies@in.huntscoutpro.com";
process.env.RESEND_INBOUND_WEBHOOK_SECRET = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
process.env.RESEND_API_KEY = "re_fake";
process.env.BLOB_LOCAL_DIR = mkdtempSync(path.join(os.tmpdir(), "inbound-flow-"));
after(() => rmSync(process.env.BLOB_LOCAL_DIR!, { recursive: true, force: true }));

const fixtures: Record<string, unknown> = {};
const keys = new Map<string, string>();
const sent: { key: string | null; body: { to: string[]; subject: string; headers?: Record<string, string> } }[] = [];
let onCustomerSend: null | (() => Promise<void>) = null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const json = (code: number, obj: unknown) => new Response(JSON.stringify(obj), { status: code, headers: { "content-type": "application/json" } });
  const m = url.match(/\/emails\/receiving\/([^/?]+)$/);
  if (m) return fixtures[m[1]] ? json(200, fixtures[m[1]]) : json(404, { name: "not_found" });
  if (url.endsWith("/emails") && init?.method === "POST") {
    const key = (init.headers as Record<string, string>)["Idempotency-Key"] ?? null;
    const body = String(init.body);
    if (key && keys.has(key)) {
      if (keys.get(key) !== body) return json(409, { name: "invalid_idempotent_request" });
      return json(200, { id: "replayed" });
    }
    if (key) keys.set(key, body);
    const parsed = JSON.parse(body);
    sent.push({ key, body: parsed });
    if (parsed.to[0] === "pat.hunter@example.net" && onCustomerSend) {
      const f = onCustomerSend;
      onCustomerSend = null;
      await f();
    }
    return json(200, { id: `0000000-sent-${sent.length}-0000000000000000` });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

const mail = (id: string, msgId: string, text: string, refs: string[] = []) => ({
  id,
  from: "pat.hunter@example.net",
  to: ["replies@in.huntscoutpro.com"],
  subject: "Re: Welcome to HuntScout Pro",
  text,
  message_id: msgId,
  created_at: new Date().toISOString(),
  headers: { from: "Pat Hunter <pat.hunter@example.net>", ...(refs.length ? { "in-reply-to": refs[refs.length - 1], references: refs.join(" ") } : {}) },
  authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
});

const gen = async () => ({ text: "Hi Pat,\n\nThanks for writing. I'll look into that for you.\n\nBest,\nAdam\n===NOTE FOR ADAM===\nNothing to flag." });

test("follow-up after a send gets a new revision, its own approval email, and old approve links don't match", async () => {
  const svc = await import("@/lib/inbound/service");
  const { getThread } = await import("@/lib/inbound/store");
  const { verifyActionToken } = await import("@/lib/inbound/tokens");

  const id1 = "11111111-1111-4111-8111-111111111111";
  fixtures[id1] = mail(id1, "<m1@mail.example.net>", "When is the Colorado elk deadline?");
  const r1 = await svc.intakeReceived(id1);
  assert.equal(r1.status, "stored");
  const tid = (r1 as { threadId: string }).threadId;
  const t1 = await svc.prepareDraft(tid, { notify: true, generate: gen });
  const firstRev = t1!.draft!.rev;
  const oldApprove = new URL(svc.actionLinks(t1!).approveUrl!).searchParams.get("t")!;
  assert.equal(sent.filter((s) => s.body.subject.startsWith("Reply ready")).length, 1);

  // Owner sends from the admin page (session: the approve link's nonce is never spent).
  await svc.sendReply(tid, { text: "Hi Pat, it's in April. Adam" });
  const afterSend = (await getThread(tid))!.thread;
  assert.equal(afterSend.status, "sent");

  const id2 = "22222222-2222-4222-8222-222222222222";
  fixtures[id2] = mail(id2, "<m2@mail.example.net>", "Thanks! And what about unit 61?", ["<m1@mail.example.net>"]);
  const r2 = await svc.intakeReceived(id2);
  assert.equal((r2 as { threadId: string }).threadId, tid, "follow-up joins the thread");
  const t2 = await svc.prepareDraft(tid, { notify: true, generate: async () => ({ text: "Hi Pat,\n\nA different answer about unit 61 here.\n\nBest,\nAdam\n===NOTE FOR ADAM===\nNothing to flag." }) });
  assert.ok(t2!.draft!.rev > firstRev, `revision ${t2!.draft!.rev} must be above ${firstRev}`);
  assert.equal(sent.filter((s) => s.body.subject.startsWith("Reply ready")).length, 2, "the owner is told about the follow-up");

  const tok = verifyActionToken(oldApprove, "approve");
  assert.ok(tok.ok);
  await assert.rejects(svc.sendReply(tid, { expectRev: tok.token.r, nonce: tok.token.n }), /draft changed/);
});

test("a customer message that lands while the reply is sending stays open for a reply", async () => {
  const svc = await import("@/lib/inbound/service");
  const { getThread } = await import("@/lib/inbound/store");
  const id3 = "33333333-3333-4333-8333-333333333333";
  const id4 = "44444444-4444-4444-8444-444444444444";
  fixtures[id3] = mail(id3, "<m3@mail.example.net>", "Is Wyoming antelope covered?");
  const r3 = await svc.intakeReceived(id3);
  const tid = (r3 as { threadId: string }).threadId;
  await svc.prepareDraft(tid, { notify: false, generate: gen });
  fixtures[id4] = mail(id4, "<m4@mail.example.net>", "Also, one more question about Idaho.", ["<m3@mail.example.net>"]);
  onCustomerSend = async () => {
    const r = await svc.intakeReceived(id4);
    assert.equal((r as { threadId: string }).threadId, tid);
  };
  const out = await svc.sendReply(tid, {});
  assert.equal(out.status, "pending", "the unanswered follow-up keeps the thread open");
  assert.equal((await getThread(tid))!.thread.messages.filter((m) => m.direction === "in").length, 2);
});
