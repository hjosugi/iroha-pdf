import { Asset } from 'expo-asset';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { Note, PdfAnnotation, WorkspaceDocument } from '@iroha-pdf/core';
import { saveAnnotation, saveDocument, saveNote } from '@/lib/database';
import { describeError } from '@/lib/errors';
import { parseStoreCaptureScenario } from '@/lib/store-capture';
import {
  clearStoreCaptureScenario,
  markStoreCaptureRoute,
  readStoreCaptureScenario,
} from '@/lib/store-capture-native';
import { COLOR, SPACE, TYPE } from '@/lib/theme';

const ENABLED = process.env.EXPO_PUBLIC_STORE_SCREENSHOTS === '1';
const DOCUMENT_ID = 'store-fixture-project-handoff';
const FIXED_AT = '2026-01-15T09:41:00.000Z';

export default function StorePreviewScreen() {
  const router = useRouter();
  const { screen } = useLocalSearchParams<{ screen?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ENABLED) return;
    const scenario = parseStoreCaptureScenario(screen) ?? readStoreCaptureScenario() ?? 'library';
    // Clear only after this route has mounted. Clearing in the index route lets
    // a Redirect re-render switch back to LibraryScreen before navigation wins.
    markStoreCaptureRoute(scenario);
    clearStoreCaptureScenario();
    void seedStoreFixture()
      .then(() => {
        if (scenario === 'viewer') {
          router.replace({ pathname: '/viewer/[id]', params: { id: DOCUMENT_ID } });
        } else if (scenario === 'tools') {
          router.replace('/tools');
        } else if (scenario === 'drive') {
          router.replace('/drive');
        } else {
          router.replace('/');
        }
      })
      .catch((reason: unknown) => setError(describeError(reason)));
  }, [router, screen]);

  if (!ENABLED) return <Redirect href="/" />;

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.errorTitle}>Store fixture failed</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </>
      ) : (
        <>
          <ActivityIndicator color="#2B5CFF" />
          <Text style={styles.loading}>Preparing synthetic store content…</Text>
        </>
      )}
    </View>
  );
}

async function seedStoreFixture(): Promise<void> {
  const asset = Asset.fromModule(require('../../assets/store/iroha-demo.pdf'));
  await asset.downloadAsync();
  const localUri = asset.localUri ?? asset.uri;
  if (!localUri) throw new Error('The synthetic PDF asset has no local URI');

  const documents: WorkspaceDocument[] = [
    {
      id: DOCUMENT_ID,
      title: 'Project handoff',
      localUri,
      mimeType: 'application/pdf',
      source: 'local',
      pageCount: 2,
      sizeBytes: 184_320,
      modifiedAt: FIXED_AT,
    },
    {
      id: 'store-fixture-research-notes',
      title: 'Research notes',
      localUri,
      mimeType: 'application/pdf',
      source: 'icloud',
      pageCount: 2,
      sizeBytes: 92_160,
      modifiedAt: '2026-01-14T15:10:00.000Z',
    },
  ];
  const notes: Note[] = [
    {
      id: 'store-fixture-note-release',
      title: 'Release checklist',
      body: 'Review annotations, export a copy, and confirm the privacy link.',
      linkedDocumentId: DOCUMENT_ID,
      createdAt: FIXED_AT,
      updatedAt: FIXED_AT,
    },
    {
      id: 'store-fixture-note-follow-up',
      title: 'Follow-up',
      body: 'Share the final PDF after the review is complete.',
      createdAt: '2026-01-14T15:10:00.000Z',
      updatedAt: '2026-01-14T15:10:00.000Z',
    },
  ];
  const annotations: PdfAnnotation[] = [
    {
      id: 'store-fixture-highlight',
      documentId: DOCUMENT_ID,
      pageIndex: 0,
      kind: 'highlight',
      color: '#FFE45E',
      position: { x: 0.18, y: 0.45 },
      width: 0.54,
      height: 0.035,
      opacity: 0.42,
      createdAt: FIXED_AT,
      updatedAt: FIXED_AT,
    },
    {
      id: 'store-fixture-ink',
      documentId: DOCUMENT_ID,
      pageIndex: 0,
      kind: 'ink',
      color: '#2B5CFF',
      points: [
        { x: 0.17, y: 0.69 },
        { x: 0.29, y: 0.71 },
        { x: 0.42, y: 0.69 },
        { x: 0.57, y: 0.71 },
      ],
      strokeWidth: 2.4,
      createdAt: FIXED_AT,
      updatedAt: FIXED_AT,
    },
    {
      id: 'store-fixture-text',
      documentId: DOCUMENT_ID,
      pageIndex: 0,
      kind: 'text',
      color: '#16835F',
      position: { x: 0.64, y: 0.79 },
      text: 'Ready to share',
      fontSize: TYPE.body,
      createdAt: FIXED_AT,
      updatedAt: FIXED_AT,
    },
  ];

  for (const document of documents) await saveDocument(document);
  // Note and annotation writes use the recovery journal and therefore each own
  // a SQLite transaction. Keep them sequential so the screenshot seed cannot
  // create overlapping transactions on a cold simulator.
  for (const note of notes) await saveNote(note);
  for (const annotation of annotations) await saveAnnotation(annotation);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
    padding: SPACE.xxl,
    backgroundColor: COLOR.background,
  },
  loading: { color: '#6D7480', fontWeight: '600' },
  errorTitle: { color: '#A12A22', fontSize: TYPE.heading, fontWeight: '800' },
  errorBody: { color: '#6D3A36', lineHeight: SPACE.xl, textAlign: 'center' },
});
