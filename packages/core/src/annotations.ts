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
    if (!current || compareSyncOperations(current, operation) < 0) {
      byId.set(operation.id, operation);
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (a.logicalClock !== b.logicalClock) return a.logicalClock - b.logicalClock;
    if (a.deviceId !== b.deviceId) return a.deviceId.localeCompare(b.deviceId);
    return a.id.localeCompare(b.id);
  });
}

/**
 * Total ordering used to resolve concurrent deliveries without consulting a
 * wall clock. Delete wins an exact logical-clock tie so a stale edit cannot
 * resurrect an annotation. The remaining fields make the result independent
 * of arrival order.
 */
export function compareSyncOperations(left: SyncOperation, right: SyncOperation): number {
  if (left.logicalClock !== right.logicalClock) {
    return left.logicalClock - right.logicalClock;
  }
  if (left.kind !== right.kind) return left.kind === 'delete' ? 1 : -1;
  if (left.deviceId !== right.deviceId) return left.deviceId.localeCompare(right.deviceId);
  if (left.id !== right.id) return left.id.localeCompare(right.id);
  return stableJson(left.payload).localeCompare(stableJson(right.payload));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

/**
 * Reduces an annotation operation log to one live value or tombstone per
 * annotation. Tombstones deliberately remain in the returned log so duplicate
 * or delayed upserts cannot recreate a deleted annotation.
 */
export function mergeAnnotationOperations(
  local: SyncOperation[],
  remote: SyncOperation[],
): SyncOperation[] {
  const winners = new Map<string, SyncOperation>();

  for (const operation of mergeSyncOperations(local, remote)) {
    if (operation.entityType !== 'annotation') continue;
    const current = winners.get(operation.entityId);
    if (!current || compareSyncOperations(current, operation) < 0) {
      winners.set(operation.entityId, operation);
    }
  }

  return [...winners.values()].sort((left, right) => {
    const order = compareSyncOperations(left, right);
    return order === 0 ? left.entityId.localeCompare(right.entityId) : order;
  });
}
