import "server-only";
// Server side of the personal scouting report: load the agency data a member's
// answers need, build the report (src/lib/report-core.ts), render the PDF
// (src/lib/report-pdf.tsx) and email it (src/lib/emails/report.ts).
import { stripe } from "@/lib/stripe";
import { AGENCY_FILES } from "@/data/agency/index.generated";
import type { Species } from "@/data/agency/schema";
import { getAllStateData, getSpeciesData } from "@/lib/agency";
import { todayIso } from "@/lib/agency-format";
import { buildReport, selectCombos, type ReportStateInput, type ReportTables, type ScoutingReport } from "@/lib/report-core";
import { renderReportPdf } from "@/lib/report-pdf";
import { reportEmail } from "@/lib/emails/report";
import { EmailSendError, sendEmail } from "@/lib/onboarding";
import type { HuntingPreferences } from "@/lib/preferences-schema";
import type { PointsMap } from "@/lib/points-schema";
import {
  REPORT_EMAIL_ID_KEY,
  REPORT_ERROR_KEY,
  REPORT_HASH_KEY,
  REPORT_SENT_KEY,
  reportFilename,
  reportIdempotencyKey,
  reportInputHash,
} from "@/lib/report-trigger";

export interface GeneratedReport {
  report: ScoutingReport;
  pdf: Buffer;
  pages: number;
  timings: { dataMs: number; buildMs: number; pdfMs: number };
}

async function reportStates(): Promise<ReportStateInput[]> {
  const states = await getAllStateData();
  return states.map((data) => ({
    data,
    drawSpecies: AGENCY_FILES[data.slug]?.draw ?? [],
    harvestSpecies: AGENCY_FILES[data.slug]?.harvest ?? [],
  }));
}

/** Build the report model (no PDF). */
export async function buildMemberReport(opts: { name?: string | null; prefs: HuntingPreferences; savedPoints?: PointsMap; today?: string }): Promise<{ report: ScoutingReport; dataMs: number; buildMs: number }> {
  const t0 = performance.now();
  const states = await reportStates();
  const { deep } = selectCombos(opts.prefs, states);
  const loaded = new Map<string, ReportTables>();
  await Promise.all(
    deep.map(async (k) => {
      const t = await getSpeciesData(k.slug, k.species);
      loaded.set(`${k.slug}|${k.species}`, t);
    })
  );
  const t1 = performance.now();
  const report = buildReport({
    name: opts.name,
    prefs: opts.prefs,
    savedPoints: opts.savedPoints,
    today: opts.today || todayIso(),
    states,
    tables: (slug: string, species: Species) => loaded.get(`${slug}|${species}`) ?? { draw: [], harvest: [] },
  });
  return { report, dataMs: Math.round(t1 - t0), buildMs: Math.round(performance.now() - t1) };
}

function pageCount(pdf: Buffer): number {
  const m = pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}

/** Build the report and render its PDF. */
export async function generateMemberReport(opts: { name?: string | null; prefs: HuntingPreferences; savedPoints?: PointsMap; today?: string }): Promise<GeneratedReport> {
  const { report, dataMs, buildMs } = await buildMemberReport(opts);
  const t = performance.now();
  const pdf = await renderReportPdf(report);
  return { report, pdf, pages: pageCount(pdf), timings: { dataMs, buildMs, pdfMs: Math.round(performance.now() - t) } };
}

export interface ReportSendResult {
  status: "sent" | "duplicate" | "skipped-no-email-service" | "failed";
  emailId?: string;
  pages?: number;
  bytes?: number;
  timings?: GeneratedReport["timings"];
  error?: string;
}

/**
 * Generate and email a member's report, then record it on their PaymentIntent.
 * Never throws: a failure is logged and stamped (REPORT_ERROR_KEY) without a sent
 * marker, so the next save of the form (or an admin resend) tries again.
 */
