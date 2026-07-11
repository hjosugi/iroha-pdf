import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initializeDatabase } from '@/lib/database';

export default function RootLayout() {
  useEffect(() => {
    void initializeDatabase();
  }, []);

  return (
    <>
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
        <Stack.Screen name="note/[id]" options={{ title: 'Note' }} />
        <Stack.Screen name="tools" options={{ title: 'PDF tools' }} />
        <Stack.Screen name="drive" options={{ title: 'Google Drive' }} />
      </Stack>
    </>
  );
}
