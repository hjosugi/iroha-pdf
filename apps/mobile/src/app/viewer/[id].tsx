import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import {
  Alert,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Pdf from 'react-native-pdf';
import Svg, { Polyline, Rect, Text as SvgText } from 'react-native-svg';

import {
  flattenAnnotations,
  type PdfAnnotation,
  type Point,
  type WorkspaceDocument,
} from '@iroha-pdf/core';
import { createId, getDocument, listAnnotations, saveAnnotation } from '@/lib/database';
import { createOutputPdf } from '@/lib/files';

type Tool = 'hand' | 'highlight' | 'ink' | 'text';

export default function PdfViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [document, setDocument] = useState<WorkspaceDocument | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [tool, setTool] = useState<Tool>('hand');
  const [overlaySize, setOverlaySize] = useState({ width: 1, height: 1 });
  const [pendingTextPoint, setPendingTextPoint] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState('');
  const inkPoints = useRef<Point[]>([]);
  const [inkPreview, setInkPreview] = useState<Point[]>([]);

  useEffect(() => {
    void Promise.all([getDocument(id), listAnnotations(id)]).then(([nextDocument, nextAnnotations]) => {
      setDocument(nextDocument);
      setAnnotations(nextAnnotations);
      if (nextDocument) navigation.setOptions({ title: nextDocument.title });
    });
  }, [id, navigation]);

  const visibleAnnotations = annotations.filter((annotation) => annotation.pageIndex === page - 1);

  const persist = async (annotation: PdfAnnotation) => {
    setAnnotations((current) => [...current, annotation]);
    await saveAnnotation(annotation);
  };

  const pointFromEvent = (x: number, y: number): Point => ({
    x: Math.min(1, Math.max(0, x / overlaySize.width)),
    y: Math.min(1, Math.max(0, y / overlaySize.height)),
  });

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => tool === 'ink',
      onMoveShouldSetPanResponder: () => tool === 'ink',
      onPanResponderGrant: (event) => {
        const point = pointFromEvent(event.nativeEvent.locationX, event.nativeEvent.locationY);
        inkPoints.current = [point];
        setInkPreview([point]);
      },
      onPanResponderMove: (event) => {
        const point = pointFromEvent(event.nativeEvent.locationX, event.nativeEvent.locationY);
        inkPoints.current = [...inkPoints.current, point];
        setInkPreview(inkPoints.current);
      },
      onPanResponderRelease: () => {
        if (inkPoints.current.length >= 2) {
          const now = new Date().toISOString();
          void persist({
            id: createId('annotation'),
            documentId: id,
            pageIndex: page - 1,
            kind: 'ink',
            color: '#2B5CFF',
            points: inkPoints.current,
            strokeWidth: 2.4,
            createdAt: now,
            updatedAt: now,
          });
        }
        inkPoints.current = [];
        setInkPreview([]);
      },
    }),
    [id, overlaySize.height, overlaySize.width, page, tool],
  );

  const addAtPoint = (point: Point) => {
    if (tool === 'text') {
      setPendingTextPoint(point);
      setTextValue('');
      return;
    }
    if (tool !== 'highlight') return;
    const now = new Date().toISOString();
    void persist({
      id: createId('annotation'),
      documentId: id,
      pageIndex: page - 1,
      kind: 'highlight',
      color: '#FFE45E',
      position: { x: Math.min(0.74, point.x), y: Math.min(0.96, point.y) },
      width: 0.25,
      height: 0.035,
      opacity: 0.42,
      createdAt: now,
      updatedAt: now,
    });
  };

  const confirmText = () => {
    if (!pendingTextPoint || !textValue.trim()) {
      setPendingTextPoint(null);
      return;
    }
    const now = new Date().toISOString();
    void persist({
      id: createId('annotation'),
      documentId: id,
      pageIndex: page - 1,
      kind: 'text',
      color: '#1B1F28',
      position: pendingTextPoint,
      text: textValue.trim(),
      fontSize: 14,
      createdAt: now,
      updatedAt: now,
    });
    setPendingTextPoint(null);
  };

  const createFlattenedCopy = async (): Promise<File> => {
    if (!document) throw new Error('Document is not loaded');
    const source = await new File(document.localUri).bytes();
    const output = await flattenAnnotations(source, annotations);
    return createOutputPdf(`${document.title}-edited.pdf`, output);
  };

  const exportCopy = async () => {
    try {
      const output = await createFlattenedCopy();
      await Sharing.shareAsync(output.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : String(error));
    }
  };

  const print = async () => {
    try {
      const output = await createFlattenedCopy();
      await Print.printAsync({ uri: output.uri });
    } catch (error) {
      Alert.alert('Print failed', error instanceof Error ? error.message : String(error));
    }
  };

  if (!document) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.toolbar}>
        {(['hand', 'highlight', 'ink', 'text'] as const).map((item) => (
          <Pressable
            key={item}
            style={[styles.tool, tool === item && styles.activeTool]}
            onPress={() => setTool(item)}
          >
            <Text style={[styles.toolText, tool === item && styles.activeToolText]}>{item}</Text>
          </Pressable>
        ))}
        <View style={styles.spacer} />
        <Pressable style={styles.textButton} onPress={exportCopy}><Text>Export</Text></Pressable>
        <Pressable style={styles.primaryButton} onPress={print}><Text style={styles.primaryText}>Print</Text></Pressable>
      </View>

      <View style={styles.viewer}>
        <Pdf
          source={{ uri: document.localUri, cache: true }}
          page={page}
          singlePage
          trustAllCerts={false}
          onLoadComplete={(pages) => setPageCount(pages)}
          onPageChanged={(currentPage) => setPage(currentPage)}
          onError={(error) => Alert.alert('PDF error', String(error))}
          style={styles.pdf}
        />
        <Pressable
          pointerEvents={tool === 'hand' ? 'none' : 'auto'}
          style={StyleSheet.absoluteFill}
          onLayout={(event) => setOverlaySize(event.nativeEvent.layout)}
          onPress={(event) => addAtPoint(pointFromEvent(event.nativeEvent.locationX, event.nativeEvent.locationY))}
          {...panResponder.panHandlers}
        >
          <Svg width="100%" height="100%" pointerEvents="none">
            {[...visibleAnnotations, ...(inkPreview.length > 1 ? [{
              id: 'preview', documentId: id, pageIndex: page - 1, kind: 'ink' as const,
              color: '#2B5CFF', points: inkPreview, strokeWidth: 2.4,
              createdAt: '', updatedAt: '',
            }] : [])].map((annotation) => {
              if (annotation.kind === 'highlight') {
                return <Rect key={annotation.id} x={`${annotation.position.x * 100}%`} y={`${annotation.position.y * 100}%`} width={`${annotation.width * 100}%`} height={`${annotation.height * 100}%`} fill={annotation.color} fillOpacity={annotation.opacity} />;
              }
              if (annotation.kind === 'text') {
                return <SvgText key={annotation.id} x={`${annotation.position.x * 100}%`} y={`${annotation.position.y * 100}%`} fill={annotation.color} fontSize={annotation.fontSize}>{annotation.text}</SvgText>;
              }
              return <Polyline key={annotation.id} points={annotation.points.map((point) => `${point.x * overlaySize.width},${point.y * overlaySize.height}`).join(' ')} fill="none" stroke={annotation.color} strokeWidth={annotation.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
            })}
          </Svg>
        </Pressable>
      </View>

      <View style={styles.pageBar}>
        <Pressable disabled={page <= 1} onPress={() => setPage((value) => Math.max(1, value - 1))}><Text style={styles.pageButton}>‹</Text></Pressable>
        <Text style={styles.pageLabel}>{page} / {pageCount}</Text>
        <Pressable disabled={page >= pageCount} onPress={() => setPage((value) => Math.min(pageCount, value + 1))}><Text style={styles.pageButton}>›</Text></Pressable>
      </View>

      <Modal visible={pendingTextPoint !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add text</Text>
            <TextInput autoFocus value={textValue} onChangeText={setTextValue} style={styles.modalInput} placeholder="Text on PDF" />
            <View style={styles.modalActions}>
              <Pressable style={styles.textButton} onPress={() => setPendingTextPoint(null)}><Text>Cancel</Text></Pressable>
              <Pressable style={styles.primaryButton} onPress={confirmText}><Text style={styles.primaryText}>Add</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E2E4E8' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E3E5E9' },
  tool: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#F0F1F4' },
  activeTool: { backgroundColor: '#E7EDFF' },
  toolText: { color: '#59606D', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  activeToolText: { color: '#2B5CFF' },
  spacer: { flex: 1 },
  textButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#ECEEF2' },
  primaryButton: { borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#2B5CFF' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  viewer: { flex: 1, margin: 8, overflow: 'hidden', borderRadius: 8, backgroundColor: '#FFFFFF' },
  pdf: { flex: 1, backgroundColor: '#FFFFFF' },
  pageBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 8, backgroundColor: '#FFFFFF' },
  pageButton: { color: '#2B5CFF', fontSize: 28, fontWeight: '500' },
  pageLabel: { color: '#5C6470', fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16,19,25,.45)' },
  modalCard: { width: '100%', borderRadius: 18, padding: 18, backgroundColor: '#FFFFFF' },
  modalTitle: { color: '#20252E', fontSize: 18, fontWeight: '800' },
  modalInput: { marginVertical: 16, borderRadius: 10, borderWidth: 1, borderColor: '#DFE2E7', padding: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
