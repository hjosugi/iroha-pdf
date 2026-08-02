const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * The evidence APK downloads a generated fixture from an ADB-reversed local
 * server. Production builds never receive the flag and therefore retain
 * Android's default cleartext-network denial.
 */
module.exports = function withDeviceEvidence(config) {
  if (process.env.IROHA_DEVICE_EVIDENCE !== '1') return config;
  return withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error('Generated AndroidManifest has no application element');
    application.$['android:usesCleartextTraffic'] = 'true';
    return manifestConfig;
  });
};
