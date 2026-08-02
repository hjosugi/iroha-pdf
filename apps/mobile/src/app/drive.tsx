import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { File, Paths } from 'expo-file-system';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GOOGLE_DRIVE_SCOPES, GoogleDriveClient, type DriveFile } from '@iroha-pdf/google-drive';
import { alertFailure } from '@/lib/alerts';
import { importPdfFile } from '@/lib/files';
import { t } from '@/lib/i18n';
import { COLOR, CONTROL, RADIUS, SPACE, TYPE } from '@/lib/theme';
import { markStoreCaptureReady } from '@/lib/store-capture-native';
import { ContentColumn } from '@/components/ContentColumn';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export default function GoogleDriveScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  const client = useMemo(() => new GoogleDriveClient({
    getAccessToken: async () => {
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken;
    },
  }), []);

  const refreshFiles = useCallback(async () => {
    const result = await client.listAllPdfFiles();
    setFiles(result);
  }, [client]);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId,
      scopes: [...GOOGLE_DRIVE_SCOPES],
      offlineAccess: false,
    });
    markStoreCaptureReady('drive');
    if (webClientId && GoogleSignin.hasPreviousSignIn()) {
      setConnected(true);
      void refreshFiles().catch(() => setConnected(false));
    }
  }, [refreshFiles]);

  /**
   * Every action on this screen is a network round trip that has to lock the
   * controls while it runs and report its own failure. The name of the failure
   * is the only thing that differs between them.
   */
  const run = async (failureTitle: string, operation: () => Promise<void>) => {
    try {
      setBusy(true);
      await operation();
    } catch (error) {
      alertFailure(failureTitle, error);
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    if (!webClientId) {
      Alert.alert(t('drive.configurationRequired'), t('drive.configurationBody'));
      return;
    }
    await run('Google Drive', async () => {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      setConnected(true);
      await refreshFiles();
    });
  };

  const refresh = () => run(t('drive.refreshFailed'), refreshFiles);

  const disconnect = () => {
    Alert.alert(
      t('drive.disconnectTitle'),
      t('drive.disconnectBody'),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('drive.signOut'),
          onPress: () => void runDisconnect(false),
        },
        {
          text: t('drive.revoke'),
          style: 'destructive',
          onPress: () => void runDisconnect(true),
        },
      ],
    );
  };

  const runDisconnect = (revoke: boolean) => run(t('drive.disconnectFailed'), async () => {
    if (revoke) await GoogleSignin.revokeAccess();
    else await GoogleSignin.signOut();
    setConnected(false);
    setFiles([]);
  });

  const download = (driveFile: DriveFile) => run(t('drive.downloadFailed'), async () => {
    const bytes = await client.download(driveFile.id);
    const temporary = new File(Paths.cache, `${Date.now()}-${driveFile.name}`);
    temporary.create({ overwrite: true, intermediates: true });
    temporary.write(bytes);
    const imported = await importPdfFile(temporary, driveFile.name, 'google-drive', driveFile.id, driveFile.version);
    router.push({ pathname: '/viewer/[id]', params: { id: imported.id } });
  });

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ContentColumn>
          <View style={styles.hero}>
            <Text accessibilityRole="header" style={styles.heroTitle}>Google Drive</Text>
            <Text style={styles.heroBody}>{t('drive.intro')}</Text>
            {!webClientId ? (
              <View accessibilityRole="alert" style={styles.configurationNotice}>
                <Text style={styles.noticeTitle}>{t('drive.unavailable')}</Text>
                <Text style={styles.noticeBody}>{t('drive.unavailableBody')}</Text>
              </View>
            ) : connected ? (
              <View style={styles.connectionActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('drive.refreshLabel')} accessibilityState={{ disabled: busy }} style={[styles.connect, styles.flexAction, busy && styles.disabled]} disabled={busy} onPress={() => void refresh()}>
                  <Text style={styles.connectText}>{t('drive.refresh')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={t('drive.disconnectLabel')} accessibilityState={{ disabled: busy }} style={[styles.disconnect, busy && styles.disabled]} disabled={busy} onPress={disconnect}>
                  <Text style={styles.disconnectText}>{t('drive.disconnect')}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={t('drive.connect')} accessibilityState={{ disabled: busy }} style={[styles.connect, busy && styles.disabled]} disabled={busy} onPress={connect}>
                <Text style={styles.connectText}>{t('drive.connect')}</Text>
              </Pressable>
            )}
          </View>
          {busy ? (
            <View accessibilityRole="progressbar" accessibilityLabel={t('drive.working')} style={styles.busyRow}>
              <ActivityIndicator color="#2B5CFF" />
              <Text style={styles.busyText}>{t('action.working')}</Text>
            </View>
          ) : null}
          {files.map((file) => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('drive.downloadLabel', { name: file.name })} accessibilityHint={t('drive.downloadHint')} key={file.id} style={styles.file} disabled={busy} onPress={() => void download(file)}>
              <View accessibilityElementsHidden style={styles.badge}><Text style={styles.badgeText}>PDF</Text></View>
              <View style={styles.fileText}><Text numberOfLines={1} style={styles.fileTitle}>{file.name}</Text><Text style={styles.fileMeta}>{file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Google Drive'}</Text></View>
              <Text accessibilityElementsHidden style={styles.download}>↓</Text>
            </Pressable>
          ))}
          {connected && !busy && files.length === 0 ? <Text style={styles.empty}>{t('drive.empty')}</Text> : null}
        </ContentColumn>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.background },
  content: { padding: SPACE.xl },
  hero: { borderRadius: RADIUS.xl, padding: SPACE.xl, backgroundColor: COLOR.surface, borderWidth: SPACE.hairline, borderColor: '#E5E8EE' },
  heroTitle: { color: '#1A1F28', fontSize: TYPE.title, fontWeight: '800' },
  heroBody: { marginTop: SPACE.sm, color: '#737B87', lineHeight: SPACE.xl },
  connect: { minHeight: CONTROL.comfortable, alignItems: 'center', justifyContent: 'center', marginTop: SPACE.xl, borderRadius: RADIUS.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, backgroundColor: COLOR.brand },
  connectText: { color: COLOR.surface, fontWeight: '800' },
  configurationNotice: { marginTop: SPACE.lg, borderRadius: RADIUS.md, padding: SPACE.lg, backgroundColor: '#FFF7DA', borderWidth: SPACE.hairline, borderColor: '#E9D888' },
  noticeTitle: { color: '#3D3416', fontWeight: '800' },
  noticeBody: { marginTop: SPACE.xs, color: '#786C3F', lineHeight: SPACE.xl },
  connectionActions: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm },
  flexAction: { flex: 1 },
  disconnect: { minHeight: CONTROL.comfortable, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, backgroundColor: COLOR.control },
  disconnectText: { color: '#4E5663', fontWeight: '800' },
  disabled: { opacity: 0.5 },
  busyRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACE.sm, padding: SPACE.lg },
  busyText: { color: COLOR.brand, fontWeight: '700' },
  file: { minHeight: CONTROL.comfortable + SPACE.lg, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.md, borderRadius: RADIUS.lg, padding: SPACE.md, backgroundColor: COLOR.surface, borderWidth: SPACE.hairline, borderColor: '#E7E9EE' },
  badge: { width: CONTROL.minimum, height: CONTROL.minimum, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EC' },
  badgeText: { color: '#D65339', fontSize: TYPE.caption, fontWeight: '900' },
  fileText: { flex: 1 },
  fileTitle: { color: '#222730', fontWeight: '700' },
  fileMeta: { marginTop: SPACE.xs, color: '#8A909A', fontSize: TYPE.caption },
  download: { color: COLOR.brand, fontSize: SPACE.xl, fontWeight: '800' },
  empty: { padding: SPACE.lg, color: '#787F8A', lineHeight: SPACE.xl },
});
