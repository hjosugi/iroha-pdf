export type DocumentSource = 'local' | 'google-drive' | 'icloud' | 'external-provider';

export type WorkspaceDocument = {
  id: string;
  title: string;
  localUri: string;
  mimeType: 'application/pdf';
  source: DocumentSource;
  sourceId?: string;
  sourceRevision?: string;
  pageCount?: number;
  sizeBytes?: number;
  modifiedAt: string;
};

export type Point = {
  x: number;
  y: number;
};

/**
 * The extent a normalized point is measured against. Annotations are stored in
 * 0..1 page space so that a mark survives a zoom, a rotation and a different
 * screen; turning one back into something drawable always needs a size, and
 * both platforms need the same one.
 */
export type Size = {
  width: number;
  height: number;
};

type AnnotationBase = {
  id: string;
  documentId: string;
  pageIndex: number;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type TextAnnotation = AnnotationBase & {
  kind: 'text';
  position: Point;
  text: string;
  fontSize: number;
};

export type HighlightAnnotation = AnnotationBase & {
  kind: 'highlight';
  position: Point;
  width: number;
  height: number;
  opacity: number;
};

export type InkAnnotation = AnnotationBase & {
  kind: 'ink';
  points: Point[];
  /**
   * Normalized pressure for each point (0..1). Older annotations omit this,
   * which deliberately renders them at the selected base stroke width.
   */
  pressures?: number[];
  strokeWidth: number;
};

export type PdfAnnotation = TextAnnotation | HighlightAnnotation | InkAnnotation;

export type WorkspaceTab = {
  id: string;
  kind: 'pdf' | 'note';
  resourceId: string;
  title: string;
  position: number;
  lastActiveAt: string;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  linkedDocumentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SyncOperation = {
  id: string;
  deviceId: string;
  entityId: string;
  entityType: 'annotation' | 'note' | 'tab' | 'document';
  kind: 'upsert' | 'delete';
  logicalClock: number;
  payload?: unknown;
};
