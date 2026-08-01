import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initializeDatabase } from '@/lib/database';
import { t } from '@/lib/i18n';

export default function RootLayout() {
  useEffect(() => {
    // The library screen surfaces initialization/migration failures with a
    // user-visible retry path; avoid an unhandled startup rejection here.
    void initializeDatabase().catch(() => undefined);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: '#F6F7F9' },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#F6F7F9' },
          headerTintColor: '#171B24',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="viewer/[id]" options={{ title: 'PDF' }} />
        <Stack.Screen name="note/[id]" options={{ title: t('note.label') }} />
        <Stack.Screen name="tools" options={{ title: t('tools.title') }} />
        <Stack.Screen name="drive" options={{ title: 'Google Drive' }} />
        <Stack.Screen name="recovery" options={{ title: t('recovery.title') }} />
        <Stack.Screen name="store-preview" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
