import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { WorkspaceDocument } from '@iroha-pdf/core';
import { saveDocument } from '@/lib/database';
import { COLOR, SPACE, TYPE } from '@/lib/theme';

const ENABLED = process.env.EXPO_PUBLIC_DEVICE_EVIDENCE === '1';
export const DEVICE_EVIDENCE_DOCUMENT_ID = 'device-evidence-large-pdf';

export default function DeviceEvidenceScreen() {
  const router = useRouter();
  const { url } = useLocalSearchParams<{ url?: string }>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ENABLED) return;
    if (!url || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
      setError('The device-evidence PDF URL must use the ADB-reversed loopback interface.');
      return;
    }

    const directory = new Directory(Paths.document, 'iroha-pdf', 'documents');
    if (!directory.exists) directory.create({ intermediates: true });
    const destination = new File(directory, `${DEVICE_EVIDENCE_DOCUMENT_ID}.pdf`);

    void File.downloadFileAsync(url, destination, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) setProgress(bytesWritten / totalBytes);
      },
    }).then(async (downloaded) => {
      const document: WorkspaceDocument = {
        id: DEVICE_EVIDENCE_DOCUMENT_ID,
        title: 'Low-memory 500-page evidence',
        localUri: downloaded.uri,
        mimeType: 'application/pdf',
        source: 'local',
        pageCount: 500,
        sizeBytes: downloaded.size,
        modifiedAt: '2026-08-02T00:00:00.000Z',
      };
      await saveDocument(document);
      router.replace({ pathname: '/viewer/[id]', params: { id: document.id } });
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [router, url]);

  if (!ENABLED) return <Redirect href="/" />;

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text accessibilityRole="header" style={styles.errorTitle}>Device evidence failed</Text>
          <Text style={styles.body}>{error}</Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={COLOR.brand} />
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Downloading the 300 MiB fixture… {Math.round(progress * 100)}%
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.md, padding: SPACE.xxl, backgroundColor: COLOR.background },
  body: { color: COLOR.muted, textAlign: 'center' },
  errorTitle: { color: '#A12A22', fontSize: TYPE.heading, fontWeight: '800' },
});
