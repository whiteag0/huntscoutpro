// Run with: npm test. Uses the local-folder backend in a temp dir; nothing touches the network.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PlannedHunt } from "@/lib/planner-schema";

let dir = "";
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "planner-store-test-"));
  process.env.PLANNER_LOCAL_DIR = dir;
  delete process.env.BLOB_STORE_ID;
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const store = () => import("@/lib/planner-store");
const hunt = (id: string, notes = ""): PlannedHunt => ({ id, state: "Utah", species: "elk", unit: "1", season: "", preferencePointsNeeded: 0, preferencePointsOwned: 0, applicationDeadline: "", seasonDates: "", status: "planning", notes });

test("path is a hash of the normalized email", async () => {
  const { plannerPath } = await store();
  assert.equal(plannerPath(" Hunter@Example.com "), plannerPath("hunter@example.com"));
  assert.match(plannerPath("hunter@example.com"), /^planner\/[0-9a-f]{64}\.json$/);
  assert.ok(!plannerPath("hunter@example.com").includes("hunter"));
});

test("read empty, write v1, stale write is refused with the current doc", async () => {
  const { readPlanner, writePlanner, PlannerConflictError, plannerPath } = await store();
  const email = "a@example.com";
  const empty = await readPlanner(email);
  assert.equal(empty.version, 0);
  assert.deepEqual(empty.data.hunts, []);

  const v1 = await writePlanner(email, { hunts: [hunt("h1")] }, 0);
  assert.equal(v1.version, 1);
  const v2 = await writePlanner(email, { hunts: [hunt("h1", "edited")] }, 1);
  assert.equal(v2.version, 2);

  await assert.rejects(
    () => writePlanner(email, { hunts: [] }, 1),
    (err: unknown) => err instanceof PlannerConflictError && err.current.version === 2 && err.current.data.hunts[0].notes === "edited"
  );
  const raw = JSON.parse(await readFile(path.join(dir, plannerPath(email)), "utf8"));
  assert.equal(raw.version, 2);
  assert.equal(raw.schema, 2);
});

test("a schema-1 document already in storage loads unchanged and is written back as schema 2", async () => {
  const { readPlanner, writePlanner, plannerPath } = await store();
  const email = "v1@example.com";
  const v1Doc = {
    schema: 1,
    version: 7,
    updatedAt: "2026-10-31T18:00:00.000Z",
    data: {
      hunts: [{ ...hunt("h1", "glassing knob above the creek"), status: "applied", preferencePointsOwned: 4 }],
      budget: [{ id: "b1", huntId: "h1", category: "Travel", description: "Gas", amount: 120 }],
      checklist: [{ id: "c1", category: "Safety", label: "First aid kit", checked: true, custom: false }],
      deleted: ["x1"],
    },
  };
  const file = path.join(dir, plannerPath(email));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(v1Doc), "utf8");
  const doc = await readPlanner(email);
  assert.equal(doc.schema, 2);
  assert.equal(doc.version, 7);
  assert.deepEqual(doc.data, v1Doc.data);
  const next = await writePlanner(email, doc.data, 7);
  assert.equal(next.version, 8);
  const raw = JSON.parse(await readFile(file, "utf8"));
  assert.equal(raw.schema, 2);
  assert.deepEqual(raw.data, v1Doc.data);
});

test("invalid data and oversized planners are rejected without writing", async () => {
  const { writePlanner, readPlanner, PlannerInvalidError, PlannerTooLargeError } = await store();
  const email = "b@example.com";
  await assert.rejects(() => writePlanner(email, "nope", 0), PlannerInvalidError);
  await assert.rejects(() => writePlanner(email, { hunts: "nope" }, 0), PlannerInvalidError);
  // Every list at its limit with long text: well over the cap.
  const agency = (i: number) => ({
    stateSlug: "utah",
    huntCode: `EB${i}`,
    drawYear: 2026,
    units: Array.from({ length: 60 }, (_, u) => `Unit ${u} ${"x".repeat(30)}`),
    description: "d".repeat(600),
    oddsNote: "o".repeat(600),
    drawSummary: "s".repeat(900),
    residencyNote: "r".repeat(900),
    otcSummary: "c".repeat(900),
  });
  const big = {
    hunts: Array.from({ length: 150 }, (_, i) => ({ ...hunt(`h${i}`, "n".repeat(2000)), agency: agency(i) })),
    budget: Array.from({ length: 600 }, (_, i) => ({ id: `b${i}`, huntId: "", category: "Other", description: "b".repeat(300), amount: 1 })),
  };
  await assert.rejects(() => writePlanner(email, big, 0), PlannerTooLargeError);
  assert.equal((await readPlanner(email)).version, 0);
});

test("concurrent writes from the same version: exactly one wins", async () => {
  const { writePlanner, PlannerConflictError } = await store();
  const email = "c@example.com";
  const results = await Promise.allSettled([writePlanner(email, { hunts: [hunt("x")] }, 0), writePlanner(email, { hunts: [hunt("y")] }, 0)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(lost.reason instanceof PlannerConflictError);
});

test("updatePlanner retries on conflict and can decline to write", async () => {
  const { updatePlanner, writePlanner, readPlanner } = await store();
  const email = "d@example.com";
  await writePlanner(email, { hunts: [hunt("h1")] }, 0);
  let calls = 0;
  const { doc } = await updatePlanner(email, (data) => {
    calls++;
    return { data: { ...data, hunts: [...data.hunts, hunt(`added${calls}`)] }, result: null };
  });
  assert.equal(doc.version, 2);
  assert.deepEqual(doc.data.hunts.map((h) => h.id), ["h1", "added1"]);
  const same = await updatePlanner(email, () => ({ data: null, result: "dup" }));
  assert.equal(same.result, "dup");
  assert.equal((await readPlanner(email)).version, 2);
});

test("an unreadable stored document is never overwritten", async () => {
  const { readPlanner, writePlanner, plannerPath, PlannerUnavailableError } = await store();
  const email = "e@example.com";
  await writePlanner(email, { hunts: [] }, 0);
  await writeFile(path.join(dir, plannerPath(email)), "{corrupt", "utf8");
  await assert.rejects(() => readPlanner(email), PlannerUnavailableError);
  await assert.rejects(() => writePlanner(email, { hunts: [] }, 1), PlannerUnavailableError);
  assert.equal(await readFile(path.join(dir, plannerPath(email)), "utf8"), "{corrupt");
});
