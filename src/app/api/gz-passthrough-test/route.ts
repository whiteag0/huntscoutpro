// TEMPORARY (preview only): checks that Vercel passes a pre-gzipped >4.5 MB table through. Remove before merge.
import { readTableGzip } from "@/lib/agency";

export const dynamic = "force-dynamic";

export async function GET() {
  const gz = await readTableGzip("colorado", "draw", "elk");
  return new Response(new Uint8Array(gz!), {
    headers: { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8", "Content-Encoding": "gzip" },
  });
}
