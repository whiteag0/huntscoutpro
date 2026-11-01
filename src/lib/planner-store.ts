import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeEmail } from "@/lib/entitlement";
import {
  MAX_PLANNER_BYTES,
  PLANNER_SCHEMA,
  docBytes,
  emptyDoc,
  sanitizePlannerData,
  sanitizePlannerDoc,
  type PlannerData,
  type PlannerDoc,
} from "@/lib/planner-schema";

// Each member's planner is one private JSON document:
//   planner/<sha256(normalized email)>.json
// in the private Vercel Blob store (BLOB_STORE_ID, OIDC auth on Vercel). With no
// store configured outside production, documents go to a local folder instead
// so the feature works in `next dev` / `next start`. In production without a
// store, the planner API answers 503 and the page keeps the browser copy.
//
// Concurrency: every write names the version it was based on. A write based on
// an older version is refused (PlannerConflictError -> HTTP 409) and the caller
// merges. Blob writes are also conditional on the blob's ETag, so two writes
// racing between read and write can't both win.

export class PlannerConflictError extends Error {
  current: PlannerDoc;
  constructor(current: PlannerDoc) {
    super("The planner changed since it was loaded.");
    this.name = "PlannerConflictError";
    this.current = current;
  }
}

export class PlannerTooLargeError extends Error {
  bytes: number;
  constructor(bytes: number) {
    super(`Planner is ${Math.ceil(bytes / 1024)} KB; the limit is ${MAX_PLANNER_BYTES / 1024} KB.`);
    this.name = "PlannerTooLargeError";
    this.bytes = bytes;
  }
}

export class PlannerUnavailableError extends Error {
  constructor(message = "Planner storage isn't configured.") {
    super(message);
    this.name = "PlannerUnavailableError";
  }
}

export class PlannerInvalidError extends Error {
  constructor(message = "That isn't planner data.") {
    super(message);
    this.name = "PlannerInvalidError";
  }
}

export type PlannerStorage = "blob" | "local";

export function plannerStorage(): PlannerStorage | null {
  if (process.env.BLOB_STORE_ID) return "blob";
  if (process.env.NODE_ENV !== "production") return "local";
  return null;
}

/** Blob pathname for a member. The email itself never appears in storage. */
export function plannerPath(email: string): string {
  return `planner/${createHash("sha256").update(normalizeEmail(email)).digest("hex")}.json`;
}

interface Stored {
  doc: PlannerDoc;
  /** Opaque token for a conditional write (blob ETag or a content hash). */
  etag: string;
}

interface Backend {
  read(pathname: string): Promise<Stored | null>;
  /** Write `body` only if the stored copy still has `etag` (null = must not exist yet). */
  write(pathname: string, body: string, etag: string | null): Promise<"ok" | "conflict">;
}

function parseDoc(text: string, where: string): PlannerDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const doc = sanitizePlannerDoc(raw);
  if (!doc) {
    // Never overwrite a document we can't read; surface it instead.
    console.error(`Planner document at ${where} is unreadable.`);
    throw new PlannerUnavailableError("Your saved planner couldn't be read.");
  }
  return doc;
}

// ---------- Vercel Blob (private) ----------

const blobBackend: Backend = {
  async read(pathname) {
    const { get } = await import("@vercel/blob");
    const res = await get(pathname, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    const text = await new Response(res.stream).text();
    return { doc: parseDoc(text, pathname), etag: res.blob.etag };
  },
  async write(pathname, body, etag) {
    const blob = await import("@vercel/blob");
    try {
      await blob.put(pathname, body, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
      });
      return "ok";
    } catch (err) {
      if (err instanceof blob.BlobPreconditionFailedError) return "conflict";
      // allowOverwrite:false on an existing pathname: another write created it first.
      if (!etag && err instanceof blob.BlobError && /exist/i.test(err.message)) return "conflict";
      throw err;
    }
  },
};

// ---------- Local folder (development only) ----------

function localDir(): string {
  return process.env.PLANNER_LOCAL_DIR || path.join(os.tmpdir(), "huntscout-planner-local");
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex");
// Serializes check-then-write per document within this process.
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    key,
    next.catch(() => {}).finally(() => {
      if (locks.get(key) === next) locks.delete(key);
    })
  );
  return next;
}

const localBackend: Backend = {
  async read(pathname) {
    const file = path.join(localDir(), pathname);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    return { doc: parseDoc(text, file), etag: hash(text) };
  },
  async write(pathname, body, etag) {
    const file = path.join(localDir(), pathname);
    return withLock(file, async () => {
      let current: string | null = null;
      try {
        current = await readFile(file, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      if ((current === null ? null : hash(current)) !== etag) return "conflict";
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, body, "utf8");
      await rename(tmp, file);
      return "ok";
    });
  },
};

function backend(): Backend {
  const kind = plannerStorage();
  if (kind === "blob") return blobBackend;
  if (kind === "local") return localBackend;
  throw new PlannerUnavailableError();
}

async function readStored(email: string): Promise<Stored | null> {
  return backend().read(plannerPath(email));
}

/** The member's planner, or an empty version-0 document when they have none yet. */
export async function readPlanner(email: string): Promise<PlannerDoc> {
  return (await readStored(email))?.doc ?? emptyDoc();
}

/**
 * Replace the member's planner with `data`, based on `baseVersion`.
 * Throws PlannerConflictError (with the current document) when the stored
 * version isn't `baseVersion`, PlannerTooLargeError over the size cap and
 * PlannerInvalidError when `data` isn't planner-shaped.
 */
export async function writePlanner(email: string, data: unknown, baseVersion: number): Promise<PlannerDoc> {
  const clean = sanitizePlannerData(data);
  if (!clean) throw new PlannerInvalidError();
  const stored = await readStored(email);
  const current = stored?.doc ?? emptyDoc();
  if (current.version !== baseVersion) throw new PlannerConflictError(current);
  const next: PlannerDoc = { schema: PLANNER_SCHEMA, version: current.version + 1, updatedAt: new Date().toISOString(), data: clean };
  const bytes = docBytes(next);
  if (bytes > MAX_PLANNER_BYTES) throw new PlannerTooLargeError(bytes);
  const result = await backend().write(plannerPath(email), JSON.stringify(next), stored?.etag ?? null);
  if (result === "conflict") throw new PlannerConflictError(await readPlanner(email));
  return next;
}

/**
 * Read-modify-write with retries, for server-side changes (adding an entry from
 * agency data). `change` returns the new data, or null to leave it as is.
 */
export async function updatePlanner<T>(
  email: string,
  change: (data: PlannerData) => { data: PlannerData | null; result: T },
  attempts = 4
): Promise<{ doc: PlannerDoc; result: T }> {
  for (let i = 0; ; i++) {
    const doc = await readPlanner(email);
    const { data, result } = change(doc.data);
    if (!data) return { doc, result };
    try {
      return { doc: await writePlanner(email, data, doc.version), result };
    } catch (err) {
      if (err instanceof PlannerConflictError && i < attempts - 1) continue;
      throw err;
    }
  }
}