export async function sendMemberReport(opts: {
  to: string;
  name?: string | null;
  prefs: HuntingPreferences;
  savedPoints?: PointsMap;
  paymentIntentId?: string | null;
  /** The PaymentIntent metadata as it was before this send (for the idempotency key). */
  previousMetadata?: Record<string, string | undefined>;
  force?: boolean;
  /** Send a [TEST] copy (admin QA); never stamps the member's record. */
  test?: boolean;
}): Promise<ReportSendResult> {
  const { to, prefs, paymentIntentId, test } = opts;
  const hash = reportInputHash(prefs, opts.savedPoints);
  const stamp = async (metadata: Record<string, string>) => {
    if (!stripe || !paymentIntentId || test) return;
    await stripe.paymentIntents.update(paymentIntentId, { metadata }).catch((err) => console.error(`Could not stamp report status on ${paymentIntentId}:`, err));
  };
  let generated: GeneratedReport | null = null;
  try {
    generated = await generateMemberReport({ name: opts.name, prefs, savedPoints: opts.savedPoints });
    if (!process.env.RESEND_API_KEY) {
      // Local and preview environments: the report is built (so the path is exercised) but not sent.
      console.warn(
        `RESEND_API_KEY not set; personal report built (${generated.pages} pages, ${generated.pdf.length} bytes; data ${generated.timings.dataMs} ms, build ${generated.timings.buildMs} ms, pdf ${generated.timings.pdfMs} ms) but not sent`
      );
      return { status: "skipped-no-email-service", pages: generated.pages, bytes: generated.pdf.length, timings: generated.timings };
    }
    const email = reportEmail({ report: generated.report, name: opts.name, pages: generated.pages, test });
    const memberId = paymentIntentId || to;
    const key = reportIdempotencyKey(test ? `test|${memberId}` : memberId, hash, opts.previousMetadata?.[REPORT_SENT_KEY], opts.force || test);
    let emailId: string | null;
    try {
      emailId = await sendEmail({
        to,
        email,
        idempotencyKey: key,
        attachments: [{ filename: reportFilename(opts.name ?? generated.report.name), content: generated.pdf.toString("base64") }],
        timeoutMs: 30000,
        bcc: !test,
      });
    } catch (err) {
      // Same key, different bytes: a send with this key already went out (e.g. a double submit
      // racing an agency data deploy). Don't send twice; the first request stamps the record.
      // Also when the other request still holds the key after sendEmail's retries (concurrent_idempotent_requests).
      if (err instanceof EmailSendError && err.status === 409 && (err.code === "invalid_idempotent_request" || err.code === "concurrent_idempotent_requests")) {
        console.warn(`Report for ${paymentIntentId || "member"} already sent under ${key}`);
        return { status: "duplicate", pages: generated.pages, bytes: generated.pdf.length, timings: generated.timings };
      }
      throw err;
    }
    await stamp({
      [REPORT_SENT_KEY]: new Date().toISOString(),
      [REPORT_HASH_KEY]: hash,
      [REPORT_EMAIL_ID_KEY]: emailId && emailId !== "sent" ? emailId : "",
      [REPORT_ERROR_KEY]: "",
    });
    console.log(
      `Personal report sent (${generated.pages} pages, ${generated.pdf.length} bytes; data ${generated.timings.dataMs} ms, build ${generated.timings.buildMs} ms, pdf ${generated.timings.pdfMs} ms)`
    );
    return { status: "sent", emailId: emailId || undefined, pages: generated.pages, bytes: generated.pdf.length, timings: generated.timings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Personal report failed for ${paymentIntentId || "member without a purchase record"}:`, err);
    await stamp({ [REPORT_ERROR_KEY]: `${new Date().toISOString()} ${msg}`.slice(0, 480) });
    return { status: "failed", error: msg.slice(0, 300), ...(generated ? { pages: generated.pages, bytes: generated.pdf.length, timings: generated.timings } : {}) };
  }
}
