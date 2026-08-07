import type { PdfAnnotation, Point, SyncOperation } from './types';

export function clampNormalized(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Not in service. `apps/mobile/src/lib/annotation-input.ts` has `normalizePagePoint`,
 * which is this computation with the page frame passed as one argument instead of two,
 * and that is the one the overlay actually calls. This pair predates it and nothing
 * outside this file's tests references either function.
 *
 * Left in place rather than deleted or merged: the mobile signature suits its call site,
 * and picking a winner is work for whoever needs both platforms to agree — #10.
 */
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

/**
 * Converts normalized pen pressure into a readable stroke without allowing a
 * light touch to disappear or a hard press to obscure the document.
 */
export function pressureStrokeWidth(baseWidth: number, pressure?: number): number {
  if (pressure === undefined || !Number.isFinite(pressure)) return baseWidth;
  const normalized = clampNormalized(pressure);
  return baseWidth * (0.55 + normalized * 0.9);
}

/**
 * Not in service. Both applications write annotations to their own stores without
 * passing them through this, so nothing outside this file's tests calls it. Kept
 * because whatever accepts annotations from a sync peer will want exactly this — an
 * annotation that arrived over a wire is the one nobody has checked.
 */
export function validateAnnotation(annotation: PdfAnnotation): PdfAnnotation {
  if (annotation.pageIndex < 0) {
    throw new Error('pageIndex must be zero-based and non-negative');
  }

  if (annotation.kind === 'ink') {
    if (annotation.points.length < 2) {
      throw new Error('Ink annotations need at least two points');
    }
    if (annotation.pressures && annotation.pressures.length !== annotation.points.length) {
      throw new Error('Ink pressure samples must match the point count');
    }
    if (annotation.pressures?.some((pressure) => !Number.isFinite(pressure) || pressure < 0 || pressure > 1)) {
      throw new Error('Ink pressure samples must be normalized from 0 to 1');
    }
  }

  return annotation;
}

/**
 * Records `operation` under `key` unless something already there outranks it.
 * Both merges below reduce a log to one winner per key and differ only in which
 * key they group by, so the tie-breaking lives here rather than in each of them.
 */
function keepHighestRanked(
  winners: Map<string, SyncOperation>,
  key: string,
  operation: SyncOperation,
): void {
  const current = winners.get(key);
  if (!current || compareSyncOperations(current, operation) < 0) {
    winners.set(key, operation);
  }
}

/**
 * Not in service, along with `compareSyncOperations` and `mergeAnnotationOperations`
 * below. This is the last-write-wins merge #41 proposes replacing with Yjs — worth
 * knowing before that comparison is made, because there is no LWW running to replace:
 * nothing outside this file's tests reaches any of the three.
 */
export function mergeSyncOperations(
  local: SyncOperation[],
  remote: SyncOperation[],
): SyncOperation[] {
  const byId = new Map<string, SyncOperation>();

  for (const operation of [...local, ...remote]) {
    keepHighestRanked(byId, operation.id, operation);
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
    keepHighestRanked(winners, operation.entityId, operation);
  }

  return [...winners.values()].sort((left, right) => {
    const order = compareSyncOperations(left, right);
    return order === 0 ? left.entityId.localeCompare(right.entityId) : order;
  });
}
