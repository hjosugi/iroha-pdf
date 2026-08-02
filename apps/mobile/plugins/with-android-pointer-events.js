const { withMainApplication } = require('@expo/config-plugins');

const featureFlagsImport = 'import com.facebook.react.config.ReactFeatureFlags';
const featureFlagsAssignment = '    ReactFeatureFlags.dispatchPointerEvents = true';

/**
 * React Native 0.86 still guards Android's W3C pointer-event dispatcher with
 * this legacy feature flag. Without it, onPointerDown/onPointerMove handlers
 * compile but never receive touch, mouse, or stylus events on Android.
 *
 * Keep the setting in Expo prebuild so local, EAS, CI, and evidence APKs all
 * produce the same MainApplication instead of patching the ignored android/
 * project after generation.
 */
module.exports = function withAndroidPointerEvents(config) {
  return withMainApplication(config, (applicationConfig) => {
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
};
