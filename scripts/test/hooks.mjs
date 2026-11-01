// Node module hooks for `npm test` only: resolve the "@/..." path alias to src/
// (trying .ts, .tsx and /index.ts like the bundler does) and stub "server-only",
// which throws outside Next's server build.
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const base = SRC + specifier.slice(2);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (isFile(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
