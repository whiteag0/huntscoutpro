// Node module hooks for `npm test` only: resolve the "@/..." path alias to src/
// (trying .ts, .tsx and /index.ts like the bundler does), stub "server-only",
// which throws outside Next's server build, and import JSON the way the bundler does.
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
      if (isFile(candidate)) return withJson({ url: pathToFileURL(candidate).href, shortCircuit: true }, context);
    }
  }
  return withJson(await next(specifier, context), context);
}

// The bundler imports JSON without `with { type: "json" }` (e.g. the agency index); Node needs it.
function withJson(result, context) {
  if (!result.url.endsWith(".json") || context.importAttributes?.type) return result;
  return { ...result, importAttributes: { ...context.importAttributes, type: "json" } };
}
