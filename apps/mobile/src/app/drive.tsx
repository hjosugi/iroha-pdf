import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { File, Paths } from 'expo-file-system';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GOOGLE_DRIVE_SCOPES, GoogleDriveClient, type DriveFile } from '@iroha-pdf/google-drive';
import { importPdfFile } from '@/lib/files';
import { t } from '@/lib/i18n';
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

  const connect = async () => {
    if (!webClientId) {
      Alert.alert(t('drive.configurationRequired'), t('drive.configurationBody'));
      return;
    }
    try {
      setBusy(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      setConnected(true);
      await refreshFiles();
    } catch (error) {
      Alert.alert('Google Drive', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    try {
      setBusy(true);
      await refreshFiles();
    } catch (error) {
      Alert.alert(t('drive.refreshFailed'), error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

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

  const runDisconnect = async (revoke: boolean) => {
    try {
      setBusy(true);
      if (revoke) await GoogleSignin.revokeAccess();
      else await GoogleSignin.signOut();
      setConnected(false);
      setFiles([]);
    } catch (error) {
      Alert.alert(t('drive.disconnectFailed'), error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const download = async (driveFile: DriveFile) => {
    try {
      setBusy(true);
      const bytes = await client.download(driveFile.id);
      const temporary = new File(Paths.cache, `${Date.now()}-${driveFile.name}`);
      temporary.create({ overwrite: true, intermediates: true });
      temporary.write(bytes);
      const imported = await importPdfFile(temporary, driveFile.name, 'google-drive', driveFile.id, driveFile.version);
      router.push({ pathname: '/viewer/[id]', params: { id: imported.id } });
    } catch (error) {
      Alert.alert(t('drive.downloadFailed'), error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

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
  container: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { padding: 18 },
  hero: { borderRadius: 19, padding: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E8EE' },
  heroTitle: { color: '#1A1F28', fontSize: 25, fontWeight: '800' },
  heroBody: { marginTop: 8, color: '#737B87', lineHeight: 20 },
  connect: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#2B5CFF' },
  connectText: { color: '#FFFFFF', fontWeight: '800' },
  configurationNotice: { marginTop: 16, borderRadius: 12, padding: 14, backgroundColor: '#FFF7DA', borderWidth: 1, borderColor: '#E9D888' },
  noticeTitle: { color: '#3D3416', fontWeight: '800' },
  noticeBody: { marginTop: 5, color: '#786C3F', lineHeight: 19 },
  connectionActions: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  flexAction: { flex: 1 },
  disconnect: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ECEEF2' },
  disconnectText: { color: '#4E5663', fontWeight: '800' },
  disabled: { opacity: 0.5 },
  busyRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 16 },
  busyText: { color: '#2B5CFF', fontWeight: '700' },
  file: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, borderRadius: 15, padding: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E9EE' },
  badge: { width: 40, height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EC' },
  badgeText: { color: '#D65339', fontSize: 10, fontWeight: '900' },
  fileText: { flex: 1 },
  fileTitle: { color: '#222730', fontWeight: '700' },
  fileMeta: { marginTop: 4, color: '#8A909A', fontSize: 11 },
  download: { color: '#2B5CFF', fontSize: 20, fontWeight: '800' },
  empty: { padding: 14, color: '#787F8A', lineHeight: 20 },
});
