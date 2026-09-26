/**
 * What a screen needs before it can be rendered outside a device.
 *
 * Only the modules that reach for a native binary are replaced. Everything the
 * screens actually decide with — the message catalogue, the theme, the layout
 * components — is the real thing, because a test against a double of those would
 * only be checking the double.
 */
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * `react-native-safe-area-context` reads insets from a native module. The web
 * build exists but wants a provider; a passthrough is enough here, since no
 * screen decides anything from an inset.
 */
vi.mock('react-native-safe-area-context', async () => {
  const { createElement } = await import('react');
  const { View } = await import('react-native-web');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown> & { children?: unknown }) =>
      createElement(View, props, children as never),
    SafeAreaProvider: ({ children }: { children?: unknown }) => children,
    useSafeAreaInsets: () => insets,
    initialWindowMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets },
  };
});

/**
 * Navigation is a native stack; screens under test are rendered directly.
 *
 * A screen rendered here is focused from its first render and never loses focus,
 * so `useFocusEffect` is an effect that runs on mount and again when its callback
 * changes — which is what the real hook does for a screen that stays in front.
 * Calling the callback during render instead would run it on every render, and a
 * callback that sets state (the library's refresh does) would never settle.
 */
vi.mock('expo-router', async () => {
  const { routeParams } = await import('./test-route');
  const { useEffect } = await import('react');
  return {
  useLocalSearchParams: () => routeParams,
  useNavigation: () => ({ setOptions: vi.fn() }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
  };
});

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  (await import('./test-route')).setRouteParams({});
});
