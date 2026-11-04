"use server";

import { redirect } from "next/navigation";
import { accessFor } from "@/lib/inbound/admin-auth";
import { getThread } from "@/lib/inbound/store";
import { ReplyActionError, prepareDraft, saveDraft, sendReply, setThreadStatus } from "@/lib/inbound/service";
import { isThreadId } from "@/lib/inbound/thread";
import { verifyActionToken } from "@/lib/inbound/tokens";

// Owner actions on a reply thread. Every action re-checks access (admin session or a signed,
// unused link for this thread) before touching anything. Results come back as ?done= / ?error=.

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

function back(id: string, token: string, params: Record<string, string>): never {
  const q = new URLSearchParams(params);
  if (token) q.set("t", token);
  redirect(`/admin/replies/${id}?${q.toString()}`);
}

async function editorAccess(fd: FormData) {
  const id = str(fd, "id");
  const token = str(fd, "t");
  if (!isThreadId(id)) redirect("/admin/replies");
  const cur = await getThread(id);
  if (!cur) redirect("/admin/replies");
  const access = await accessFor(cur.thread, id, token || null, "edit");
  if (!access.ok) back(id, token, { error: access.reason });
  return { id, token, access };
}

function failure(err: unknown): string {
  if (err instanceof ReplyActionError) return err.message;
  console.error("[inbound] admin action failed:", err instanceof Error ? err.name : "error");
  return "Something went wrong. Nothing was sent.";
}

export async function saveDraftAction(fd: FormData) {
  const { id, token } = await editorAccess(fd);
  let error = "";
  try {
    await saveDraft(id, str(fd, "text"));
  } catch (err) {
    error = failure(err);
  }
  back(id, token, error ? { error } : { done: "saved" });
}

export async function sendFromEditorAction(fd: FormData) {
  const { id, token, access } = await editorAccess(fd);
  let error = "";
  try {
    await sendReply(id, { text: str(fd, "text"), nonce: access.ok && access.via === "token" ? access.token.n : undefined });
  } catch (err) {
    error = failure(err);
  }
  back(id, error ? token : "", error ? { error } : { done: "sent" });
}

export async function regenerateAction(fd: FormData) {
  const { id, token } = await editorAccess(fd);
  let error = "";
  try {
    const t = await prepareDraft(id, { notify: false });
    if (t?.draft?.status !== "ready") error = t?.draft?.error || "No draft was written.";
  } catch (err) {
    error = failure(err);
  }
  back(id, token, error ? { error } : { done: "redrafted" });
}

export async function dismissAction(fd: FormData) {
  const { id, token } = await editorAccess(fd);
  let error = "";
  try {
    await setThreadStatus(id, "dismissed");
  } catch (err) {
    error = failure(err);
  }
  back(id, token, error ? { error } : { done: "dismissed" });
}

export async function reopenAction(fd: FormData) {
  const { id, token } = await editorAccess(fd);
  let error = "";
  try {
    await setThreadStatus(id, "pending");
  } catch (err) {
    error = failure(err);
  }
  back(id, token, error ? { error } : { done: "reopened" });
}

/** The confirm page's Send button: sends exactly the draft revision the approve link was made for. */
export async function approveAction(fd: FormData) {
  const id = str(fd, "id");
  const token = str(fd, "t");
  if (!isThreadId(id)) redirect("/admin/replies");
  const check = verifyActionToken(token, "approve");
  const q = (p: Record<string, string>) => `/admin/replies/${id}/approve?${new URLSearchParams({ t: token, ...p }).toString()}`;
  if (!check.ok || check.token.th !== id) redirect(q({ error: check.ok ? "This link isn't valid." : check.error === "expired" ? "This link has expired." : "This link isn't valid." }));
  let error = "";
  try {
    await sendReply(id, { expectRev: check.token.r, nonce: check.token.n });
  } catch (err) {
    error = failure(err);
  }
  redirect(error ? q({ error }) : q({ done: "sent" }));
}
