/** JSON with objects/arrays kept on one line when they fit in `width` characters (the style of the data/*.json files). */
export function compactJson(value: unknown, width = 150, indent = ""): string {
  const one = JSON.stringify(value);
  if (one === undefined || one.length + indent.length <= width || typeof value !== "object" || value === null) return one ?? "null";
  const inner = `${indent}  `;
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + compactJson(v, width, inner)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJson(v, width, inner)}`).join(",\n")}\n${indent}}`;
}
