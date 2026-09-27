/**
 * Opt-in, privacy-preserving diagnostics (#66).
 *
 * The whole point of the feature is that it is safe to turn on. That is enforced
 * by the shape of an event rather than by a filter applied afterwards: an event
 * carries a *code* drawn from a closed set, a level, a timestamp and at most two
 * numbers. There is no free-text field to leak a document title, a file path, a
 * note body or an OAuth token into, because there is nowhere to put one — a
 * caller that wants to record something new has to name it here first.
 *
 * Storage is injected so the same logic runs against `localStorage` on desktop,
 * the mobile store, or a test double. Nothing is written at all until the user
 * opts in, and `clear()` removes what was written.
 */

export const DIAGNOSTIC_CODES = [
  'app.started',
  'app.engine.failed',
  'document.open.failed',
  'document.save.failed',
  'document.export.failed',
  'print.failed',
  'storage.unavailable',
  'network.failed',
  'auth.failed',
  'provider.failed',
  'unhandled.error',
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export type DiagnosticLevel = 'info' | 'warn' | 'error';

/**
 * The only fields an event may carry. `count` and `durationMs` exist because the
 * useful non-identifying facts are "how many" and "how long"; anything richer
 * belongs in a code that names it.
 */
export type DiagnosticEvent = {
  at: string;
  level: DiagnosticLevel;
  code: DiagnosticCode;
  count?: number;
  durationMs?: number;
};

export type DiagnosticsStorage = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

export const DIAGNOSTICS_ENABLED_KEY = 'iroha-pdf:diagnostics:enabled';
export const DIAGNOSTICS_EVENTS_KEY = 'iroha-pdf:diagnostics:events';

/** Enough history to describe a session without growing without end. */
export const DIAGNOSTICS_LIMIT = 200;

const CODES = new Set<string>(DIAGNOSTIC_CODES);
const LEVELS = new Set<string>(['info', 'warn', 'error']);
const EVENT_FIELDS = new Set<string>(['at', 'level', 'code', 'count', 'durationMs']);

function isEvent(value: unknown): value is DiagnosticEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.at === 'string' &&
    typeof event.code === 'string' &&
    CODES.has(event.code) &&
    typeof event.level === 'string' &&
    LEVELS.has(event.level) &&
    (event.count === undefined || typeof event.count === 'number') &&
    (event.durationMs === undefined || typeof event.durationMs === 'number') &&
    // An unknown key is exactly how content would be smuggled into an export, so
    // an event carrying one is not one of ours and is dropped whole.
    Object.keys(event).every((key) => EVENT_FIELDS.has(key))
  );
}

export class Diagnostics {
  constructor(
    private readonly storage: DiagnosticsStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Off until the user turns it on. */
  isEnabled(): boolean {
    return this.storage.get(DIAGNOSTICS_ENABLED_KEY) === 'true';
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.storage.set(DIAGNOSTICS_ENABLED_KEY, 'true');
      return;
    }
    this.storage.remove(DIAGNOSTICS_ENABLED_KEY);
  }

  /** A no-op while disabled, so no code path has to check first. */
  record(
    code: DiagnosticCode,
    level: DiagnosticLevel = 'info',
    extra: { count?: number; durationMs?: number } = {},
  ): void {
    if (!this.isEnabled()) return;
    const event: DiagnosticEvent = { at: this.now().toISOString(), level, code };
    if (extra.count !== undefined) event.count = extra.count;
    if (extra.durationMs !== undefined) event.durationMs = extra.durationMs;
    const events = [...this.events(), event].slice(-DIAGNOSTICS_LIMIT);
    this.storage.set(DIAGNOSTICS_EVENTS_KEY, JSON.stringify(events));
  }

  /**
   * What is stored, dropping anything that is not a well-formed event. Storage is
   * outside this module's control — a previous version, another tab, or a user
   * with developer tools can put whatever it likes there — and an export is the
   * one place bad data would leave the device, so it is filtered on the way out.
   */
  events(): DiagnosticEvent[] {
    const raw = this.storage.get(DIAGNOSTICS_EVENTS_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isEvent) : [];
    } catch {
      return [];
    }
  }

  /** The document a user would attach to a report, as pretty-printed JSON. */
  export(): string {
    return `${JSON.stringify({ version: 1, generatedAt: this.now().toISOString(), events: this.events() }, null, 2)}\n`;
  }

  clear(): void {
    this.storage.remove(DIAGNOSTICS_EVENTS_KEY);
  }

  /**
   * A short human-readable view of the most recent failures, so a report can be
   * previewed before it is exported. It names codes and times, never content.
   */
  crashReportPreview(limit = 5): string {
    const failures = this.events().filter((event) => event.level === 'error').slice(-limit);
    if (failures.length === 0) return '';
    return failures.map(describeDiagnosticEvent).join('\n');
  }
}

/** One line for one event. Exported so both platforms format a preview the same way. */
export function describeDiagnosticEvent(event: DiagnosticEvent): string {
  const extras: string[] = [];
  if (event.count !== undefined) extras.push(`count=${event.count}`);
  if (event.durationMs !== undefined) extras.push(`${event.durationMs}ms`);
  return [event.at, event.level, event.code, ...extras].join(' ');
}
