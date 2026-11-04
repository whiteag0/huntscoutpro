# Customer reply drafts (inbound email)

When a customer replies to one of our emails, the site drafts an answer with AI and emails it to you to approve. **Nothing goes to a customer until you press Send.**

```
customer replies ──> replies@in.huntscoutpro.com (Resend Inbound)
                       └─ webhook ──> /api/inbound/email   (signature checked; auto-replies, bounces, lists, spam, our own mail filtered)
                                       ├─ thread saved (private Blob store)
                                       ├─ AI draft (Claude Sonnet 5.5 via Vercel AI Gateway), using their membership, saved
                                       │  preferences and our agency data for the states/species/units they mention
                                       └─ "Reply ready: <subject>" email to you
                                            ├─ Approve & send ─> confirmation page ─> [Send reply] ─> sent from adam@ in the same thread
                                            └─ Edit ─> editor ─> [Approve & send]
```

All threads are at **https://www.huntscoutpro.com/admin/replies** (sign in with Google as the super admin).

Until the steps below are done the feature is off: emails keep Reply-To adam@huntscoutpro.com and the webhook answers 503.

## One-time setup (about 15 minutes)

### 1. Resend: receive on a subdomain

Your Google Workspace mail for huntscoutpro.com stays as is. Receiving uses a separate subdomain so its MX record never touches Gmail.

1. Resend dashboard > **Domains** > **Add domain** > `in.huntscoutpro.com`, region US.
2. On the domain page, turn on **Receiving**. Resend shows one **MX** record (host `in`, a value like `inbound-smtp.us-east-1.amazonaws.com` or `receive.forge.rmta.net`, and a priority). Copy it exactly as shown.
3. Add that MX record at your DNS provider for `in.huntscoutpro.com`. You can turn **Enable Sending** off for this subdomain (then skip its SPF records; keep the DKIM record and the MX record).
4. Click **I've added the record** and wait for the receiving record to show **Verified**.

The receiving address is then `replies@in.huntscoutpro.com` (any name works at that subdomain).

To try it before DNS, Resend's managed `<id>.resend.app` address works too: Emails > Receiving > ⋯ > **Receiving address**, then use `replies@<id>.resend.app` below.

### 2. Resend: webhook

1. Resend dashboard > **Webhooks** > **Add endpoint**.
2. URL: `https://www.huntscoutpro.com/api/inbound/email`
3. Event: **email.received** only.
4. Open the new webhook and copy its **Signing secret** (starts with `whsec_`).

### 3. Vercel: AI Gateway

Vercel > the HuntScout project's team > **AI Gateway** > enable it (add a payment method or credits if asked). The site authenticates with the deployment's OIDC token, so there is no API key to copy. Drafts cost a fraction of a cent to a few cents each and are capped at 100 a day.

### 4. Vercel: environment variables (Production)

| Name | Value |
| --- | --- |
| `EMAIL_INBOUND_ADDRESS` | `replies@in.huntscoutpro.com` |
| `RESEND_INBOUND_WEBHOOK_SECRET` | the `whsec_...` secret from step 2 |
| `ADMIN_EMAIL` | where "Reply ready" emails go (optional; default `adam@huntscoutpro.com`) |
| `REPLY_MODEL` | optional; default `anthropic/claude-sonnet-5.5` |

Already set and reused: `RESEND_API_KEY`, `AUTH_SECRET` (signs the approve/edit links), `ONBOARDING_BCC` (copied on every sent reply), the Blob store.

Redeploy (Deployments > ⋯ > Redeploy) so the variables take effect.

### 5. Test it

1. Send yourself the onboarding emails from **My Account > Admin: onboarding emails**. Their Reply-To is now the receiving address.
2. Reply to one from a personal address (not `@huntscoutpro.com`; mail from our own domain is ignored).
3. Within a minute you get **Reply ready: ...** at ADMIN_EMAIL. Tap **Approve & send**, then **Send reply**.

## How it behaves

- **Approval.** "Approve & send" opens a confirmation page; only its Send button sends (mail scanners that open links can't send anything). The link works once, only for that exact draft, and expires after 3 days. If the draft was edited or the customer wrote again, the old link refuses and points you to the latest draft. Edit links last 7 days. Signed-in admins can always use /admin/replies.
- **Sending.** From `Adam White, HuntScout Pro <adam@huntscoutpro.com>`, to the customer's From address only, subject `Re: ...`, with In-Reply-To/References so it threads, your signature, their message quoted, Reply-To the receiving address, BCC `ONBOARDING_BCC`. A follow-up from the customer lands in the same thread with a fresh draft.
- **What the AI is told.** The conversation, membership status, saved preferences, and agency facts (key dates, fees, general seasons, and the latest draw results for any unit they name) with their sources. It's told to state only those facts, say when it doesn't know, never promise refunds or changes, and sign as Adam. It has no tools: it can't send mail or pick recipients. A short "Note for you" flags refund requests, unanswered questions and anything to check.
- **Filtered out (no draft, no email to you).** Mail that wasn't sent to the receiving domain (Resend posts every email the account receives to this webhook), auto-replies and out-of-office, bounces, mailing lists/bulk, no-reply senders, mail from huntscoutpro.com, and mail that fails DMARC or SPF+DKIM. They're listed under **Filtered out** on /admin/replies; **Reopen** one to answer it.
- **If the AI fails** (gateway down, daily draft limit reached) you still get the email, titled **Needs a reply: ...**, with a link to write the reply yourself. A sender over the 8-a-day limit gets no draft and no email to you; their messages still wait on /admin/replies.
- **Privacy.** Customer emails are sent to the AI model (Anthropic, through Vercel AI Gateway) to write drafts. Clarity, ad tags and Vercel Analytics don't run on /admin pages, whose links carry the signed tokens.
- **Limits.** 8 drafts per sender a day, 100 drafts and 60 approval emails a day in total. Webhook signatures older than 5 minutes are refused. Logs record ids and reasons only, never addresses or message text.

## Turning it off

Delete `RESEND_INBOUND_WEBHOOK_SECRET` (or `EMAIL_INBOUND_ADDRESS`) in Vercel and redeploy. New emails then carry Reply-To adam@huntscoutpro.com again. Emails already sent still say Reply-To the receiving address, so customers can keep replying there: those replies only show in Resend (Emails > Receiving). To catch them, add a forward to adam@ in Resend for that address, or keep the feature on.

## Code

`src/lib/inbound/` (config, Svix verification, parsing and filters, thread store, context, prompt in `reply-prompt.ts`, draft, signed links, service), `src/app/api/inbound/email/route.ts`, `src/app/admin/replies/`, `src/lib/emails/replies.ts`. Tests: `src/lib/inbound.test.ts`.

Local QA without Resend or a model: set `RESEND_API_BASE` to a mock server and `REPLY_MODEL_MOCK=1` (both ignored on Vercel; the mock model is also ignored in production builds).
