import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Small JSON document store on the PRIVATE Vercel Blob store.
//
// On Vercel, @vercel/blob authenticates with the deployment's OIDC token and
// BLOB_STORE_ID (both set by Vercel), so no token lives in the code or env.
// Every object is written with access: "private" and read with useCache: false.
//
// Without BLOB_STORE_ID (local dev and `npm test`) documents go to a folder on
// disk instead. That fallback is refused in production, except for a local
// `next start` that opts in with BLOB_LOCAL_DIR and isn't running on Vercel.

export interface StoredJson<T> {
  data: T;
  /** Opaque version tag; pass back as ifMatch for a conditional write. */
  etag: string;
}

export interface PutOptions {
  /** Only write when the stored object still has this etag. */
  ifMatch?: string;
  /** Only write when no object exists at this path yet. */
  ifNew?: boolean;
}

/** A conditional write lost a race (ifMatch / ifNew didn't hold). Re-read and retry. */
export class StoreConflictError extends Error {
  constructor(pathname: string) {
    super(`Store conflict on ${pathname}`);
    this.name = "StoreConflictError";
  }
}

export type StoreMode = "blob" | "local";
type Env = Record<string, string | undefined>;

/** Which backend this process uses, or throws when neither is allowed. */
export function storeMode(env: Env = process.env): StoreMode {
  if (env.BLOB_STORE_ID) return "blob";
  const localOptIn = !!env.BLOB_LOCAL_DIR && !env.VERCEL;
  if (env.NODE_ENV !== "production" || localOptIn) return "local";
  throw new Error("BLOB_STORE_ID is not set; the private Blob store isn't connected to this deployment.");
}

export function isStoreConfigured(env: Env = process.env): boolean {
  try {
    storeMode(env);
    return true;
  } catch {
    return false;
  }
}

/** True when documents live on local disk (dev / tests / local QA), never on Vercel. */
export function isLocalStore(env: Env = process.env): boolean {
  return isStoreConfigured(env) && storeMode(env) === "local";
}

function assertPath(pathname: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(pathname) || pathname.includes("..") || pathname.endsWith("/")) {
    throw new Error(`Invalid store path "${pathname}"`);
  }
}

// ---------------------------------------------------------------- local

function localRoot(): string {
  return path.resolve(process.env.BLOB_LOCAL_DIR || path.join(os.tmpdir(), "huntscout-blob-local"));
}

function localFile(pathname: string): string {
  return path.join(localRoot(), ...pathname.split("/"));
}

const localEtag = (body: string) => `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;

async function localGet<T>(pathname: string): Promise<StoredJson<T> | null> {
  try {
    const body = await readFile(localFile(pathname), "utf8");
    return { data: JSON.parse(body) as T, etag: localEtag(body) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function localPut(pathname: string, body: string, opts: PutOptions): Promise<string> {
  const file = localFile(pathname);
  if (opts.ifMatch || opts.ifNew) {
    const current = await localGet(pathname);
    if (opts.ifNew && current) throw new StoreConflictError(pathname);
    if (opts.ifMatch && current?.etag !== opts.ifMatch) throw new StoreConflictError(pathname);
  }
  await mkdir(path.dirname(file), { recursive: true });
  // Write-then-rename so a reader never sees half a file.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, file);
  return localEtag(body);
}

async function localList(prefix: string): Promise<string[]> {
  const root = localRoot();
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (!e.name.endsWith(".tmp")) {
        const rel = path.relative(root, full).split(path.sep).join("/");
        if (rel.startsWith(prefix)) out.push(rel);
      }
    }
  }
  // Only walk the folder the prefix points into.
  const dirPart = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";
  const start = dirPart ? path.join(root, ...dirPart.split("/")) : root;
  if (await stat(start).then((s) => s.isDirectory()).catch(() => false)) await walk(start);
  return out.sort();
}

// ----------------------------------------------------------------- blob

type BlobModule = typeof import("@vercel/blob");
let blobModule: Promise<BlobModule> | null = null;
// Loaded on first use so tests and local dev never pull in the SDK.
const blob = () => (blobModule ||= import("@vercel/blob"));

async function blobGet<T>(pathname: string): Promise<StoredJson<T> | null> {
  const { get } = await blob();
  const res = await get(pathname, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return null;
  const body = await new Response(res.stream).text();
  return { data: JSON.parse(body) as T, etag: res.blob.etag };
}

async function blobPut(pathname: string, body: string, opts: PutOptions): Promise<string> {
  const { put, BlobPreconditionFailedError, BlobError } = await blob();
  try {
    const res = await put(pathname, body, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: !opts.ifNew,
      cacheControlMaxAge: 60,
      ...(opts.ifMatch ? { ifMatch: opts.ifMatch } : {}),
    });
    return res.etag;
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) throw new StoreConflictError(pathname);
    // put() without allowOverwrite fails when another request created the object first. The SDK
    // doesn't give that failure its own error class, so check whether the object now exists.
    if (opts.ifNew && err instanceof BlobError) {
      if (/already exists/i.test(err.message)) throw new StoreConflictError(pathname);
      const exists = await blobGet(pathname).then((r) => !!r, () => false);
      if (exists) throw new StoreConflictError(pathname);
    }
    throw err;
  }
}

async function blobList(prefix: string): Promise<string[]> {
  const { list } = await blob();
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out.sort();
}

// ------------------------------------------------------------------ API

export async function getJson<T>(pathname: string): Promise<StoredJson<T> | null> {
  assertPath(pathname);
  return storeMode() === "blob" ? blobGet<T>(pathname) : localGet<T>(pathname);
}

/** Write a JSON document. Returns the new etag. Throws StoreConflictError when a condition fails. */
export async function putJson(pathname: string, data: unknown, opts: PutOptions = {}): Promise<string> {
  assertPath(pathname);
  const body = JSON.stringify(data);
  return storeMode() === "blob" ? blobPut(pathname, body, opts) : localPut(pathname, body, opts);
}

/** Every pathname under a prefix (follows pagination). */
export async function listPaths(prefix: string): Promise<string[]> {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(prefix)) throw new Error(`Invalid store prefix "${prefix}"`);
  return storeMode() === "blob" ? blobList(prefix) : localList(prefix);
}

export async function deletePath(pathname: string): Promise<void> {
  assertPath(pathname);
  if (storeMode() === "blob") {
    const { del } = await blob();
    await del(pathname);
  } else {
    await rm(localFile(pathname), { force: true });
  }
}
