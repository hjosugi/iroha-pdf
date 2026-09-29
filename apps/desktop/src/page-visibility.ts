/**
 * When a cache should let its bytes go, as the platform can actually tell us.
 *
 * The obvious trigger would be a memory-pressure event, and there is not one to have.
 * None of the webviews this app ships in — WebKitGTK on Linux, WKWebView on macOS,
 * WebView2 on Windows — exposes such an event to JavaScript, and the one standard
 * candidate, the Compute Pressure API, ships `cpu` as its only source. Core keeps
 * `handleMemoryWarning` for a runtime that offers one; inventing a warning here would
 * put a `'memory-warning'` in the eviction log that never happened, which is the
 * mistake #52 records against the policy's first draft.
 *
 * What every webview does report is visibility. A hidden page is exactly the case a
 * bitmap cache exists to lose to: nobody can see the pictures, and the OS may reap the
 * whole process while the window sits in the background. So that is the trigger, and it
 * is named visibility rather than dressed up as pressure.
 *
 * The subscriber is told both directions because the two halves differ: hiding
 * releases, and showing again re-requests. A one-way "free everything" would leave a
 * page that came back to a strip of empty placeholders, since IntersectionObserver does
 * not re-fire for an element that never stopped intersecting.
 */

/** The slice of `document` this needs, so a test does not have to build a whole DOM. */
export type VisibilitySource = {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
};

export type VisibilityListener = (visible: boolean) => void;

/**
 * Reports whether the page is visible now, and on every change, until unsubscribed.
 *
 * The listener is called immediately with the current state. A window that opens in the
 * background — a restored session, a link opened in a background tab — would otherwise
 * never get its first release, because the event it waits for has already happened.
 */
export function subscribeToVisibility(
  listener: VisibilityListener,
  source: VisibilitySource = document,
): () => void {
  const report = (): void => listener(source.visibilityState === 'visible');
  source.addEventListener('visibilitychange', report);
  report();
  return () => source.removeEventListener('visibilitychange', report);
}
