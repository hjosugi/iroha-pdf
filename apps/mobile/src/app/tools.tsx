import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  extractPdfPages,
  imagesToPdf,
  mergePdfs,
  optimizePdfStructure,
  removePdfPages,
  reorderPdf,
  rotatePdfPages,
  type ImageInput,
} from '@iroha-pdf/core';
import { createOutputPdf } from '@/lib/files';

export default function PdfToolsScreen() {
  const [pageOrder, setPageOrder] = useState('1,2,3');
  const [selectedPages, setSelectedPages] = useState('1');
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (name: string, operation: () => Promise<void>) => {
    try {
      setBusy(name);
      await operation();
    } catch (error) {
      Alert.alert(`${name} failed`, error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const imageToPdf = () => run('Image to PDF', async () => {
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
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not process image ${index + 1} (${label}): ${reason}`);
      }
    }

    const bytes = await imagesToPdf(images, { pageSize: 'a4', margin: 24 });
    const output = createOutputPdf('images.pdf', bytes);
    await Sharing.shareAsync(output.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });

  const reorder = () => run('Reorder pages', async () => {
    const input = await pickPdf();
    if (!input) return;
    const order = pageOrder.split(',').map((value) => Number.parseInt(value.trim(), 10) - 1);
    if (order.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error('Use one-based page numbers such as 3,1,2');
    }
    const bytes = await reorderPdf(await input.file.bytes(), order);
    const output = createOutputPdf(`${input.name.replace(/\.pdf$/i, '')}-reordered.pdf`, bytes);
    await Sharing.shareAsync(output.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });

  const merge = () => run('Merge PDFs', async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return;
    if (result.assets.length < 2) throw new Error('Select at least two PDFs');
    const bytes = await mergePdfs(await Promise.all(
      result.assets.map((asset) => new File(asset.uri).bytes()),
    ));
    const output = createOutputPdf('merged.pdf', bytes);
    await Sharing.shareAsync(output.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });

  const extract = () => run('Extract pages', async () => {
    const input = await pickPdf();
    if (!input) return;
    const pages = parseOneBasedPages(selectedPages);
    const bytes = await extractPdfPages(await input.file.bytes(), pages);
    const output = createOutputPdf(`${baseName(input.name)}-extracted.pdf`, bytes);
    await Sharing.shareAsync(output.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });

  const remove = () => run('Remove pages', async () => {
    const input = await pickPdf();
    if (!input) return;
    const pages = parseOneBasedPages(selectedPages);
    const bytes = await removePdfPages(await input.file.bytes(), pages);
    const output = createOutputPdf(`${baseName(input.name)}-pages-removed.pdf`, bytes);
    await Sharing.shareAsync(output.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });

  const rotate = () => run('Rotate pages', async () => {
    const input = await pickPdf();
    if (!input) return;
    const pages = parseOneBasedPages(selectedPages);
    const bytes = await rotatePdfPages(await input.file.bytes(), pages, 90);
    const output = createOutputPdf(`${baseName(input.name)}-rotated.pdf`, bytes);
    await Sharing.shareAsync(output.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });

  const safeOptimize = () => run('Safe optimize', async () => {
    const input = await pickPdf();
    if (!input) return;
    const before = input.file.size;
    const bytes = await optimizePdfStructure(await input.file.bytes());
    const output = createOutputPdf(`${input.name.replace(/\.pdf$/i, '')}-optimized.pdf`, bytes);
    Alert.alert('Optimization complete', `${formatBytes(before)} → ${formatBytes(output.size)}\nThis structural rewrite may produce the same size or a larger file. It preserves text and images and does not downsample images.`);
    await Sharing.shareAsync(output.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  });

  const printPdf = () => run('Print', async () => {
    const input = await pickPdf();
    if (!input) return;
    await Print.printAsync({ uri: input.file.uri });
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>All basic processing stays on this device. Originals are never overwritten.</Text>
        <ToolCard title="Images → PDF" description="Select multiple images, resize large photos, compress to JPEG, and create an A4 PDF." action="Choose images" disabled={busy !== null} onPress={imageToPdf} />
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reorder pages</Text>
          <Text style={styles.cardDescription}>Enter the output order using one-based page numbers. Repeating a page duplicates it.</Text>
          <TextInput value={pageOrder} onChangeText={setPageOrder} style={styles.input} placeholder="3,1,2" />
          <Action label="Choose PDF" disabled={busy !== null} onPress={reorder} />
        </View>
        <ToolCard title="Merge PDFs" description="Select two or more PDFs. Pages are copied in the selected file order without changing the originals." action="Choose PDFs" disabled={busy !== null} onPress={merge} />
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Page operations</Text>
          <Text style={styles.cardDescription}>Enter page numbers or ranges, such as 1-3,5. Then extract, remove, or rotate those pages.</Text>
          <TextInput value={selectedPages} onChangeText={setSelectedPages} style={styles.input} placeholder="1-3,5" />
          <View style={styles.actionRow}>
            <Action label="Extract" disabled={busy !== null} onPress={extract} compact />
            <Action label="Remove" disabled={busy !== null} onPress={remove} compact />
            <Action label="Rotate 90°" disabled={busy !== null} onPress={rotate} compact />
          </View>
        </View>
        <ToolCard title="Safe PDF optimization" description="Rewrites PDF object streams without rasterizing pages. Results vary because embedded images remain unchanged." action="Choose PDF" disabled={busy !== null} onPress={safeOptimize} />
        <ToolCard title="Print" description="Open the native iOS or Android print dialog for a selected PDF." action="Choose PDF" disabled={busy !== null} onPress={printPdf} />
        {busy ? <Text style={styles.busy}>Working: {busy}…</Text> : null}
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

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

function parseOneBasedPages(value: string): number[] {
  const pages: number[] = [];
  for (const part of value.split(',').map((item) => item.trim()).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < start) throw new Error(`Invalid page range: ${part}`);
      for (let page = start; page <= end; page += 1) pages.push(page - 1);
      continue;
    }
    const page = Number(part);
    if (!Number.isInteger(page) || page < 1) throw new Error(`Invalid page number: ${part}`);
    pages.push(page - 1);
  }
  if (pages.length === 0) throw new Error('Enter at least one page');
  return pages;
}

function ToolCard(props: { title: string; description: string; action: string; onPress: () => void; disabled: boolean }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{props.title}</Text><Text style={styles.cardDescription}>{props.description}</Text><Action label={props.action} onPress={props.onPress} disabled={props.disabled} /></View>;
}

function Action({ label, onPress, disabled, compact = false }: { label: string; onPress: () => void; disabled: boolean; compact?: boolean }) {
  return <Pressable style={[styles.action, compact && styles.compactAction, disabled && styles.disabled]} onPress={onPress} disabled={disabled}><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { padding: 18, gap: 12, paddingBottom: 50 },
  intro: { color: '#737B87', lineHeight: 20, marginBottom: 3 },
  card: { borderRadius: 17, padding: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E8ED' },
  cardTitle: { color: '#1E232C', fontSize: 16, fontWeight: '800' },
  cardDescription: { marginTop: 6, color: '#777E89', lineHeight: 19 },
  input: { marginTop: 12, borderRadius: 10, padding: 11, backgroundColor: '#F4F5F7', color: '#262B34' },
  action: { alignItems: 'center', marginTop: 14, borderRadius: 10, padding: 11, backgroundColor: '#2B5CFF' },
  actionRow: { flexDirection: 'row', gap: 8 },
  compactAction: { flex: 1 },
  disabled: { opacity: 0.45 },
  actionText: { color: '#FFFFFF', fontWeight: '800' },
  busy: { textAlign: 'center', color: '#2B5CFF', fontWeight: '700' },
});
