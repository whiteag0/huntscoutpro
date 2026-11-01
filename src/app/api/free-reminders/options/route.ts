import { NextResponse } from "next/server";
import { freeReminderOptions } from "@/lib/free-reminders-options";

// States and species the free reminder form offers. Built from the agency
// files at build time; the homepage card loads it when it opens.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({ states: await freeReminderOptions() });
}
