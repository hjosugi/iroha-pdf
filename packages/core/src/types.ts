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
