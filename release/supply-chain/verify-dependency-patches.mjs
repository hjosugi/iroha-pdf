import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const xcode = require("xcode");
const xcodeProject = xcode.project("/dev/null");
xcodeProject.hash = { project: { objects: {} } };
assert.match(
  xcodeProject.generateUuid(),
  /^[0-9A-F]{24}$/,
  "xcode must remain compatible with the patched uuid CommonJS API",
);

const uuidEntry = require.resolve("uuid", {
  paths: [path.dirname(require.resolve("xcode"))],
});
let uuidDirectory = path.dirname(uuidEntry);
let uuidPackage;
while (uuidDirectory !== path.dirname(uuidDirectory)) {
  try {
    uuidPackage = JSON.parse(
      await readFile(path.join(uuidDirectory, "package.json"), "utf8"),
    );
    if (uuidPackage.name === "uuid") break;
  } catch {
    // Keep walking from the resolved entry to the owning package directory.
  }
  uuidDirectory = path.dirname(uuidDirectory);
}
assert.equal(
  uuidPackage?.version,
  "11.1.1",
  "xcode must resolve the audited uuid 11.1.1 override",
);

const patchedVariantIterator = await readFile(
  path.join(
    repositoryRoot,
    "apps/desktop/src-tauri/vendor/glib-0.18.5-patched/src/variant_iter.rs",
  ),
  "utf8",
);
assert.equal(
  createHash("sha256").update(patchedVariantIterator).digest("hex"),
  "a0f5ee8acb8faa089bcdfbc9a57372609fce7654026ccef7d9a224d05a654ccc",
  "the vendored glib security patch must match the reviewed source",
);
assert.match(
  patchedVariantIterator,
  /let mut p: \*mut libc::c_char = std::ptr::null_mut\(\);/,
  "the vendored glib output pointer must be mutable",
);
assert.match(
  patchedVariantIterator,
  /g_variant_get_child\([\s\S]*?&mut p,/,
  "the vendored glib output pointer must be passed mutably",
);

const reactNativePdfBridge = await readFile(
  path.join(repositoryRoot, "node_modules/react-native-pdf/index.js"),
  "utf8",
);
assert.match(
  reactNativePdfBridge,
  /onPageChanged\(Number\(message\[1\]\), Number\(message\[2\]\), size\)/,
  "react-native-pdf must forward each native page size to JavaScript",
);
const reactNativePdfAndroid = await readFile(
  path.join(
    repositoryRoot,
    "node_modules/react-native-pdf/android/src/main/java/org/wonday/pdf/PdfView.java",
  ),
  "utf8",
);
assert.match(
  reactNativePdfAndroid,
  /pageChanged\|"\+page\+"\|"\+numberOfPages\+"\|"\+pageSize\.getWidth\(\)\+"\|"\+pageSize\.getHeight\(\)/,
  "react-native-pdf Android must report the current page dimensions",
);
const reactNativePdfIos = await readFile(
  path.join(repositoryRoot, "node_modules/react-native-pdf/ios/RNPDFPdf/RNPDFPdfView.mm"),
  "utf8",
);
assert.match(
  reactNativePdfIos,
  /pageChanged\|%lu\|%lu\|%f\|%f/,
  "react-native-pdf iOS must report the current page dimensions",
);

const reactNativeAndroidPointerEvent = await readFile(
  path.join(
    repositoryRoot,
    "node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/events/PointerEvent.kt",
  ),
  "utf8",
);
assert.match(
  reactNativeAndroidPointerEvent,
  /pointerType == PointerEventHelper\.POINTER_TYPE_PEN[\s\S]*motionEvent\.getPressure\(index\)\.toDouble\(\)\.coerceIn\(0\.0, 1\.0\)/,
  "React Native Android must preserve normalized MotionEvent stylus pressure",
);
const reactNativePatch = await readFile(
  path.join(repositoryRoot, "patches/react-native+0.86.2.patch"),
  "utf8",
);
assert.match(
  reactNativePatch,
  /PointerEvent\.kt[\s\S]*POINTER_TYPE_PEN[\s\S]*motionEvent\.getPressure\(index\)/,
  "the reviewed React Native 0.86.2 pressure bridge patch must be committed",
);

const androidPointerPlugin = await readFile(
  path.join(
    repositoryRoot,
    "apps/mobile/plugins/with-android-pointer-events.js",
  ),
  "utf8",
);
assert.match(
  androidPointerPlugin,
  /includeBuild\(irohaReactNativeSource\)[\s\S]*substitute module\("com\.facebook\.react:react-native"\) using project\(":packages:react-native:ReactAndroid"\)[\s\S]*substitute module\("com\.facebook\.react:react-android"\) using project\(":packages:react-native:ReactAndroid"\)[\s\S]*substitute module\("com\.facebook\.react:hermes-engine"\) using project\(":packages:react-native:ReactAndroid:hermes-engine"\)[\s\S]*substitute module\("com\.facebook\.react:hermes-android"\) using project\(":packages:react-native:ReactAndroid:hermes-engine"\)[\s\S]*substitute module\("com\.facebook\.hermes:hermes-android"\) using project\(":packages:react-native:ReactAndroid:hermes-engine"\)/,
  "Android prebuild must substitute the prebuilt React Android and Hermes AARs with matching source projects",
);

console.log("Dependency patch verification passed.");
