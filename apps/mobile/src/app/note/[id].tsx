import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import {
  Alert,
  AppState,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Note } from '@iroha-pdf/core';
import { getNote, saveNote } from '@/lib/database';

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [note, setNote] = useState<Note | null>(null);
  const noteRef = useRef<Note | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getNote(id).then((loaded) => {
      noteRef.current = loaded;
      setNote(loaded);
      if (loaded) navigation.setOptions({ title: loaded.title });
    }).catch(showSaveError);
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

  if (!note) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      <TextInput
        value={note.title}
        onChangeText={(title) => update({ title })}
        placeholder="Title"
        style={styles.title}
      />
      <TextInput
        value={note.body}
        onChangeText={(body) => update({ body })}
        placeholder="Write anything…"
        multiline
        textAlignVertical="top"
        style={styles.body}
      />
    </SafeAreaView>
  );
}

function showSaveError(error: unknown): void {
  Alert.alert('Note could not be saved', error instanceof Error ? error.message : String(error));
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: '#FFFDF7' },
  title: { color: '#1D211E', fontSize: 27, fontWeight: '800', paddingVertical: 12 },
  body: { flex: 1, color: '#30342F', fontSize: 16, lineHeight: 26, paddingTop: 10 },
});
