import { fileURLToPath, pathToFileURL } from "node:url";
import { redirect } from "./data-pack.mjs";

export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (r.url.startsWith("file:") && r.url.endsWith(".json")) {
    const p = redirect(fileURLToPath(r.url));
    if (p) return { ...r, url: pathToFileURL(p).href };
  }
  return r;
}
