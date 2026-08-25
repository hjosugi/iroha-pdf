import type { PdfAnnotation, Point, Size, SyncOperation } from './types';

export function clampNormalized(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Maps a coordinate measured in `size` into the 0..1 page space annotations are
 * stored in, and back again.
 *
 * There were two of these. This pair took the extent as two numbers and had no
 * caller; `normalizePagePoint` in the mobile overlay took it as one frame and
 * had all of them, while the same overlay multiplied back out by hand in four
 * places rather than reaching for the inverse sitting here. One page-space
 * convention shared by both platforms is the point of storing marks normalized
 * at all, so it is defined once, here, in the shape the call sites wanted.
 *
 * Refusing a zero extent rather than dividing by it is deliberate: a frame is
 * unmeasured until the page has laid out, and a point taken against one is not
 * a point at the origin, it is a point nobody can place.
 */
export function normalizePoint(point: Point, size: Size): Point {
  if (size.width <= 0 || size.height <= 0) {
    throw new Error('The PDF page frame must be measurable before accepting input');
  }

  return {
    x: clampNormalized(point.x / size.width),
    y: clampNormalized(point.y / size.height),
  };
}

/** The inverse: a stored point placed back onto a page of `size`. */
export function denormalizePoint(point: Point, size: Size): Point {
  return {
    x: clampNormalized(point.x) * size.width,
    y: clampNormalized(point.y) * size.height,
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
