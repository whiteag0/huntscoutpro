import { NextRequest } from "next/server";
import { getStateData } from "@/lib/agency";
import { isStoreConfigured } from "@/lib/blob-store";
import { SITE, esc } from "@/lib/emails/onboarding";
import { freeLink, freePage, tryAgainPage } from "@/lib/free-reminders-page";
import { unsubscribeSubscriber } from "@/lib/free-reminders-store";
import { verifyUnsubscribeToken } from "@/lib/free-reminders-token";

// One-click unsubscribe from free deadline reminders.
// GET  = the link in the email footer.
// POST = RFC 8058 List-Unsubscribe-Post from the mail client (body "List-Unsubscribe=One-Click").

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const id = req.nextUrl.searchParams.get("id");
  const token = req.nextUrl.searchParams.get("t");
  if (!verifyUnsubscribeToken(id, token)) {
    return freePage(
      400,
      "This link isn't valid",
      `<p>We couldn't read this unsubscribe link. It may have been cut off when it was copied.</p>
<p>Forward one of the reminder emails to ${freeLink("mailto:support@huntscoutpro.com", "support@huntscoutpro.com")} and we'll stop them for you.</p>`
    );
  }
  if (!isStoreConfigured()) return tryAgainPage();

  let outcome;
  try {
    outcome = await unsubscribeSubscriber(id!);
  } catch (err) {
    console.error("free-reminders: unsubscribe failed:", err);
    return tryAgainPage();
  }
  if (outcome.kind === "missing") {
    return freePage(
      200,
      "You're unsubscribed",
      `<p>There are no free reminders on file for this address, so nothing more will be sent.</p>`
    );
  }
  const st = await getStateData(outcome.subscriber.state);
  console.log(`free-reminders: unsubscribed (${outcome.subscriber.id.slice(0, 8)})`);
  return freePage(
    200,
    "You're unsubscribed",
    `<p>We won't send ${esc(st?.name || "")} deadline reminders to <b>${esc(outcome.subscriber.email)}</b> any more.</p>
<p>Changed your mind? Sign up again on the ${freeLink(`${SITE}/calendar#free-reminders`, "application calendar")}.</p>`
  );
}

export const GET = handle;
export const POST = handle;
