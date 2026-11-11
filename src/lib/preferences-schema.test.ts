import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, joinStateUnits, residencyFor, splitStateUnits, withTopState } from "@/lib/preferences-schema";
import { matchUnits, type MemberState } from "@/lib/report-input";

const CO = { slug: "colorado", name: "Colorado", abbrev: "CO", unitTerm: "GMU" };
const WY = { slug: "wyoming", name: "Wyoming", abbrev: "WY", unitTerm: "Hunt Area" };

test("withTopState moves the top pick first and keeps the rest in order", () => {
  assert.deepEqual(withTopState(["utah", "colorado", "wyoming"], "wyoming"), ["wyoming", "utah", "colorado"]);
  assert.deepEqual(withTopState(["utah", "colorado"], "idaho"), ["utah", "colorado"]);
});

test("residencyFor: home state decides, else the member's answer", () => {
  assert.equal(residencyFor("CO", [CO], ""), "resident");
  assert.equal(residencyFor("CO", [CO, WY], ""), "both");
  assert.equal(residencyFor("TX", [CO, WY], "resident"), "nonresident");
  assert.equal(residencyFor("", [CO], "nonresident"), "nonresident");
  assert.equal(residencyFor("CO", [], "both"), "both");
});

test("joinStateUnits / splitStateUnits round trip, older free text kept as other", () => {
  const joined = joinStateUnits(
    [
      { name: "Colorado", unitTerm: "GMU", text: "61, 62" },
      { name: "Wyoming", unitTerm: "Hunt Area", text: " 7 ;  9 " },
      { name: "Utah", unitTerm: "Hunt Unit", text: "" },
    ],
    "not sure about Idaho yet"
  );
  assert.equal(joined, "Colorado GMU: 61, 62; Wyoming Hunt Area: 7 9; not sure about Idaho yet");
  assert.deepEqual(splitStateUnits(joined, [CO, WY]), { byState: { colorado: "61, 62", wyoming: "7 9" }, other: "not sure about Idaho yet" });
  assert.deepEqual(splitStateUnits("CO GMU 61 and 62", [CO, WY]), { byState: {}, other: "CO GMU 61 and 62" });
});

test("joinStateUnits stays inside the stored limit, dropping whole entries", () => {
  const long = Array.from({ length: 8 }, (_, i) => ({ name: `State${i}`, unitTerm: "GMU", text: "1".repeat(LIMITS.unitsPerState + 50) }));
  const out = joinStateUnits(long);
  assert.ok(out.length <= LIMITS.units);
  assert.ok(out.split("; ").every((p) => /^State\d GMU: 1+$/.test(p)));
});

test("the joined answer ties each state's units to that state in the report", () => {
  const states: MemberState[] = [CO, WY];
  const pub: Record<string, string[]> = { colorado: ["61", "62", "7"], wyoming: ["7", "61"] };
  const got = matchUnits(joinStateUnits([{ ...CO, text: "61, 62" }, { ...WY, text: "7" }]), states, (s) => pub[s] || []);
  assert.deepEqual(got.byState, { colorado: ["61", "62"], wyoming: ["7"] });
  assert.deepEqual(got.unmatched, []);
});
