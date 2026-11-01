// Lets `node --experimental-strip-types` load the app's TypeScript modules, which use
// extensionless relative imports and the "@/..." alias (Next.js bundler resolution).
// Registered by tests/register.mjs:
//   node --experimental-strip-types --import ./tests/register.mjs --test tests/*.test.ts
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith("@/")) spec = new URL(spec.slice(2), SRC).href;
  const isRelative = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:");
  if (isRelative && !/\.[cm]?[jt]sx?$|\.json$/.test(spec)) {
    const base = new URL(spec, context.parentURL);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) return next(pathToFileURL(fileURLToPath(candidate)).href, context);
    }
  }
  return next(spec, context);
}
