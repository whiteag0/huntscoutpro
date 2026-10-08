"use client";

// The launch promo this timer counted down to ended 2026-04-30 and there is
// no current deadline. It intentionally renders nothing so no page shows a
// fake or expired deadline. Kept as an export only because src/app/page.tsx
// still imports it; remove the usage there, then delete this file.
export function CountdownTimer() {
  return null;
}
