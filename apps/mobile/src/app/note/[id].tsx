import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Note } from '@iroha-pdf/core';
import { ContentColumn } from '@/components/ContentColumn';
import { alertFailure } from '@/lib/alerts';
import { getNote, saveNote } from '@/lib/database';
import { t } from '@/lib/i18n';
import { LAYOUT, RADIUS, SPACE, TYPE } from '@/lib/theme';

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [note, setNote] = useState<Note | null>(null);
  const [loaded, setLoaded] = useState(false);
  const noteRef = useRef<Note | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getNote(id).then((loaded) => {
      noteRef.current = loaded;
      setNote(loaded);
      if (loaded) navigation.setOptions({ title: loaded.title });
    }).catch(showSaveError).finally(() => setLoaded(true));
  }, [id, navigation]);

  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (noteRef.current) void saveNote(noteRef.current).catch(showSaveError);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flush();
    });
    return () => {
      subscription.remove();
      flush();
    };
  }, []);

  const update = (patch: Partial<Pick<Note, 'title' | 'body'>>) => {
    if (!note) return;
    const updated = { ...note, ...patch, updatedAt: new Date().toISOString() };
    noteRef.current = updated;
    setNote(updated);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void saveNote(updated).catch(showSaveError);
    }, 250);
  };

  if (!loaded) {
    return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}><View accessibilityRole="progressbar" accessibilityLabel={t('note.loading')} style={styles.center}><ActivityIndicator color="#2B5CFF" /></View></SafeAreaView>;
  }

  if (!note) {
    return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}><View style={styles.center}><Text accessibilityRole="header" style={styles.missingTitle}>{t('note.notFound')}</Text><Text style={styles.missingBody}>{t('document.removed')}</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ContentColumn maxWidth={LAYOUT.editor} style={styles.editor}>
        <TextInput
          accessibilityLabel={t('note.titleLabel')}
          value={note.title}
          onChangeText={(title) => update({ title })}
          placeholder={t('note.title')}
          style={styles.title}
        />
        <TextInput
          accessibilityLabel={t('note.bodyLabel')}
          value={note.body}
          onChangeText={(body) => update({ body })}
          placeholder={t('note.write')}
          multiline
          textAlignVertical="top"
          style={styles.body}
        />
        <Text accessibilityLiveRegion="polite" style={styles.saved}>{t('autosave.saved')}</Text>
      </ContentColumn>
    </SafeAreaView>
  );
}

function showSaveError(error: unknown): void {
  alertFailure(t('note.saveFailed'), error);
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: SPACE.xl, backgroundColor: '#FFFDF7' },
  editor: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, padding: SPACE.xxl },
  missingTitle: { color: '#1D211E', fontSize: SPACE.xl, fontWeight: '800' },
  missingBody: { color: '#777D75', textAlign: 'center' },
  title: { color: '#1D211E', fontSize: TYPE.title, fontWeight: '800', paddingVertical: SPACE.md, borderRadius: RADIUS.sm },
  body: { flex: 1, color: '#30342F', fontSize: TYPE.heading, lineHeight: SPACE.xxl, paddingTop: SPACE.md },
  saved: { paddingVertical: SPACE.md, color: '#858A83', fontSize: TYPE.label },
});
