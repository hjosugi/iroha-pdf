import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: normalize-cyclonedx.mjs <input> <output>");

const bom = JSON.parse(await readFile(input, "utf8"));
delete bom.serialNumber;
if (bom.metadata) delete bom.metadata.timestamp;

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])]));
  }
  return value;
}

await writeFile(output, `${JSON.stringify(sortObject(bom), null, 2)}\n`);
