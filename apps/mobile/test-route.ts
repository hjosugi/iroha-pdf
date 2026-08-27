/**
 * The route parameters a screen under test is mounted with.
 *
 * `useLocalSearchParams` is mocked once, in `test-setup.screens.ts`, so a test
 * that needs a particular `id` sets it here rather than re-mocking expo-router
 * and losing the rest of that module's stand-ins.
 */
export const routeParams: Record<string, string> = {};

export function setRouteParams(params: Record<string, string>): void {
  for (const key of Object.keys(routeParams)) delete routeParams[key];
  Object.assign(routeParams, params);
}
