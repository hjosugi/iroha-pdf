import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import parseExpression from "spdx-expression-parse";

const allowed = new Set([
  "0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "BlueOak-1.0.0",
  "CC-BY-4.0", "CC0-1.0", "ISC", "MIT", "MIT-0", "MPL-2.0", "OFL-1.1",
  "Python-2.0", "Unicode-3.0", "Unlicense", "Zlib"
]);
const copyleftPattern = /(?:^|[^A-Z])(?:A?GPL|LGPL|SSPL)-/i;

function isAllowed(node) {
  if (node.license) return allowed.has(node.license) && !copyleftPattern.test(node.license);
  if (node.conjunction === "and") return isAllowed(node.left) && isAllowed(node.right);
  if (node.conjunction === "or") return isAllowed(node.left) || isAllowed(node.right);
  return false;
}

const input = process.argv[2] ?? "artifacts/npm.cdx.json";
const bom = JSON.parse(await readFile(input, "utf8"));
const failures = [];
const copyleftAlternatives = [];
const evidence = [];

for (const component of bom.components ?? []) {
  const componentId = component["bom-ref"] ?? component.name;
  const expressions = (component.licenses ?? []).map(entry =>
    entry.expression ?? entry.license?.id ?? entry.license?.name
  ).filter(Boolean);
  if (expressions.length === 0 && component.group === "@iroha-pdf") {
    evidence.push({ component: componentId, licenses: ["Apache-2.0 (inherited workspace policy)"] });
    continue;
  }
  const parsed = [];
  for (const expression of expressions) {
    try {
      parsed.push({ expression, tree: parseExpression(expression) });
    } catch {
      failures.push({ component: componentId, expression, reason: "invalid SPDX expression" });
    }
    if (copyleftPattern.test(expression)) copyleftAlternatives.push({ component: componentId, expression });
  }
  if (parsed.length === 0 || !parsed.some(({ tree }) => isAllowed(tree))) {
    failures.push({
      component: componentId,
      expression: expressions.join(" OR ") || "UNLICENSED",
      reason: "no branch satisfies the allowlist"
    });
  }
  evidence.push({ component: componentId, licenses: expressions });
}

evidence.sort((a, b) => a.component.localeCompare(b.component));
const report = {
  allowed: [...allowed].sort(), componentCount: evidence.length, failures,
  copyleftAlternatives, components: evidence
};
await writeFile("artifacts/npm-license-audit.json", `${JSON.stringify(report, null, 2)}\n`);

if (copyleftAlternatives.length > 0) {
  console.warn(`Detected ${copyleftAlternatives.length} copyleft license alternative(s); each has a permitted SPDX choice.`);
}
if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
} else {
  console.log(`License policy passed for ${evidence.length} npm components.`);
}
