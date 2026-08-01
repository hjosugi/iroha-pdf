const { withPodfile } = require('@expo/config-plugins');

/**
 * Google Sign-In pulls AppCheckCore, a Swift pod whose GoogleUtilities and
 * RecaptchaInterop dependencies do not publish module maps. Expo's generated
 * Podfile links pods statically, so CocoaPods refuses that graph unless modular
 * headers are enabled. Keep the policy in prebuild rather than patching the
 * generated ios/ directory, which is deliberately ignored by this repository.
 */
module.exports = function withModularIosHeaders(config) {
  return withPodfile(config, (podfileConfig) => {
    const marker = 'use_modular_headers!';
    if (podfileConfig.modResults.contents.includes(marker)) return podfileConfig;

    const anchor = "prepare_react_native_project!\n";
    if (!podfileConfig.modResults.contents.includes(anchor)) {
      throw new Error('Expo Podfile no longer contains prepare_react_native_project!; update with-modular-ios-headers.js');
    }
    podfileConfig.modResults.contents = podfileConfig.modResults.contents.replace(
      anchor,
      `${marker}\n\n${anchor}`,
    );
    return podfileConfig;
  });
};
