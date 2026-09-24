import { safeSystemPath } from '@/lib/deep-link';

/**
 * Expo Router calls this with every link the system delivers — the one that
 * launched the application and each one after — before its own parser sees it.
 * `safeSystemPath` explains why a link has to be screened here.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return safeSystemPath(path);
}
