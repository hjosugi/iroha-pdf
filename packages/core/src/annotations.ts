import type { PdfAnnotation, Point, SyncOperation } from './types';

export function clampNormalized(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizePoint(point: Point, width: number, height: number): Point {
  if (width <= 0 || height <= 0) {
    throw new Error('Page dimensions must be positive');
  }

  return {
    x: clampNormalized(point.x / width),
    y: clampNormalized(point.y / height),
  };
}

export function denormalizePoint(point: Point, width: number, height: number): Point {
  return {
    x: clampNormalized(point.x) * width,
    y: clampNormalized(point.y) * height,
  };
}

export function validateAnnotation(annotation: PdfAnnotation): PdfAnnotation {
  if (annotation.pageIndex < 0) {
    throw new Error('pageIndex must be zero-based and non-negative');
  }

  if (annotation.kind === 'ink' && annotation.points.length < 2) {
    throw new Error('Ink annotations need at least two points');
  }

  return annotation;
}

export function mergeSyncOperations(
  local: SyncOperation[],
  remote: SyncOperation[],
): SyncOperation[] {
  const byId = new Map<string, SyncOperation>();

  for (const operation of [...local, ...remote]) {
    const current = byId.get(operation.id);
    if (!current || operation.logicalClock > current.logicalClock) {
      byId.set(operation.id, operation);
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (a.logicalClock !== b.logicalClock) return a.logicalClock - b.logicalClock;
    if (a.deviceId !== b.deviceId) return a.deviceId.localeCompare(b.deviceId);
    return a.id.localeCompare(b.id);
  });
}
