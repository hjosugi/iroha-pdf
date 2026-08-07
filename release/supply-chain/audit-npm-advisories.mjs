/**
 * `npm audit`, with room for advisories that have nowhere to go.
 *
 * The plain command is the right gate almost always: an advisory appears, a patch
 * exists, the lockfile moves. It has no answer for the case where every published
 * version of a package is affected and the only offered fix is a major downgrade of
 * something else. Left as-is, that turns the gate permanently red, and a gate that is
 * always red stops being read.
 *
 * So an advisory may be excepted — never silently. Each entry names the advisory, says
 * why shipping with it is acceptable, and expires, and this fails if an exception has
 * expired or no longer matches anything. A list that cannot rot is the difference
 * between an exception and a hole.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const exceptionsPath = resolve(root, 'release/supply-chain/advisory-exceptions.json');
const today = new Date().toISOString().slice(0, 10);

/** `npm audit` exits non-zero when it finds something, which is not an error here. */
function audit() {
  try {
    return execFileSync('npm', ['audit', '--omit=optional', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (typeof error.stdout === 'string' && error.stdout.length > 0) return error.stdout;
    throw error;
  }
}

/** Every advisory the report names, as `{ package, id, title, severity }`. */
function findings(report) {
  const found = [];
  for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      // A string `via` is a link to another vulnerable package in the same graph,
      // not an advisory of its own; the advisory is reported where it originates.
      if (typeof via !== 'object') continue;
      found.push({
        package: name,
        id: via.url?.split('/').pop() ?? String(via.source ?? 'unknown'),
        title: via.title ?? 'untitled advisory',
        severity: via.severity ?? entry.severity ?? 'unknown',
      });
    }
  }
  return found;
}

const report = JSON.parse(audit());
const found = findings(report);
const { exceptions } = JSON.parse(readFileSync(exceptionsPath, 'utf8'));

const failures = [];
const excepted = new Set();

for (const exception of exceptions) {
  const matched = found.filter(
    (finding) => finding.package === exception.package && exception.advisories.includes(finding.id),
  );
  if (exception.expires <= today) {
    failures.push(
      `the exception for ${exception.package} expired on ${exception.expires}: renew it with a fresh reason, or fix the advisory`,
    );
    continue;
  }
  if (matched.length === 0) {
    failures.push(
      `the exception for ${exception.package} (${exception.advisories.join(', ')}) no longer matches any advisory — remove it`,
    );
    continue;
  }
  for (const finding of matched) excepted.add(`${finding.package}:${finding.id}`);
  console.log(`excepted until ${exception.expires}: ${exception.package} — ${exception.advisories.join(', ')}`);
}

for (const finding of found) {
  if (excepted.has(`${finding.package}:${finding.id}`)) continue;
  failures.push(`${finding.severity}: ${finding.package} — ${finding.title} (${finding.id})`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(`\n${failures.length} advisory problem(s). Fix them, or add an expiring exception with a reason.`);
  process.exit(1);
}

console.log(`npm advisories: ${found.length} found, all accounted for.`);
