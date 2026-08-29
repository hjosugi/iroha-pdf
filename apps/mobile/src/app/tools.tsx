import { useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  extractPdfPages,
  imagesToPdf,
  mergePdfs,
  optimizePdfStructure,
  PageSelectionError,
  parsePageSelection,
  removePdfPages,
  reorderPdf,
  rotatePdfPages,
  type ImageInput,
} from '@iroha-pdf/core';
import { alertFailure } from '@/lib/alerts';
import { describeError } from '@/lib/errors';
import { baseName, createOutputPdf, sharePdf } from '@/lib/files';
import { t } from '@/lib/i18n';
import { COLOR, CONTROL, RADIUS, SPACE, TYPE } from '@/lib/theme';
import { markStoreCaptureReady } from '@/lib/store-capture-native';
import { ContentColumn } from '@/components/ContentColumn';

export default function PdfToolsScreen() {
  const [pageOrder, setPageOrder] = useState('1,2,3');
  const [selectedPages, setSelectedPages] = useState('1');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => markStoreCaptureReady('tools'), []);

  const run = async (name: string, operation: () => Promise<void>) => {
    try {
      setBusy(name);
      await operation();
    } catch (error) {
      alertFailure(t('tools.failed', { name }), error);
    } finally {
      setBusy(null);
    }
  };

  /**
   * The shape four of these tools share: ask for one PDF, rewrite its bytes,
   * and offer the result under a name derived from the original. A cancelled
   * picker is a silent no-op, not a failure.
   */
  const rewritePickedPdf = async (
    suffix: string,
    rewrite: (bytes: Uint8Array) => Promise<Uint8Array>,
  ) => {
    const input = await pickPdf();
    if (!input) return;
    const bytes = await rewrite(await input.file.bytes());
    await sharePdf(createOutputPdf(`${baseName(input.name)}-${suffix}.pdf`, bytes));
  };

  const imageToPdf = () => run(t('tools.imagesTitle'), async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 0,
      quality: 1,
    });
    if (result.canceled) return;

    const images: ImageInput[] = [];
    for (const [index, asset] of result.assets.entries()) {
      try {
        const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
        if (Math.max(asset.width, asset.height) > 2400) {
          context.resize(asset.width >= asset.height
            ? { width: 2400, height: null }
            : { width: null, height: 2400 });
        }
        const rendered = await context.renderAsync();
        const preserveTransparency = asset.mimeType === 'image/png';
        const compressed = await rendered.saveAsync({
          compress: preserveTransparency ? 1 : 0.82,
          format: preserveTransparency
            ? ImageManipulator.SaveFormat.PNG
            : ImageManipulator.SaveFormat.JPEG,
        });
        const file = new File(compressed.uri);
        images.push({
          bytes: await file.bytes(),
          mimeType: preserveTransparency ? 'image/png' : 'image/jpeg',
          width: compressed.width,
          height: compressed.height,
        });
      } catch (error) {
        const label = asset.fileName ?? asset.uri.split('/').pop() ?? `image ${index + 1}`;
        const reason = describeError(error);
        throw new Error(t('tools.imageFailed', { index: index + 1, name: label, reason }));
      }
    }

    const bytes = await imagesToPdf(images, { pageSize: 'a4', margin: 24 });
    await sharePdf(createOutputPdf('images.pdf', bytes));
  });

  const reorder = () => run(t('tools.reorderTitle'), async () => {
    const order = pageOrder.split(',').map((value) => Number.parseInt(value.trim(), 10) - 1);
    if (order.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error(t('tools.pageNumbers'));
    }
    await rewritePickedPdf('reordered', (bytes) => reorderPdf(bytes, order));
  });

  const merge = () => run(t('tools.mergeTitle'), async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return;
    if (result.assets.length < 2) throw new Error(t('tools.selectTwo'));
    const bytes = await mergePdfs(await Promise.all(
      result.assets.map((asset) => new File(asset.uri).bytes()),
    ));
    await sharePdf(createOutputPdf('merged.pdf', bytes));
  });

  const extract = () => run(t('tools.extract'), async () => {
    const pages = parseOneBasedPages(selectedPages);
    await rewritePickedPdf('extracted', (bytes) => extractPdfPages(bytes, pages));
  });

  const remove = () => run(t('tools.remove'), async () => {
    const pages = parseOneBasedPages(selectedPages);
    await rewritePickedPdf('pages-removed', (bytes) => removePdfPages(bytes, pages));
  });

  const rotate = () => run(t('tools.rotate'), async () => {
    const pages = parseOneBasedPages(selectedPages);
    await rewritePickedPdf('rotated', (bytes) => rotatePdfPages(bytes, pages, 90));
  });

  const safeOptimize = () => run(t('tools.optimizeTitle'), async () => {
    const input = await pickPdf();
    if (!input) return;
    const before = input.file.size;
    const bytes = await optimizePdfStructure(await input.file.bytes());
    const output = createOutputPdf(`${baseName(input.name)}-optimized.pdf`, bytes);
    Alert.alert(t('tools.optimized'), t('tools.optimizedBody', { before: formatBytes(before), after: formatBytes(output.size) }));
    await sharePdf(output);
  });

  const printPdf = () => run(t('print.open'), async () => {
    const input = await pickPdf();
    if (!input) return;
    await Print.printAsync({ uri: input.file.uri });
  });

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ContentColumn>
          <Text style={styles.intro}>{t('tools.intro')}</Text>
          <View style={styles.grid}>
            <ToolCard title={t('tools.imagesTitle')} description={t('tools.imagesDescription')} action={t('tools.chooseImages')} disabled={busy !== null} onPress={imageToPdf} />
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.cardTitle}>{t('tools.reorderTitle')}</Text>
              <Text style={styles.cardDescription}>{t('tools.reorderDescription')}</Text>
              <TextInput accessibilityLabel={t('tools.pageOrder')} value={pageOrder} onChangeText={setPageOrder} style={styles.input} placeholder="3,1,2" keyboardType="numbers-and-punctuation" />
              <Action label={t('tools.choosePdf')} disabled={busy !== null} onPress={reorder} />
            </View>
            <ToolCard title={t('tools.mergeTitle')} description={t('tools.mergeDescription')} action={t('tools.choosePdfs')} disabled={busy !== null} onPress={merge} />
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.cardTitle}>{t('tools.pagesTitle')}</Text>
              <Text style={styles.cardDescription}>{t('tools.pagesDescription')}</Text>
              <TextInput accessibilityLabel={t('tools.pagesLabel')} value={selectedPages} onChangeText={setSelectedPages} style={styles.input} placeholder="1-3,5" keyboardType="numbers-and-punctuation" />
              <View style={styles.actionRow}>
                <Action label={t('tools.extract')} disabled={busy !== null} onPress={extract} compact />
                <Action label={t('tools.remove')} disabled={busy !== null} onPress={remove} compact />
                <Action label={t('tools.rotate')} disabled={busy !== null} onPress={rotate} compact />
              </View>
            </View>
            <ToolCard title={t('tools.optimizeTitle')} description={t('tools.optimizeDescription')} action={t('tools.choosePdf')} disabled={busy !== null} onPress={safeOptimize} />
            <ToolCard title={t('print.open')} description={t('tools.printDescription')} action={t('tools.choosePdf')} disabled={busy !== null} onPress={printPdf} />
          </View>
          {busy ? (
            <View accessibilityRole="progressbar" accessibilityLabel={t('tools.working', { name: busy })} style={styles.busyRow}>
              <ActivityIndicator color="#2B5CFF" />
              <Text style={styles.busy}>{t('tools.working', { name: busy })}</Text>
            </View>
          ) : null}
        </ContentColumn>
      </ScrollView>
    </SafeAreaView>
  );
}

