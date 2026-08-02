/**
 * One definition of how an unknown rejection becomes text a person can read.
 *
 * Deliberately dependency-free: storage code needs it too, and `database.ts`
 * is exercised in Node against `node:sqlite`, where importing `react-native`
 * would not resolve.
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
