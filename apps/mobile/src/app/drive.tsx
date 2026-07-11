import { useEffect, useState } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { File, Paths } from 'expo-file-system';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GOOGLE_DRIVE_SCOPES, GoogleDriveClient, type DriveFile } from '@iroha-pdf/google-drive';
import { importPdfFile } from '@/lib/files';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export default function GoogleDriveScreen() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId,
      scopes: [...GOOGLE_DRIVE_SCOPES],
      offlineAccess: false,
    });
  }, []);

  const client = new GoogleDriveClient({
    getAccessToken: async () => {
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken;
    },
  });

  const connect = async () => {
    if (!webClientId) {
      Alert.alert('Configuration required', 'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and rebuild the development client.');
      return;
    }
    try {
      setBusy(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      setConnected(true);
      const result = await client.listPdfFiles();
      setFiles(result.files);
    } catch (error) {
      Alert.alert('Google Drive', error instanceof Error ? error.message : String(error));
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
      await importPdfFile(temporary, driveFile.name, 'google-drive', driveFile.id, driveFile.version);
      Alert.alert('Downloaded', `${driveFile.name} is available offline.`);
    } catch (error) {
      Alert.alert('Download failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Google Drive</Text>
          <Text style={styles.heroBody}>Iroha PDF requests only drive.file and appDataFolder access. Your other Drive files stay outside the app.</Text>
          <Pressable style={[styles.connect, busy && styles.disabled]} disabled={busy} onPress={connect}>
            <Text style={styles.connectText}>{connected ? 'Refresh files' : 'Connect Google Drive'}</Text>
          </Pressable>
        </View>
        {files.map((file) => (
          <Pressable key={file.id} style={styles.file} disabled={busy} onPress={() => download(file)}>
            <View style={styles.badge}><Text style={styles.badgeText}>PDF</Text></View>
            <View style={styles.fileText}><Text numberOfLines={1} style={styles.fileTitle}>{file.name}</Text><Text style={styles.fileMeta}>{file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Google Drive'}</Text></View>
            <Text style={styles.download}>↓</Text>
          </Pressable>
        ))}
        {connected && files.length === 0 ? <Text style={styles.empty}>No app-visible PDFs. With drive.file, users must open or create a file through Iroha PDF before it appears here.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { padding: 18, gap: 10 },
  hero: { borderRadius: 19, padding: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E8EE' },
  heroTitle: { color: '#1A1F28', fontSize: 25, fontWeight: '800' },
  heroBody: { marginTop: 8, color: '#737B87', lineHeight: 20 },
  connect: { alignItems: 'center', marginTop: 18, borderRadius: 11, padding: 12, backgroundColor: '#2B5CFF' },
  connectText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.5 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 15, padding: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E9EE' },
  badge: { width: 40, height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EC' },
  badgeText: { color: '#D65339', fontSize: 10, fontWeight: '900' },
  fileText: { flex: 1 },
  fileTitle: { color: '#222730', fontWeight: '700' },
  fileMeta: { marginTop: 4, color: '#8A909A', fontSize: 11 },
  download: { color: '#2B5CFF', fontSize: 20, fontWeight: '800' },
  empty: { padding: 14, color: '#787F8A', lineHeight: 20 },
});
