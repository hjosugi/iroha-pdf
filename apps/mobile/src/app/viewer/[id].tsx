import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import * as Print from 'expo-print';
import { File } from 'expo-file-system';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import Svg, { Polyline, Rect, Text as SvgText } from 'react-native-svg';

import {
  flattenAnnotations,
  type PdfAnnotation,
  type Point,
  type WorkspaceDocument,
} from '@iroha-pdf/core';
import { loadAnnotationFont } from '../../lib/annotation-font';
import { alertFailure } from '@/lib/alerts';
import {
  createId,
  deleteAnnotation,
  getDocument,
  listAnnotations,
  markDocumentOpened,
  saveAnnotation,
} from '@/lib/database';
import { createOutputPdf, sharePdf } from '@/lib/files';
import { t } from '@/lib/i18n';
import { markStoreCaptureReady } from '@/lib/store-capture-native';

/** Source of truth for the tool set: the toolbar renders it and `Tool` derives from it. */
const TOOLS = ['hand', 'highlight', 'ink', 'text', 'eraser'] as const;

type Tool = (typeof TOOLS)[number];

const TOOL_COLORS = ['#2B5CFF', '#FFE45E', '#E24A3B', '#16835F'] as const;

function toolLabel(tool: Tool): string {
  switch (tool) {
    case 'hand': return t('edit.hand');
    case 'highlight': return t('edit.highlight');
    case 'ink': return t('edit.pen');
    case 'text': return t('edit.text');
    case 'eraser': return t('edit.eraser');
  }
}

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
  const [documentLoaded, setDocumentLoaded] = useState(false);
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
  const [busyAction, setBusyAction] = useState<'export' | 'print' | null>(null);

  useEffect(() => {
    void Promise.all([getDocument(id), listAnnotations(id)]).then(async ([nextDocument, nextAnnotations]) => {
      setDocument(nextDocument);
      setAnnotations(nextAnnotations);
      if (nextDocument) {
        navigation.setOptions({ title: nextDocument.title });
        await markDocumentOpened(nextDocument.id);
      }
    }).catch((error: unknown) => {
      alertFailure(t('error.storage'), error);
    }).finally(() => setDocumentLoaded(true));
  }, [id, navigation]);

  const visibleAnnotations = annotations.filter((annotation) => annotation.pageIndex === page - 1);

  const persist = async (annotation: PdfAnnotation, recordHistory = true): Promise<boolean> => {
    try {
      await saveAnnotation(annotation);
      setAnnotations((current) => [...current.filter((item) => item.id !== annotation.id), annotation]);
      if (recordHistory) {
        setUndoStack((current) => [...current, annotation]);
        setRedoStack([]);
      }
      return true;
    } catch (error) {
      alertFailure(t('edit.annotationSaveFailed'), error);
      return false;
    }
  };

  const removeAnnotation = async (annotation: PdfAnnotation): Promise<boolean> => {
    try {
      await deleteAnnotation(annotation.id);
      setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
      return true;
    } catch (error) {
      alertFailure(t('edit.annotationDeleteFailed'), error);
      return false;
    }
  };

  /**
   * Identity, placement and timestamps for a new mark. Every tool fills in the
   * same six fields before its own geometry, and they must agree about which
   * page and colour the stroke belongs to.
   */
  const newMark = () => {
    const now = new Date().toISOString();
    return {
      id: createId('annotation'),
      documentId: id,
      pageIndex: page - 1,
      color,
      createdAt: now,
      updatedAt: now,
    };
  };

  const undo = async () => {
    const annotation = undoStack.at(-1);
    if (!annotation) return;
    if (await removeAnnotation(annotation)) {
      setUndoStack((current) => current.slice(0, -1));
      setRedoStack((current) => [...current, annotation]);
    }
  };

  const redo = async () => {
    const annotation = redoStack.at(-1);
    if (!annotation) return;
    if (await persist({ ...annotation, updatedAt: new Date().toISOString() }, false)) {
      setRedoStack((current) => current.slice(0, -1));
      setUndoStack((current) => [...current, annotation]);
    }
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
          const x = Math.min(highlightStart.current.x, highlightEnd.current.x);
          const y = Math.min(highlightStart.current.y, highlightEnd.current.y);
          const width = Math.max(0.01, Math.abs(highlightEnd.current.x - highlightStart.current.x));
          const height = Math.max(0.01, Math.abs(highlightEnd.current.y - highlightStart.current.y));
          void persist({
            ...newMark(),
            kind: 'highlight', position: { x, y }, width, height, opacity: 0.42,
          });
          highlightStart.current = null;
          highlightEnd.current = null;
          setHighlightPreview(null);
          return;
        }
        if (inkPoints.current.length >= 2) {
          void persist({
            ...newMark(),
            kind: 'ink',
            points: inkPoints.current,
            strokeWidth,
          });
        }
        inkPoints.current = [];
        setInkPreview([]);
      },
    }),
    // `newMark` and `persist` are fresh closures each render, but they only
    // read `id`, `page` and `color`, which are listed here — so a responder
    // held across renders never writes to the wrong page or in a stale colour.
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
    void persist({
      ...newMark(),
      kind: 'highlight',
      position: { x: Math.min(0.74, point.x), y: Math.min(0.96, point.y) },
      width: 0.25,
      height: 0.035,
      opacity: 0.42,
    });
  };

  const confirmText = () => {
    if (!pendingTextPoint || !textValue.trim()) {
      setPendingTextPoint(null);
      return;
    }
    void persist({
      ...newMark(),
      kind: 'text',
      position: pendingTextPoint,
      text: textValue.trim(),
      fontSize: 14,
    });
    setPendingTextPoint(null);
  };

  const createFlattenedCopy = async (): Promise<File> => {
    if (!document) throw new Error(t('document.notFound'));
    const source = await new File(document.localUri).bytes();
    // Loaded only when there is text to draw: the face is several megabytes and
    // highlight- or ink-only exports have no glyphs to encode.
    const textFont = annotations.some((item) => item.kind === 'text')
      ? await loadAnnotationFont()
      : undefined;
    const output = await flattenAnnotations(source, annotations, { textFont });
    return createOutputPdf(`${document.title}-edited.pdf`, output);
  };

  /**
   * Both toolbar actions flatten the annotations into a copy and then hand it
   * somewhere; the flattening is the slow part, and it is what the toolbar
   * disables itself for.
   */
  const deliverFlattenedCopy = async (
    action: 'export' | 'print',
    failureTitle: string,
    deliver: (output: File) => Promise<void>,
  ) => {
    try {
      setBusyAction(action);
      await deliver(await createFlattenedCopy());
    } catch (error) {
      alertFailure(failureTitle, error);
    } finally {
      setBusyAction(null);
    }
  };

  const exportCopy = () => deliverFlattenedCopy('export', t('error.export'), sharePdf);

  const print = () => deliverFlattenedCopy('print', t('print.failed'), (output) =>
    Print.printAsync({ uri: output.uri }));

  /**
   * `react-native-pdf` reads its source once per mount, so re-opening a file —
   * after a failure, or now that a password is known — means giving it a new key.
   */
  const reloadDocument = () => {
    setLoadingProgress(0);
    setReloadKey((value) => value + 1);
  };

  const applyPassword = () => {
    if (!passwordAttempt) return;
    setPassword(passwordAttempt);
    setPasswordPromptVisible(false);
    reloadDocument();
  };

  if (!documentLoaded) {
    return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}><View accessibilityRole="progressbar" accessibilityLabel={t('document.loading')} style={styles.fullState}><ActivityIndicator color="#2B5CFF" /></View></SafeAreaView>;
  }

  if (!document) {
    return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}><View style={styles.fullState}><Text accessibilityRole="header" style={styles.viewerErrorTitle}>{t('document.notFound')}</Text><Text style={styles.viewerErrorBody}>{t('document.removed')}</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolScroll} contentContainerStyle={styles.toolRow}>
          {TOOLS.map((item) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('edit.annotationTool', { name: toolLabel(item) })}
              accessibilityState={{ selected: tool === item }}
              key={item}
              style={[styles.tool, tool === item && styles.activeTool]}
              onPress={() => setTool(item)}
            >
              <Text style={[styles.toolText, tool === item && styles.activeToolText]}>{toolLabel(item)}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel={t('edit.undoLabel')} accessibilityState={{ disabled: undoStack.length === 0 }} disabled={undoStack.length === 0} style={[styles.compactTool, undoStack.length === 0 && styles.disabledButton]} onPress={() => void undo()}><Text>↶</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('edit.redoLabel')} accessibilityState={{ disabled: redoStack.length === 0 }} disabled={redoStack.length === 0} style={[styles.compactTool, redoStack.length === 0 && styles.disabledButton]} onPress={() => void redo()}><Text>↷</Text></Pressable>
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel={t('document.exportLabel')} accessibilityState={{ disabled: busyAction !== null }} disabled={busyAction !== null} style={[styles.textButton, busyAction !== null && styles.disabledButton]} onPress={() => void exportCopy()}><Text>{t(busyAction === 'export' ? 'document.exporting' : 'document.export')}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('print.open')} accessibilityState={{ disabled: busyAction !== null }} disabled={busyAction !== null} style={[styles.primaryButton, busyAction !== null && styles.disabledButton]} onPress={() => void print()}><Text style={styles.primaryText}>{t(busyAction === 'print' ? 'print.preparing' : 'print.open')}</Text></Pressable>
      </View>

      <View style={styles.viewer}>
        {/*
          `singlePage` looks like the right prop for a one-page-at-a-time viewer, but it
          makes the library report a page count of 1 for every document, which left the
          next-page button permanently disabled and page 2 unreachable. `enablePaging`
          gives the same one-page-per-screen behaviour while still reporting the truth.
        */}
        <Pdf
          key={reloadKey}
          source={{ uri: document.localUri, cache: true }}
          page={page}
          enablePaging
          horizontal
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
            markStoreCaptureReady('viewer');
          }}
          onPageChanged={(currentPage, pages) => {
            setPage(currentPage);
            setPageCount(pages);
          }}
          onError={(error) => {
            const message = String(error);
            if (/password|encrypted/i.test(message)) {
              setPasswordAttempt('');
              setPasswordPromptVisible(true);
            } else {
              setLoadError(t('document.unsupported'));
            }
          }}
          style={styles.pdf}
        />
        {loadingProgress < 1 && !loadError ? (
          <View style={styles.viewerState} pointerEvents="none">
            <ActivityIndicator color="#2B5CFF" />
            <Text style={styles.viewerStateText}>
              {t('document.opening')} {Math.round(loadingProgress * 100)}%
            </Text>
          </View>
        ) : null}
        {loadError ? (
          <View style={styles.viewerState}>
              <Text style={styles.viewerErrorTitle}>{t('document.openFailed')}</Text>
            <Text style={styles.viewerErrorBody}>{loadError}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('document.retryLabel')}
              style={styles.primaryButton}
              onPress={() => {
                setLoadError(null);
                reloadDocument();
              }}
            >
              <Text style={styles.primaryText}>{t('document.retry')}</Text>
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
              accessibilityLabel={t('edit.annotationColor', { color: item })}
              accessibilityRole="button"
              accessibilityState={{ selected: color === item }}
              hitSlop={4}
              style={[styles.colorSwatch, { backgroundColor: item }, color === item && styles.selectedSwatch]}
              onPress={() => setColor(item)}
            />
          ))}
          {tool === 'ink' ? [1.5, 2.4, 4].map((width) => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('edit.inkWidth', { width })} accessibilityState={{ selected: strokeWidth === width }} key={width} style={[styles.strokeChoice, strokeWidth === width && styles.activeTool]} onPress={() => setStrokeWidth(width)}>
              <Text style={styles.strokeChoiceText}>{width}</Text>
            </Pressable>
          )) : null}
        </View>
      ) : null}

      <View style={styles.pageBar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('document.previousPage')} accessibilityState={{ disabled: page <= 1 }} style={styles.pageControl} disabled={page <= 1} onPress={() => setPage((value) => Math.max(1, value - 1))}><Text style={[styles.pageButton, page <= 1 && styles.disabledText]}>‹</Text></Pressable>
        <Text accessibilityRole="text" accessibilityLabel={t('document.pageOf', { page, count: pageCount })} style={styles.pageLabel}>{page} / {pageCount}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('document.nextPage')} accessibilityState={{ disabled: page >= pageCount }} style={styles.pageControl} disabled={page >= pageCount} onPress={() => setPage((value) => Math.min(pageCount, value + 1))}><Text style={[styles.pageButton, page >= pageCount && styles.disabledText]}>›</Text></Pressable>
      </View>

      <Modal visible={pendingTextPoint !== null} transparent animationType="fade" onRequestClose={() => setPendingTextPoint(null)}>
        <View accessibilityViewIsModal style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.modalTitle}>{t('edit.addText')}</Text>
            <TextInput accessibilityLabel={t('edit.textPlaceholder')} autoFocus value={textValue} onChangeText={setTextValue} style={styles.modalInput} placeholder={t('edit.textPlaceholder')} />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => setPendingTextPoint(null)}><Text>{t('action.cancel')}</Text></Pressable>
              <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={confirmText}><Text style={styles.primaryText}>{t('action.add')}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={passwordPromptVisible} transparent animationType="fade" onRequestClose={() => setPasswordPromptVisible(false)}>
        <View accessibilityViewIsModal style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.modalTitle}>{t('password.title')}</Text>
            <Text style={styles.modalBody}>{t('password.body')}</Text>
            <TextInput
              autoFocus
              secureTextEntry
              value={passwordAttempt}
              onChangeText={setPasswordAttempt}
              onSubmitEditing={applyPassword}
              style={styles.modalInput}
              accessibilityLabel={t('password.placeholder')}
              placeholder={t('password.placeholder')}
            />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => setPasswordPromptVisible(false)}><Text>{t('action.cancel')}</Text></Pressable>
              <Pressable
                disabled={!passwordAttempt}
                style={[styles.primaryButton, !passwordAttempt && styles.disabledButton]}
                onPress={applyPassword}
              >
                <Text style={styles.primaryText}>{t('action.open')}</Text>
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
  fullState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: '#F6F7F9' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E3E5E9' },
  toolScroll: { flex: 1 },
  toolRow: { gap: 5, paddingRight: 6 },
  tool: { minHeight: 44, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#F0F1F4' },
  compactTool: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 7, backgroundColor: '#F0F1F4' },
  activeTool: { backgroundColor: '#E7EDFF' },
  toolText: { color: '#59606D', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  activeToolText: { color: '#2B5CFF' },
  textButton: { minHeight: 44, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#ECEEF2' },
  primaryButton: { minHeight: 44, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#2B5CFF' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  viewer: { flex: 1, margin: 8, overflow: 'hidden', borderRadius: 8, backgroundColor: '#FFFFFF' },
  pdf: { flex: 1, backgroundColor: '#FFFFFF' },
  viewerState: { position: 'absolute', zIndex: 2, top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: '#FFFFFF' },
  viewerStateText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  viewerErrorTitle: { color: '#252A34', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  viewerErrorBody: { color: '#717986', lineHeight: 19, textAlign: 'center' },
  pageBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 8, backgroundColor: '#FFFFFF' },
  annotationOptions: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 4, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#ECEEF2' },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: '#FFFFFF' },
  selectedSwatch: { borderColor: '#171B24', transform: [{ scale: 1.1 }] },
  strokeChoice: { borderRadius: 7, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 5, backgroundColor: '#ECEEF2' },
  strokeChoiceText: { color: '#505865', fontSize: 10, fontWeight: '700' },
  pageButton: { color: '#2B5CFF', fontSize: 28, fontWeight: '500' },
  pageControl: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pageLabel: { color: '#5C6470', fontSize: 12, fontWeight: '700' },
  disabledText: { color: '#B7BCC5' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16,19,25,.45)' },
  modalCard: { width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 18, padding: 18, backgroundColor: '#FFFFFF' },
  modalTitle: { color: '#20252E', fontSize: 18, fontWeight: '800' },
  modalBody: { marginTop: 8, color: '#6D7480', lineHeight: 19 },
  modalInput: { marginVertical: 16, borderRadius: 10, borderWidth: 1, borderColor: '#DFE2E7', padding: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  disabledButton: { opacity: 0.45 },
});
