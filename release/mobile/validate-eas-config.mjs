import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../../apps/mobile/eas.json", import.meta.url), "utf8"));
const expected = {
  development: { distribution: "internal", environment: "development" },
  preview: { distribution: "internal", environment: "preview" },
  production: { distribution: "store", environment: "production" }
};

assert.equal(config.cli.appVersionSource, "remote", "EAS versions must be managed remotely");
assert.equal(config.build.base.credentialsSource, "remote", "signing credentials must stay in EAS");
assert.equal(config.build.base.node, "22.13.0", "EAS and CI must use the same Node version");
for (const [name, values] of Object.entries(expected)) {
  const profile = config.build[name];
  assert.ok(profile, `missing ${name} build profile`);
  assert.equal(profile.extends, "base", `${name} must inherit signing and runtime policy`);
  assert.equal(profile.distribution, values.distribution, `${name} distribution is incorrect`);
  assert.equal(profile.environment, values.environment, `${name} environment is incorrect`);
}
assert.equal(config.build.development.developmentClient, true);
assert.equal(config.build.preview.android.buildType, "apk");
assert.equal(config.build.production.autoIncrement, true);
assert.ok(config.submit.production, "missing production submit profile");

console.log("EAS development, preview, production, signing, and submit policies are valid.");
