import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../../apps/mobile/eas.json", import.meta.url), "utf8"));
const app = JSON.parse(await readFile(new URL("../../apps/mobile/app.json", import.meta.url), "utf8"));
const iosPodPlugin = await readFile(
  new URL("../../apps/mobile/plugins/with-modular-ios-headers.js", import.meta.url),
  "utf8",
);
const androidPointerPlugin = await readFile(
  new URL("../../apps/mobile/plugins/with-android-pointer-events.js", import.meta.url),
  "utf8",
);
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

const blocked = new Set(app.expo.android.blockedPermissions);
assert.ok(blocked.has("android.permission.RECORD_AUDIO"), "release builds must not request an unused microphone permission");
assert.ok(blocked.has("android.permission.SYSTEM_ALERT_WINDOW"), "release builds must not request the dev-client overlay permission");
assert.ok(blocked.has("android.permission.READ_EXTERNAL_STORAGE"), "document-provider import must not request broad legacy read access");
assert.ok(blocked.has("android.permission.WRITE_EXTERNAL_STORAGE"), "document-provider export must not request broad legacy write access");
assert.ok(
  app.expo.plugins.includes("./plugins/with-modular-ios-headers"),
  "iOS prebuild must make Google Sign-In's Swift dependencies modular",
);
assert.ok(
  app.expo.plugins.includes("./plugins/with-android-pointer-events"),
  "Android prebuild must enable the React Native pointer-event dispatcher",
);
assert.match(
  androidPointerPlugin,
  /ReactFeatureFlags\.dispatchPointerEvents\s*=\s*true/,
  "Android stylus input requires React Native's pointer-event dispatcher",
);
assert.match(
  iosPodPlugin,
  /EXPO_USE_PRECOMPILED_MODULES\s*=\s*['"]false['"]/,
  "iOS builds must source-build Expo modules to prevent incompatible XCFramework ABIs",
);

const pluginOptions = new Map(
  app.expo.plugins
    .filter((plugin) => Array.isArray(plugin))
    .map(([name, options]) => [name, options]),
);
const imagePicker = pluginOptions.get("expo-image-picker");
assert.equal(imagePicker?.cameraPermission, false, "image import must not request camera access");
assert.equal(imagePicker?.microphonePermission, false, "image import must not request microphone access");
assert.match(imagePicker?.photosPermission ?? "", /choose images/i, "image import needs a specific photo-library purpose");
assert.equal(
  pluginOptions.get("expo-secure-store")?.faceIDPermission,
  false,
  "token storage must not claim unused Face ID access",
);

console.log("EAS profiles, native pointer/permission policy, iOS pods, signing, and submit policies are valid.");