async function pickPdf(): Promise<{ file: File; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return asset ? { file: new File(asset.uri), name: asset.name } : null;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 KB';
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The shared reading of a typed page selection, said in this app's words.
 *
 * The syntax lived here and desktop was about to need the same one, so the
 * reading moved to core and the wording stayed. Core has no locale, so it reports
 * what went wrong and which fragment; the catalogue lookup belongs on this side.
 */
function parseOneBasedPages(value: string): number[] {
  try {
    return parsePageSelection(value);
  } catch (error) {
    if (!(error instanceof PageSelectionError)) throw error;
    switch (error.problem.reason) {
      case 'empty':
        throw new Error(t('tools.enterPage'));
      case 'not-a-range':
        throw new Error(t('tools.invalidRange', { value: error.problem.value }));
      case 'not-a-page':
        throw new Error(t('tools.invalidPage', { value: error.problem.value }));
    }
  }
}

function ToolCard(props: { title: string; description: string; action: string; onPress: () => void; disabled: boolean }) {
  return <View style={styles.card}><Text accessibilityRole="header" style={styles.cardTitle}>{props.title}</Text><Text style={styles.cardDescription}>{props.description}</Text><Action label={props.action} onPress={props.onPress} disabled={props.disabled} /></View>;
}

function Action({ label, onPress, disabled, compact = false }: { label: string; onPress: () => void; disabled: boolean; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={[styles.action, compact && styles.compactAction, disabled && styles.disabled]} onPress={onPress} disabled={disabled}><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.background },
  content: { padding: SPACE.xl, paddingBottom: CONTROL.comfortable },
  grid: { gap: SPACE.md },
  intro: { color: '#737B87', lineHeight: SPACE.xl, marginBottom: SPACE.xxs },
  card: { borderRadius: RADIUS.lg, padding: SPACE.lg, backgroundColor: COLOR.surface, borderWidth: SPACE.hairline, borderColor: '#E6E8ED' },
  cardTitle: { color: '#1E232C', fontSize: TYPE.heading, fontWeight: '800' },
  cardDescription: { marginTop: SPACE.sm, color: '#777E89', lineHeight: SPACE.xl },
  input: { marginTop: SPACE.md, borderRadius: RADIUS.md, padding: SPACE.md, backgroundColor: '#F4F5F7', color: '#262B34' },
  action: { minHeight: CONTROL.comfortable, alignItems: 'center', justifyContent: 'center', marginTop: SPACE.lg, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, backgroundColor: COLOR.brand },
  actionRow: { flexDirection: 'row', gap: SPACE.sm },
  compactAction: { flex: 1 },
  disabled: { opacity: 0.45 },
  actionText: { color: COLOR.surface, fontWeight: '800' },
  busyRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACE.sm, padding: SPACE.lg },
  busy: { color: COLOR.brand, fontWeight: '700' },
});
