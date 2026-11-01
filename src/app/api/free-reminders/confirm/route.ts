import { NextRequest } from "next/server";
import { SPECIES_LABELS, type Species } from "@/data/types";
import { getStateData } from "@/lib/agency";
import { formatDate, todayIso } from "@/lib/agency-format";
import { isLocalStore, isStoreConfigured } from "@/lib/blob-store";
import { SITE, esc } from "@/lib/emails/onboarding";
import { FREE_UPSELL } from "@/lib/emails/free-reminders";
import { freeSubscriberAsMember } from "@/lib/free-reminders-digest";
import { freeLink, freePage, tryAgainPage } from "@/lib/free-reminders-page";
import { confirmSubscription, type FreeSubscriber } from "@/lib/free-reminders-store";
import { freeUnsubscribeUrl, verifyConfirmToken } from "@/lib/free-reminders-token";
import { nextReminderDates } from "@/lib/reminders";

// GET /api/free-reminders/confirm?id=&n=&x=&t= : the link in the confirmation email.

export const dynamic = "force-dynamic";

async function subscribedBody(s: FreeSubscriber, base: string): Promise<string> {
  const st = await getStateData(s.state);
  const name = st?.name || s.state;
  const what = s.species.length ? s.species.map((x) => SPECIES_LABELS[x as Species] ?? x).join(", ") : "every species";
  const next = st ? nextReminderDates(freeSubscriberAsMember(s), [st], todayIso())[0]?.next : null;
  const nextLine = next
    ? `<p>The next date we have from ${esc(st!.agency.name)}: <b>${esc(next.label)}</b>, ${next.start && next.start > todayIso() ? `opens ${esc(formatDate(next.start))}, ` : ""}closes ${esc(formatDate(next.end))}.</p>`
    : `<p>${esc(st?.agency.name || "The agency")} hasn't published an upcoming application date that we have yet. We'll email you once one is 14 days out.</p>`;
  return `<p>We'll email <b>${esc(s.email)}</b> about ${esc(name)} application dates for ${esc(what)}: 14 days and 3 days before each deadline, and on the day a window opens.</p>
${nextLine}
<p>See every date on the ${freeLink(`${SITE}/calendar`, "application calendar")}. ${esc(FREE_UPSELL)}: ${freeLink(`${SITE}/pricing`, "see what Pro includes")}.</p>
<p style="font-size:14px;color:#555;">Changed your mind? ${freeLink(freeUnsubscribeUrl(s.id, base), "Unsubscribe")} at any time.</p>`;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const check = verifyConfirmToken({ id: q.get("id"), n: q.get("n"), x: q.get("x"), t: q.get("t") });
  if (check === "invalid") {
    return freePage(
      400,
      "This link isn't valid",
      `<p>We couldn't read this confirmation link. It may have been cut off when it was copied.</p>
<p>You can sign up again on the ${freeLink(`${SITE}/calendar#free-reminders`, "application calendar")}.</p>`
    );
  }
  if (check === "expired") {
    return freePage(
      410,
      "This link has expired",
      `<p>Confirmation links work for 7 days. Sign up again on the ${freeLink(`${SITE}/calendar#free-reminders`, "application calendar")} and we'll send a fresh one.</p>`
    );
  }
  if (!isStoreConfigured()) return tryAgainPage();

  const base = isLocalStore() ? req.nextUrl.origin : SITE;
  let outcome;
  try {
    outcome = await confirmSubscription(q.get("id")!, q.get("n")!);
  } catch (err) {
    console.error("free-reminders: confirm failed:", err);
    return tryAgainPage();
  }

  switch (outcome.kind) {
    case "confirmed":
      console.log(`free-reminders: confirmed (${outcome.subscriber.id.slice(0, 8)}, ${outcome.subscriber.state})`);
      return freePage(200, "You're signed up", await subscribedBody(outcome.subscriber, base));
    case "already":
      return freePage(200, "You're already signed up", await subscribedBody(outcome.subscriber, base));
    case "stale":
      return freePage(
        409,
        "This link was replaced",
        `<p>There's a newer confirmation email for this address, or reminders were turned off after this one was sent. Use the link in the most recent email, or sign up again on the ${freeLink(`${SITE}/calendar#free-reminders`, "application calendar")}.</p>`
      );
    default:
      return freePage(
        404,
        "We couldn't find that signup",
        `<p>Sign up again on the ${freeLink(`${SITE}/calendar#free-reminders`, "application calendar")} and we'll send a fresh link.</p>`
      );
  }
}
