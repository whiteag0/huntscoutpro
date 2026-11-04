// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { coveragePhrase, summarizeSpans } from "@/lib/coverage";

test("most common span, with the full range alongside", () => {
  const s = summarizeSpans({ co: [2022, 2026], id: [2022, 2026], wa: [2020, 2026], nv: [2022, 2025], xx: null });
  assert.deepEqual(s, { common: [2022, 2026], count: 2, total: 4, overall: [2020, 2026] });
  assert.equal(coveragePhrase("draw results", s!), "2 of 4 states have draw results for 2022–2026 (2020–2026 across all states)");
});

test("ties go to the wider span; every state matching says so", () => {
  assert.deepEqual(summarizeSpans({ a: [2023, 2026], b: [2022, 2026] })?.common, [2022, 2026]);
  const all = summarizeSpans({ a: [2022, 2026], b: [2022, 2026] })!;
  assert.equal(coveragePhrase("harvest results", all), "every state has harvest results for 2022–2026");
  assert.equal(summarizeSpans({}), null);
});
