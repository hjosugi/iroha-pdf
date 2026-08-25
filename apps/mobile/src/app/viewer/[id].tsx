import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import * as Print from 'expo-print';
import { File } from 'expo-file-system';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type PointerEvent as NativePointerEvent,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import Svg, { G, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import {
  denormalizePoint,
  flattenAnnotations,
  normalizePoint,
  pressureStrokeWidth,
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
import { COLOR, CONTROL, LAYOUT, LINE_HEIGHT, RADIUS, SPACE, TYPE } from '@/lib/theme';
import {
  bytesToWholeMiB,
  canFlattenOnMobile,
  MAX_MOBILE_FLATTEN_BYTES,
} from '@/lib/memory-policy';
import {
  EMPTY_HISTORY,
  planRedo,
  planUndo,
  recordCreate,
  recordDelete,
  redoRestores,
  undoRestores,
  type AnnotationHistory,
  type HistoryStep,
} from '@/lib/annotation-history';
import {
  appendPressure,
  fitPageFrame,
  highlightFromDrag,
  pressuresForStroke,
  hasPressureAwareInk,
  pointerPressure,
  type Size,
} from '@/lib/annotation-input';

/** Source of truth for the toolbar and its derived type. */
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

/**
 * A stored point as the `x,y` pair an SVG polyline wants, placed back onto the page.
 *
 * Annotations are held in 0..1 page space, so every one of them has to be multiplied
 * back out before it can be drawn. That was written out at each of the four places
 * that draw ink, which is four chances for one of them to drift from the others.
 */
function svgPoint(point: Point, frame: Size): string {
  const { x, y } = denormalizePoint(point, frame);
  return `${x},${y}`;
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
  const [viewerSize, setViewerSize] = useState<Size>({ width: 0, height: 0 });
  const [pdfPageSize, setPdfPageSize] = useState<Size | null>(null);
  const [pdfScale, setPdfScale] = useState(1);
  const [pendingTextPoint, setPendingTextPoint] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [passwordPromptVisible, setPasswordPromptVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordAttempt, setPasswordAttempt] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const inkPoints = useRef<Point[]>([]);
  const inkPressures = useRef<number[]>([]);
  const [inkPreview, setInkPreview] = useState<Point[]>([]);
  const [inkPreviewPressures, setInkPreviewPressures] = useState<number[]>([]);
  const activePointer = useRef<number | null>(null);
  const [lastInputWasPen, setLastInputWasPen] = useState(false);
  const highlightStart = useRef<Point | null>(null);
  const highlightEnd = useRef<Point | null>(null);
  const [highlightPreview, setHighlightPreview] = useState<{ start: Point; end: Point } | null>(null);
  const [history, setHistory] = useState<AnnotationHistory>(EMPTY_HISTORY);
  const [busyAction, setBusyAction] = useState<'export' | 'print' | null>(null);

  const pageFrame = useMemo(
    () => fitPageFrame(viewerSize, pdfPageSize ?? { width: 0, height: 0 }),
    [pdfPageSize, viewerSize],
  );
  const pageIsAligned = pageFrame.width > 0 && pageFrame.height > 0 && Math.abs(pdfScale - 1) < 0.01;

  useEffect(() => {
    void Promise.all([getDocument(id), listAnnotations(id)]).then(async ([nextDocument, nextAnnotations]) => {
      setDocument(nextDocument);
      setAnnotations(nextAnnotations);
      // Steps recorded against the document being left would undo marks in the one
      // being opened, if this screen is reused for a different id rather than remounted.
      setHistory(EMPTY_HISTORY);
      if (nextDocument) {
        navigation.setOptions({ title: nextDocument.title });
        await markDocumentOpened(nextDocument.id);
      }
    }).catch((error: unknown) => alertFailure(t('error.storage'), error))
      .finally(() => setDocumentLoaded(true));
  }, [id, navigation]);

  const visibleAnnotations = annotations.filter((annotation) => annotation.pageIndex === page - 1);
  const pressureStatusVisible = lastInputWasPen || hasPressureAwareInk(visibleAnnotations);

  const persist = async (annotation: PdfAnnotation, recordHistory = true): Promise<boolean> => {
    try {
      await saveAnnotation(annotation);
      setAnnotations((current) => [...current.filter((item) => item.id !== annotation.id), annotation]);
      if (recordHistory) setHistory((current) => recordCreate(current, annotation));
      return true;
    } catch (error) {
      alertFailure(t('edit.annotationSaveFailed'), error);
      return false;
    }
  };

  const removeAnnotation = async (annotation: PdfAnnotation, recordHistory = false): Promise<boolean> => {
    try {
      await deleteAnnotation(annotation.id);
      setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
      if (recordHistory) setHistory((current) => recordDelete(current, annotation));
      return true;
    } catch (error) {
      alertFailure(t('edit.annotationDeleteFailed'), error);
      return false;
    }
  };

  /** The identity fields every newly-created annotation must share. */
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

  /**
   * Applies a planned step, and moves the history only once the write has landed:
   * a history that advanced past a failed write would describe a document that does
   * not exist.
   */
  const step = async (
    plan: { step: HistoryStep; next: AnnotationHistory } | null,
    restores: (step: HistoryStep) => boolean,
  ) => {
    if (!plan) return;
    const { annotation } = plan.step;
    const done = restores(plan.step)
      ? await persist({ ...annotation, updatedAt: new Date().toISOString() }, false)
      : await removeAnnotation(annotation);
    if (done) setHistory(plan.next);
  };

  const undo = () => step(planUndo(history), undoRestores);
  const redo = () => step(planRedo(history), redoRestores);

  const addAtPoint = (point: Point) => {
    if (tool === 'eraser') {
      const nearest = visibleAnnotations
        .map((annotation) => ({ annotation, distance: distanceToAnnotation(point, annotation) }))
        .sort((left, right) => left.distance - right.distance)[0];
      if (nearest && nearest.distance < 0.08) void removeAnnotation(nearest.annotation, true);
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

  const pointFromPointer = (event: NativePointerEvent): Point =>
    normalizePoint({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY }, pageFrame);

  const clearPointerGesture = () => {
    activePointer.current = null;
    inkPoints.current = [];
    inkPressures.current = [];
    highlightStart.current = null;
    highlightEnd.current = null;
    setInkPreview([]);
    setInkPreviewPressures([]);
    setHighlightPreview(null);
  };

  const onPointerDown = (event: NativePointerEvent) => {
    const native = event.nativeEvent;
    if (!native.isPrimary || activePointer.current !== null || !pageIsAligned) return;
    activePointer.current = native.pointerId;
    setLastInputWasPen(native.pointerType === 'pen');
    const point = pointFromPointer(event);
    if (tool === 'highlight') {
      highlightStart.current = point;
      highlightEnd.current = point;
      setHighlightPreview({ start: point, end: point });
    } else if (tool === 'ink') {
      const pressure = pointerPressure(native.pointerType, native.pressure);
      inkPoints.current = [point];
      inkPressures.current = pressure === undefined ? [] : [pressure];
      setInkPreview([point]);
      setInkPreviewPressures(inkPressures.current);
    }
  };

  const onPointerMove = (event: NativePointerEvent) => {
    const native = event.nativeEvent;
    if (activePointer.current !== native.pointerId) return;
    const point = pointFromPointer(event);
    if (tool === 'highlight' && highlightStart.current) {
      highlightEnd.current = point;
      setHighlightPreview({ start: highlightStart.current, end: point });
    } else if (tool === 'ink') {
      inkPoints.current = [...inkPoints.current, point];
      inkPressures.current = [
        ...appendPressure(inkPressures.current, pointerPressure(native.pointerType, native.pressure)),
      ];
      setInkPreview(inkPoints.current);
      setInkPreviewPressures(inkPressures.current);
    }
  };

  const onPointerUp = (event: NativePointerEvent) => {
    if (activePointer.current !== event.nativeEvent.pointerId) return;
    const point = pointFromPointer(event);
    if (tool === 'highlight' && highlightStart.current) {
      const box = highlightFromDrag(highlightStart.current, highlightEnd.current ?? point);
      // Null means the drag was too small to have been meant as one, so it is the tap
      // it looks like — which places a highlight of the default size instead.
      if (!box) {
        addAtPoint(point);
      } else {
        void persist({ ...newMark(), kind: 'highlight', ...box, opacity: 0.42 });
      }
    } else if (tool === 'ink' && inkPoints.current.length >= 2) {
      void persist({
        ...newMark(), kind: 'ink', points: inkPoints.current,
        pressures: pressuresForStroke(inkPoints.current, inkPressures.current),
        strokeWidth,
      });
    } else if (tool === 'text' || tool === 'eraser') {
      addAtPoint(point);
    }
    clearPointerGesture();
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
      fontSize: TYPE.body,
    });
    setPendingTextPoint(null);
  };

  const createFlattenedCopy = async (): Promise<File> => {
    if (!document) throw new Error(t('document.notFound'));
    const input = new File(document.localUri);
    const inputSize = document.sizeBytes ?? input.size;
    if (!canFlattenOnMobile(inputSize)) {
      throw new Error(t('document.largeExportBody', {
        limit: bytesToWholeMiB(MAX_MOBILE_FLATTEN_BYTES),
      }));
    }
    const source = await input.bytes();
    // Loaded only when there is text to draw: the face is several megabytes and
    // highlight- or ink-only exports have no glyphs to encode.
    const textFont = annotations.some((item) => item.kind === 'text')
      ? await loadAnnotationFont()
      : undefined;
    const output = await flattenAnnotations(source, annotations, { textFont });
    return createOutputPdf(`${document.title}-edited.pdf`, output);
  };

  const warnIfFlatteningIsUnsafe = (): boolean => {
    const inputSize = document?.sizeBytes ?? (document ? new File(document.localUri).size : undefined);
    if (canFlattenOnMobile(inputSize)) return false;
    Alert.alert(t('document.largeExportTitle'), t('document.largeExportBody', {
      limit: bytesToWholeMiB(MAX_MOBILE_FLATTEN_BYTES),
    }));
    return true;
  };

  /** Both toolbar actions share one guarded in-memory flatten operation. */
  const deliverFlattenedCopy = async (
    action: 'export' | 'print',
    failureTitle: string,
    deliver: (output: File) => Promise<void>,
  ) => {
    if (warnIfFlatteningIsUnsafe()) return;
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
    return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}><View accessibilityRole="progressbar" accessibilityLabel={t('document.loading')} style={styles.fullState}><ActivityIndicator color={COLOR.brand} /></View></SafeAreaView>;
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
              onPress={() => {
                if (item !== 'hand') setPdfScale(1);
                setTool(item);
              }}
            >
              <Text style={[styles.toolText, tool === item && styles.activeToolText]}>{toolLabel(item)}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel={t('edit.undoLabel')} accessibilityState={{ disabled: history.undo.length === 0 }} disabled={history.undo.length === 0} style={[styles.compactTool, history.undo.length === 0 && styles.disabledButton]} onPress={() => void undo()}><Text>↶</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('edit.redoLabel')} accessibilityState={{ disabled: history.redo.length === 0 }} disabled={history.redo.length === 0} style={[styles.compactTool, history.redo.length === 0 && styles.disabledButton]} onPress={() => void redo()}><Text>↷</Text></Pressable>
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel={t('document.exportLabel')} accessibilityState={{ disabled: busyAction !== null }} disabled={busyAction !== null} style={[styles.textButton, busyAction !== null && styles.disabledButton]} onPress={() => void exportCopy()}><Text>{t(busyAction === 'export' ? 'document.exporting' : 'document.export')}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('print.open')} accessibilityState={{ disabled: busyAction !== null }} disabled={busyAction !== null} style={[styles.primaryButton, busyAction !== null && styles.disabledButton]} onPress={() => void print()}><Text style={styles.primaryText}>{t(busyAction === 'print' ? 'print.preparing' : 'print.open')}</Text></Pressable>
      </View>

      <View style={styles.viewer} onLayout={(event) => setViewerSize(event.nativeEvent.layout)}>
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
          scale={pdfScale}
          scrollEnabled={tool === 'hand'}
          enableDoubleTapZoom={tool === 'hand'}
          fitPolicy={2}
          trustAllCerts={false}
          onLoadProgress={(progress) => {
            setLoadingProgress(progress);
            setLoadError(null);
          }}
          onLoadComplete={(pages, _path, size) => {
            setPageCount(pages);
            setPdfPageSize(size);
            setLoadingProgress(1);
            setLoadError(null);
            markStoreCaptureReady('viewer');
          }}
          onPageChanged={(currentPage, pages, size) => {
            setPage(currentPage);
            setPageCount(pages);
            if (size) setPdfPageSize(size);
          }}
          onScaleChanged={setPdfScale}
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
            <ActivityIndicator color={COLOR.brand} />
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
        {pageIsAligned ? <View
          testID="annotation-page-layer"
          accessible
          accessibilityLabel={`${t('edit.annotationCanvas')}${pressureStatusVisible ? `, ${t('edit.penPressure')}` : ''}`}
          collapsable={false}
          pointerEvents={tool === 'hand' || loadingProgress < 1 || Boolean(loadError) ? 'none' : 'auto'}
          style={[
            styles.annotationLayer,
            { left: pageFrame.left, top: pageFrame.top, width: pageFrame.width, height: pageFrame.height },
          ]}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={clearPointerGesture}
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
              color, points: inkPreview,
              pressures: inkPreviewPressures.length === inkPreview.length ? inkPreviewPressures : undefined,
              strokeWidth,
              createdAt: '', updatedAt: '',
            }] : [])].map((annotation) => {
              if (annotation.kind === 'highlight') {
                return <Rect key={annotation.id} x={`${annotation.position.x * 100}%`} y={`${annotation.position.y * 100}%`} width={`${annotation.width * 100}%`} height={`${annotation.height * 100}%`} fill={annotation.color} fillOpacity={annotation.opacity} />;
              }
              if (annotation.kind === 'text') {
                return <SvgText key={annotation.id} x={`${annotation.position.x * 100}%`} y={`${annotation.position.y * 100}%`} fill={annotation.color} fontSize={annotation.fontSize}>{annotation.text}</SvgText>;
              }
              if (!annotation.pressures || annotation.pressures.length !== annotation.points.length) {
                return <Polyline key={annotation.id} points={annotation.points.map((point) => svgPoint(point, pageFrame)).join(' ')} fill="none" stroke={annotation.color} strokeWidth={annotation.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
              }
              return (
                <G key={annotation.id}>
                  {annotation.points.slice(1).map((point, index) => {
                    const previous = annotation.points[index];
                    if (!previous) return null;
                    return (
                      <Polyline
                        key={`${annotation.id}-${index}`}
                        points={`${svgPoint(previous, pageFrame)} ${svgPoint(point, pageFrame)}`}
                        fill="none"
                        stroke={annotation.color}
                        strokeWidth={pressureStrokeWidth(annotation.strokeWidth, annotation.pressures?.[index + 1])}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    );
                  })}
                </G>
              );
            })}
          </Svg>
        </View> : null}
        {!pageIsAligned && loadingProgress >= 1 && !loadError ? (
          <View pointerEvents="none" style={styles.zoomNotice}>
            <Text style={styles.zoomNoticeText}>{t('edit.zoomReadOnly', { percent: Math.round(pdfScale * 100) })}</Text>
          </View>
        ) : null}
      </View>

      {tool === 'ink' || tool === 'highlight' || tool === 'text' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.annotationOptions}
          contentContainerStyle={styles.annotationOptionsContent}
        >
          {TOOL_COLORS.map((item) => (
            <Pressable
              key={item}
              accessibilityLabel={t('edit.annotationColor', { color: item })}
              accessibilityRole="button"
              accessibilityState={{ selected: color === item }}
              hitSlop={SPACE.xs}
              style={[styles.colorSwatch, { backgroundColor: item }, color === item && styles.selectedSwatch]}
              onPress={() => setColor(item)}
            />
          ))}
          {tool === 'ink' ? [1.5, 2.4, 4].map((width) => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('edit.inkWidth', { width })} accessibilityState={{ selected: strokeWidth === width }} key={width} style={[styles.strokeChoice, strokeWidth === width && styles.activeTool]} onPress={() => setStrokeWidth(width)}>
              <Text style={styles.strokeChoiceText}>{width}</Text>
            </Pressable>
          )) : null}
        </ScrollView>
      ) : null}
      {tool === 'ink' && pressureStatusVisible ? (
        <View pointerEvents="none" style={styles.inputStatusBadge}>
          <Text accessibilityLiveRegion="polite" testID="stylus-pressure-status" style={styles.inputStatus}>
            {t('edit.penPressure')}
          </Text>
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
  container: { flex: 1, backgroundColor: COLOR.canvas },
  fullState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.md, padding: SPACE.xxl, backgroundColor: COLOR.background },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, padding: SPACE.sm, backgroundColor: COLOR.surface, borderBottomWidth: SPACE.hairline, borderBottomColor: COLOR.border },
  toolScroll: { flex: 1 },
  toolRow: { gap: SPACE.xs, paddingRight: SPACE.sm },
  tool: { minHeight: CONTROL.minimum, justifyContent: 'center', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, backgroundColor: '#F0F1F4' },
  compactTool: { minWidth: CONTROL.minimum, minHeight: CONTROL.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.sm, backgroundColor: '#F0F1F4' },
  activeTool: { backgroundColor: '#E7EDFF' },
  toolText: { color: '#59606D', fontSize: TYPE.caption, fontWeight: '700', textTransform: 'capitalize' },
  activeToolText: { color: COLOR.brand },
  textButton: { minHeight: CONTROL.minimum, justifyContent: 'center', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, backgroundColor: COLOR.control },
  primaryButton: { minHeight: CONTROL.minimum, justifyContent: 'center', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, backgroundColor: COLOR.brand },
  primaryText: { color: COLOR.surface, fontWeight: '700' },
  viewer: { flex: 1, margin: SPACE.sm, overflow: 'hidden', borderRadius: RADIUS.sm, backgroundColor: COLOR.surface },
  pdf: { flex: 1, backgroundColor: COLOR.surface },
  annotationLayer: { position: 'absolute' },
  viewerState: { position: 'absolute', zIndex: 2, top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: SPACE.md, padding: SPACE.xxl, backgroundColor: COLOR.surface },
  viewerStateText: { color: '#6B7280', fontSize: TYPE.label, fontWeight: '600' },
  viewerErrorTitle: { color: '#252A34', fontSize: TYPE.heading, fontWeight: '800', textAlign: 'center' },
  viewerErrorBody: { color: '#717986', lineHeight: LINE_HEIGHT.body, textAlign: 'center' },
  zoomNotice: { position: 'absolute', left: SPACE.md, right: SPACE.md, bottom: SPACE.md, alignItems: 'center' },
  zoomNoticeText: { borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, color: COLOR.surface, backgroundColor: 'rgba(23,27,36,.82)', fontSize: TYPE.caption, fontWeight: '700' },
  pageBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xxxl, padding: SPACE.sm, backgroundColor: COLOR.surface },
  annotationOptions: {
    position: 'absolute',
    zIndex: 3,
    right: SPACE.sm,
    bottom: CONTROL.comfortable + SPACE.md,
    left: SPACE.sm,
    borderRadius: RADIUS.md,
    borderWidth: SPACE.hairline,
    borderColor: COLOR.control,
    backgroundColor: COLOR.surface,
  },
  annotationOptionsContent: {
    minWidth: '100%',
    minHeight: CONTROL.comfortable + SPACE.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
  colorSwatch: { width: CONTROL.swatch, height: CONTROL.swatch, borderRadius: RADIUS.pill, borderWidth: SPACE.xxs, borderColor: COLOR.surface },
  selectedSwatch: { borderColor: '#171B24', transform: [{ scale: 1.1 }] },
  strokeChoice: { borderRadius: RADIUS.sm, minWidth: CONTROL.minimum, minHeight: CONTROL.minimum, alignItems: 'center', justifyContent: 'center', padding: SPACE.xs, backgroundColor: COLOR.control },
  strokeChoiceText: { color: '#505865', fontSize: TYPE.caption, fontWeight: '700' },
  inputStatusBadge: {
    position: 'absolute',
    zIndex: 4,
    right: SPACE.md,
    bottom: CONTROL.comfortable * 2 + SPACE.xxl,
    borderRadius: RADIUS.pill,
    borderWidth: SPACE.hairline,
    borderColor: COLOR.control,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    backgroundColor: COLOR.surface,
  },
  inputStatus: { color: COLOR.success, fontSize: TYPE.caption, fontWeight: '700' },
  pageButton: { color: COLOR.brand, fontSize: TYPE.title, fontWeight: '500' },
  pageControl: { minWidth: CONTROL.comfortable, minHeight: CONTROL.minimum, alignItems: 'center', justifyContent: 'center' },
  pageLabel: { color: '#5C6470', fontSize: TYPE.label, fontWeight: '700' },
  disabledText: { color: '#B7BCC5' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl, backgroundColor: 'rgba(16,19,25,.45)' },
  modalCard: { width: '100%', maxWidth: LAYOUT.dialog, alignSelf: 'center', borderRadius: RADIUS.lg, padding: SPACE.xl, backgroundColor: COLOR.surface },
  modalTitle: { color: '#20252E', fontSize: TYPE.heading, fontWeight: '800' },
  modalBody: { marginTop: SPACE.sm, color: COLOR.muted, lineHeight: LINE_HEIGHT.body },
  modalInput: { marginVertical: SPACE.lg, borderRadius: RADIUS.md, borderWidth: SPACE.hairline, borderColor: '#DFE2E7', padding: SPACE.md },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACE.sm },
  disabledButton: { opacity: 0.45 },
});
