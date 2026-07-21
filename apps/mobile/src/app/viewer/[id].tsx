import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
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
import {
  createId,
  deleteAnnotation,
  getDocument,
  listAnnotations,
  markDocumentOpened,
  saveAnnotation,
} from '@/lib/database';
import { createOutputPdf } from '@/lib/files';

type Tool = 'hand' | 'highlight' | 'ink' | 'text' | 'eraser';

const TOOL_COLORS = ['#2B5CFF', '#FFE45E', '#E24A3B', '#16835F'] as const;

function distanceToAnnotation(point: Point, annotation: PdfAnnotation): number {
  if (annotation.kind === 'ink') {
    return Math.min(...annotation.points.map((candidate) =>
      Math.hypot(candidate.x - point.x, candidate.y - point.y)));
  }
  if (annotation.kind === 'text') {
    return Math.hypot(annotation.position.x - point.x, annotation.position.y - point.y);
  }
  const nearestX = Math.max(annotation.position.x, Math.min(point.x, annotation.position.x + annotation.width));
  const nearestY = Math.max(annotation.position.y, Math.min(point.y, annotation.position.y + annotation.height));
  return Math.hypot(nearestX - point.x, nearestY - point.y);
}

export default function PdfViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [document, setDocument] = useState<WorkspaceDocument | null>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [tool, setTool] = useState<Tool>('hand');
  const [color, setColor] = useState<string>('#2B5CFF');
  const [strokeWidth, setStrokeWidth] = useState(2.4);
  const [overlaySize, setOverlaySize] = useState({ width: 1, height: 1 });
  const [pendingTextPoint, setPendingTextPoint] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [passwordPromptVisible, setPasswordPromptVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordAttempt, setPasswordAttempt] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const inkPoints = useRef<Point[]>([]);
  const [inkPreview, setInkPreview] = useState<Point[]>([]);
  const highlightStart = useRef<Point | null>(null);
  const highlightEnd = useRef<Point | null>(null);
  const [highlightPreview, setHighlightPreview] = useState<{ start: Point; end: Point } | null>(null);
  const [undoStack, setUndoStack] = useState<PdfAnnotation[]>([]);
  const [redoStack, setRedoStack] = useState<PdfAnnotation[]>([]);

  useEffect(() => {
    void Promise.all([getDocument(id), listAnnotations(id)]).then(async ([nextDocument, nextAnnotations]) => {
      setDocument(nextDocument);
      setAnnotations(nextAnnotations);
      if (nextDocument) {
        navigation.setOptions({ title: nextDocument.title });
        await markDocumentOpened(nextDocument.id);
      }
    }).catch((error: unknown) => {
      Alert.alert(
        'Local storage unavailable',
        error instanceof Error ? error.message : String(error),
      );
    });
  }, [id, navigation]);

  const visibleAnnotations = annotations.filter((annotation) => annotation.pageIndex === page - 1);

  const persist = async (annotation: PdfAnnotation, recordHistory = true) => {
    setAnnotations((current) => [...current, annotation]);
    await saveAnnotation(annotation);
    if (recordHistory) {
      setUndoStack((current) => [...current, annotation]);
      setRedoStack([]);
    }
  };

  const removeAnnotation = async (annotation: PdfAnnotation) => {
    setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
    await deleteAnnotation(annotation.id);
  };

  const undo = async () => {
    const annotation = undoStack.at(-1);
    if (!annotation) return;
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, annotation]);
    await removeAnnotation(annotation);
  };

  const redo = async () => {
    const annotation = redoStack.at(-1);
    if (!annotation) return;
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, annotation]);
    await persist({ ...annotation, updatedAt: new Date().toISOString() }, false);
  };

  const pointFromEvent = (x: number, y: number): Point => ({
    x: Math.min(1, Math.max(0, x / overlaySize.width)),
    y: Math.min(1, Math.max(0, y / overlaySize.height)),
  });

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => tool === 'ink' || tool === 'highlight',
      onMoveShouldSetPanResponder: () => tool === 'ink' || tool === 'highlight',
      onPanResponderGrant: (event) => {
        const point = pointFromEvent(event.nativeEvent.locationX, event.nativeEvent.locationY);
        if (tool === 'highlight') {
          highlightStart.current = point;
          highlightEnd.current = point;
          setHighlightPreview({ start: point, end: point });
        } else {
          inkPoints.current = [point];
          setInkPreview([point]);
        }
      },
      onPanResponderMove: (event) => {
        const point = pointFromEvent(event.nativeEvent.locationX, event.nativeEvent.locationY);
        if (tool === 'highlight' && highlightStart.current) {
          highlightEnd.current = point;
          setHighlightPreview({ start: highlightStart.current, end: point });
        } else {
          inkPoints.current = [...inkPoints.current, point];
          setInkPreview(inkPoints.current);
        }
      },
      onPanResponderRelease: () => {
        if (tool === 'highlight' && highlightStart.current && highlightEnd.current) {
          const now = new Date().toISOString();
          const x = Math.min(highlightStart.current.x, highlightEnd.current.x);
          const y = Math.min(highlightStart.current.y, highlightEnd.current.y);
          const width = Math.max(0.01, Math.abs(highlightEnd.current.x - highlightStart.current.x));
          const height = Math.max(0.01, Math.abs(highlightEnd.current.y - highlightStart.current.y));
          void persist({
            id: createId('annotation'), documentId: id, pageIndex: page - 1,
            kind: 'highlight', color, position: { x, y }, width, height,
            opacity: 0.42, createdAt: now, updatedAt: now,
          });
          highlightStart.current = null;
          highlightEnd.current = null;
          setHighlightPreview(null);
          return;
        }
        if (inkPoints.current.length >= 2) {
          const now = new Date().toISOString();
          void persist({
            id: createId('annotation'),
            documentId: id,
            pageIndex: page - 1,
            kind: 'ink',
            color,
            points: inkPoints.current,
            strokeWidth,
            createdAt: now,
            updatedAt: now,
          });
        }
        inkPoints.current = [];
        setInkPreview([]);
      },
    }),
    [color, id, overlaySize.height, overlaySize.width, page, strokeWidth, tool],
  );

  const addAtPoint = (point: Point) => {
    if (tool === 'eraser') {
      const nearest = visibleAnnotations
        .map((annotation) => ({ annotation, distance: distanceToAnnotation(point, annotation) }))
        .sort((left, right) => left.distance - right.distance)[0];
      if (nearest && nearest.distance < 0.08) void removeAnnotation(nearest.annotation);
      return;
    }
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
      color,
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
      color,
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolScroll} contentContainerStyle={styles.toolRow}>
          {(['hand', 'highlight', 'ink', 'text', 'eraser'] as const).map((item) => (
            <Pressable
              key={item}
              style={[styles.tool, tool === item && styles.activeTool]}
              onPress={() => setTool(item)}
            >
              <Text style={[styles.toolText, tool === item && styles.activeToolText]}>{item}</Text>
            </Pressable>
          ))}
          <Pressable disabled={undoStack.length === 0} style={styles.compactTool} onPress={() => void undo()}><Text>↶</Text></Pressable>
          <Pressable disabled={redoStack.length === 0} style={styles.compactTool} onPress={() => void redo()}><Text>↷</Text></Pressable>
        </ScrollView>
        <Pressable style={styles.textButton} onPress={exportCopy}><Text>Export</Text></Pressable>
        <Pressable style={styles.primaryButton} onPress={print}><Text style={styles.primaryText}>Print</Text></Pressable>
      </View>

      <View style={styles.viewer}>
        <Pdf
          key={reloadKey}
          source={{ uri: document.localUri, cache: true }}
          page={page}
          singlePage
          password={password || undefined}
          minScale={1}
          maxScale={5}
          trustAllCerts={false}
          onLoadProgress={(progress) => {
            setLoadingProgress(progress);
            setLoadError(null);
          }}
          onLoadComplete={(pages) => {
            setPageCount(pages);
            setLoadingProgress(1);
            setLoadError(null);
          }}
          onPageChanged={(currentPage) => setPage(currentPage)}
          onError={(error) => {
            const message = String(error);
            if (/password|encrypted/i.test(message)) {
              setPasswordAttempt('');
              setPasswordPromptVisible(true);
            } else {
              setLoadError(message);
            }
          }}
          style={styles.pdf}
        />
        {loadingProgress < 1 && !loadError ? (
          <View style={styles.viewerState} pointerEvents="none">
            <ActivityIndicator color="#2B5CFF" />
            <Text style={styles.viewerStateText}>
              Opening PDF… {Math.round(loadingProgress * 100)}%
            </Text>
          </View>
        ) : null}
        {loadError ? (
          <View style={styles.viewerState}>
            <Text style={styles.viewerErrorTitle}>This PDF could not be opened.</Text>
            <Text numberOfLines={4} style={styles.viewerErrorBody}>{loadError}</Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                setLoadError(null);
                setLoadingProgress(0);
                setReloadKey((value) => value + 1);
              }}
            >
              <Text style={styles.primaryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable
          pointerEvents={tool === 'hand' || loadingProgress < 1 || Boolean(loadError) ? 'none' : 'auto'}
          style={StyleSheet.absoluteFill}
          onLayout={(event) => setOverlaySize(event.nativeEvent.layout)}
          onPress={(event) => addAtPoint(pointFromEvent(event.nativeEvent.locationX, event.nativeEvent.locationY))}
          {...panResponder.panHandlers}
        >
          <Svg width="100%" height="100%" pointerEvents="none">
            {highlightPreview ? (
              <Rect
                x={`${Math.min(highlightPreview.start.x, highlightPreview.end.x) * 100}%`}
                y={`${Math.min(highlightPreview.start.y, highlightPreview.end.y) * 100}%`}
                width={`${Math.abs(highlightPreview.end.x - highlightPreview.start.x) * 100}%`}
                height={`${Math.abs(highlightPreview.end.y - highlightPreview.start.y) * 100}%`}
                fill={color}
                fillOpacity={0.42}
              />
            ) : null}
            {[...visibleAnnotations, ...(inkPreview.length > 1 ? [{
              id: 'preview', documentId: id, pageIndex: page - 1, kind: 'ink' as const,
              color, points: inkPreview, strokeWidth,
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

      {tool === 'ink' || tool === 'highlight' || tool === 'text' ? (
        <View style={styles.annotationOptions}>
          {TOOL_COLORS.map((item) => (
            <Pressable
              key={item}
              accessibilityLabel={`Annotation color ${item}`}
              style={[styles.colorSwatch, { backgroundColor: item }, color === item && styles.selectedSwatch]}
              onPress={() => setColor(item)}
            />
          ))}
          {tool === 'ink' ? [1.5, 2.4, 4].map((width) => (
            <Pressable key={width} style={[styles.strokeChoice, strokeWidth === width && styles.activeTool]} onPress={() => setStrokeWidth(width)}>
              <Text style={styles.strokeChoiceText}>{width}</Text>
            </Pressable>
          )) : null}
        </View>
      ) : null}

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

      <Modal visible={passwordPromptVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Password-protected PDF</Text>
            <Text style={styles.modalBody}>Enter the document password. It is used only to open this file and is not saved.</Text>
            <TextInput
              autoFocus
              secureTextEntry
              value={passwordAttempt}
              onChangeText={setPasswordAttempt}
              onSubmitEditing={() => {
                if (!passwordAttempt) return;
                setPassword(passwordAttempt);
                setPasswordPromptVisible(false);
                setLoadingProgress(0);
                setReloadKey((value) => value + 1);
              }}
              style={styles.modalInput}
              placeholder="Document password"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.textButton} onPress={() => setPasswordPromptVisible(false)}><Text>Cancel</Text></Pressable>
              <Pressable
                disabled={!passwordAttempt}
                style={[styles.primaryButton, !passwordAttempt && styles.disabledButton]}
                onPress={() => {
                  setPassword(passwordAttempt);
                  setPasswordPromptVisible(false);
                  setLoadingProgress(0);
                  setReloadKey((value) => value + 1);
                }}
              >
                <Text style={styles.primaryText}>Open</Text>
              </Pressable>
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
  toolScroll: { flex: 1 },
  toolRow: { gap: 5, paddingRight: 6 },
  tool: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#F0F1F4' },
  compactTool: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 7, backgroundColor: '#F0F1F4' },
  activeTool: { backgroundColor: '#E7EDFF' },
  toolText: { color: '#59606D', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  activeToolText: { color: '#2B5CFF' },
  textButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#ECEEF2' },
  primaryButton: { borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#2B5CFF' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  viewer: { flex: 1, margin: 8, overflow: 'hidden', borderRadius: 8, backgroundColor: '#FFFFFF' },
  pdf: { flex: 1, backgroundColor: '#FFFFFF' },
  viewerState: { position: 'absolute', zIndex: 2, top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: '#FFFFFF' },
  viewerStateText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  viewerErrorTitle: { color: '#252A34', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  viewerErrorBody: { color: '#717986', lineHeight: 19, textAlign: 'center' },
  pageBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 8, backgroundColor: '#FFFFFF' },
  annotationOptions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 7, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#ECEEF2' },
  colorSwatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#FFFFFF' },
  selectedSwatch: { borderColor: '#171B24', transform: [{ scale: 1.1 }] },
  strokeChoice: { borderRadius: 7, minWidth: 30, alignItems: 'center', padding: 5, backgroundColor: '#ECEEF2' },
  strokeChoiceText: { color: '#505865', fontSize: 10, fontWeight: '700' },
  pageButton: { color: '#2B5CFF', fontSize: 28, fontWeight: '500' },
  pageLabel: { color: '#5C6470', fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16,19,25,.45)' },
  modalCard: { width: '100%', borderRadius: 18, padding: 18, backgroundColor: '#FFFFFF' },
  modalTitle: { color: '#20252E', fontSize: 18, fontWeight: '800' },
  modalBody: { marginTop: 8, color: '#6D7480', lineHeight: 19 },
  modalInput: { marginVertical: 16, borderRadius: 10, borderWidth: 1, borderColor: '#DFE2E7', padding: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  disabledButton: { opacity: 0.45 },
});
