const { withMainApplication, withSettingsGradle } = require('@expo/config-plugins');

const featureFlagsImport = 'import com.facebook.react.config.ReactFeatureFlags';
const featureFlagsAssignment = '    ReactFeatureFlags.dispatchPointerEvents = true';
const sourceBuildMarker = '// Iroha: build the patched React Native Android bridge from source';
const sourceBuildBlock = `${sourceBuildMarker}
def irohaReactNativeSource = new File(
  providers.exec {
    workingDir(rootDir)
    commandLine("node", "--print", "require.resolve('react-native/package.json')")
  }.standardOutput.asText.get().trim()
).getParentFile()
includeBuild(irohaReactNativeSource) {
  dependencySubstitution {
    substitute module("com.facebook.react:react-native") using project(":packages:react-native:ReactAndroid")
    substitute module("com.facebook.react:react-android") using project(":packages:react-native:ReactAndroid")
    substitute module("com.facebook.react:hermes-engine") using project(":packages:react-native:ReactAndroid:hermes-engine")
    substitute module("com.facebook.react:hermes-android") using project(":packages:react-native:ReactAndroid:hermes-engine")
    substitute module("com.facebook.hermes:hermes-android") using project(":packages:react-native:ReactAndroid:hermes-engine")
  }
}
`;

/**
 * React Native 0.86 still guards Android's W3C pointer-event dispatcher with
 * this legacy feature flag. Without it, onPointerDown/onPointerMove handlers
 * compile but never receive touch, mouse, or stylus events on Android.
 *
 * Keep the setting in Expo prebuild so local, EAS, CI, and evidence APKs all
 * produce the same MainApplication instead of patching the ignored android/
 * project after generation. React Android must also be included as a Gradle
 * composite build: otherwise Gradle consumes the precompiled react-android AAR
 * and the reviewed PointerEvent.kt pressure patch never reaches the APK. Hermes
 * must come from the same composite build as well. Legacy `react-native` and
 * `hermes-engine` Maven coordinates also need direct substitutions: otherwise
 * the React plugin rewrites them to published AARs after composite resolution,
 * mixing those AARs with source ReactAndroid and duplicating classes at D8 time.
 */
module.exports = function withAndroidPointerEvents(config) {
  const withApplication = withMainApplication(config, (applicationConfig) => {
    if (applicationConfig.modResults.language !== 'kt') {
      throw new Error('with-android-pointer-events.js requires Expo\'s Kotlin MainApplication');
    }

    let contents = applicationConfig.modResults.contents;
    if (!contents.includes(featureFlagsImport)) {
      const importAnchor = 'import android.content.res.Configuration\n';
      if (!contents.includes(importAnchor)) {
        throw new Error('Generated MainApplication has no Configuration import; update with-android-pointer-events.js');
      }
      contents = contents.replace(importAnchor, `${importAnchor}\n${featureFlagsImport}\n`);
    }

    if (!contents.includes(featureFlagsAssignment)) {
      const onCreateAnchor = '  override fun onCreate() {\n    super.onCreate()\n';
      if (!contents.includes(onCreateAnchor)) {
        throw new Error('Generated MainApplication has no expected onCreate method; update with-android-pointer-events.js');
      }
      contents = contents.replace(onCreateAnchor, `${onCreateAnchor}${featureFlagsAssignment}\n`);
    }

    applicationConfig.modResults.contents = contents;
    return applicationConfig;
  });

  return withSettingsGradle(withApplication, (settingsConfig) => {
    if (settingsConfig.modResults.language !== 'groovy') {
      throw new Error('with-android-pointer-events.js requires Expo\'s Groovy settings.gradle');
    }

    let contents = settingsConfig.modResults.contents;
    if (!contents.includes(sourceBuildMarker)) {
      contents = `${contents.trimEnd()}\n\n${sourceBuildBlock}`;
    }
    settingsConfig.modResults.contents = contents;
    return settingsConfig;
  });
};
