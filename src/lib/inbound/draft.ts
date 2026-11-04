// Runs the reply model on an assembled context. The model only ever returns text:
// it has no tools, so it can't send mail or change who a reply goes to. Recipients,
// subject and threading come from the stored thread when Adam approves.

import { INBOUND_LIMITS } from "@/lib/inbound/config";
import { NOTE_MARKER, REPLY_SYSTEM_PROMPT } from "@/lib/inbound/reply-prompt";

/** generateText-compatible call, injectable so tests never reach a real model. */
export type GenerateFn = (args: {
  model: string;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
  maxRetries: number;
  timeout: number;
}) => Promise<{ text: string }>;

export interface DraftResult {
  ok: boolean;
  text: string;
  note: string;
  model: string;
  error?: string;
}

/** Split the model output into the email body and the private note; strip things that don't belong in a body. */
export function parseModelOutput(raw: string): { text: string; note: string } {
  const out = (raw || "").replace(/\r\n?/g, "\n");
  const at = out.indexOf(NOTE_MARKER);
  let body = at >= 0 ? out.slice(0, at) : out;
  const note = at >= 0 ? out.slice(at + NOTE_MARKER.length).trim() : "";
  body = body
    .replace(/^\s*(subject|re)\s*:[^\n]*\n+/i, "")
    .replace(/^\s*(draft|reply|email)\s*:\s*\n+/i, "")
    .trim();
  return { text: body.slice(0, INBOUND_LIMITS.draftChars), note: note.slice(0, 1200) };
}

export async function draftReply(prompt: string, opts: { model: string; generate: GenerateFn }): Promise<DraftResult> {
  try {
    const res = await opts.generate({
      model: opts.model,
      instructions: REPLY_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: INBOUND_LIMITS.maxOutputTokens,
      maxRetries: 1,
      timeout: INBOUND_LIMITS.modelTimeoutMs,
    });
    const { text, note } = parseModelOutput(res.text);
    if (text.length < 20) return { ok: false, text: "", note: "", model: opts.model, error: "The model returned an empty draft." };
    return { ok: true, text, note, model: opts.model };
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    // Only the error class and a short message: never the prompt or customer text.
    const msg = err instanceof Error ? err.message.split("\n")[0].slice(0, 160) : "unknown";
    return { ok: false, text: "", note: "", model: opts.model, error: `${name}: ${msg}` };
  }
}

/** The real model call: Vercel AI Gateway (OIDC on Vercel, AI_GATEWAY_API_KEY locally). */
export const gatewayGenerate: GenerateFn = async (args) => {
  const { generateText } = await import("ai");
  const res = await generateText({
    model: args.model,
    instructions: args.instructions,
    prompt: args.prompt,
    maxOutputTokens: args.maxOutputTokens,
    maxRetries: args.maxRetries,
    timeout: args.timeout,
  });
  return { text: res.text };
};
