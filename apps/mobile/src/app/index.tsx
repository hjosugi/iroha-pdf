import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Note, WorkspaceDocument } from '@iroha-pdf/core';
import { createNote, listDocuments, listNotes, listRecoveryCopies } from '@/lib/database';
import { importPdfFromSystem } from '@/lib/files';

export default function LibraryScreen() {
  const router = useRouter();
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [nextDocuments, nextNotes, recoveryCopies] = await Promise.all([
        listDocuments(),
        listNotes(),
        listRecoveryCopies(),
      ]);
      setDocuments(nextDocuments);
      setNotes(nextNotes);
      setRecoveryCount(recoveryCopies.length);
    } catch (error) {
      showStorageError(error);
    }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const importPdf = async () => {
    try {
      const imported = await importPdfFromSystem();
      if (!imported) return;
      await refresh();
      router.push({ pathname: '/viewer/[id]', params: { id: imported.id } });
    } catch (error) {
      showStorageError(error);
    }
  };

  const newNote = async () => {
    try {
      const note = await createNote('Untitled note');
      await refresh();
      router.push({ pathname: '/note/[id]', params: { id: note.id } });
    } catch (error) {
      showStorageError(error);
    }
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredDocuments = documents.filter((document) =>
    `${document.title} ${document.source}`.toLocaleLowerCase().includes(normalizedQuery),
  );
  const filteredNotes = notes.filter((note) =>
    `${note.title} ${note.body}`.toLocaleLowerCase().includes(normalizedQuery),
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>LOCAL-FIRST WORKSPACE</Text>
          <Text style={styles.title}>Iroha PDF</Text>
        </View>
        <Pressable style={styles.avatar} onPress={() => router.push('/drive')}>
          <Text style={styles.avatarText}>G</Text>
        </Pressable>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search PDFs and notes"
        placeholderTextColor="#8B919C"
        style={styles.search}
      />

      <View style={styles.actions}>
        <ActionButton label="Open PDF" primary onPress={importPdf} />
        <ActionButton label="New note" onPress={newNote} />
        <ActionButton label="PDF tools" onPress={() => router.push('/tools')} />
      </View>

      {recoveryCount > 0 ? (
        <Pressable style={styles.recoveryBanner} onPress={() => router.push('/recovery')}>
          <View style={styles.cardText}>
            <Text style={styles.recoveryTitle}>Interrupted edits available</Text>
            <Text style={styles.recoveryBody}>
              Review {recoveryCount} recovery {recoveryCount === 1 ? 'copy' : 'copies'}.
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={filteredDocuments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <SectionHeader title="Documents" count={filteredDocuments.length} />
            {filteredDocuments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No PDFs yet</Text>
                <Text style={styles.emptyBody}>Open a PDF from Files, Google Drive, or another provider.</Text>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.documentCard}
            onPress={() => router.push({ pathname: '/viewer/[id]', params: { id: item.id } })}
          >
            <View style={styles.pdfBadge}><Text style={styles.pdfBadgeText}>PDF</Text></View>
            <View style={styles.cardText}>
              <Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{item.source.replace('-', ' ')} · {formatBytes(item.sizeBytes)}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={styles.notesSection}>
            <SectionHeader title="Notes" count={filteredNotes.length} />
            {filteredNotes.map((note) => (
              <Pressable
                key={note.id}
                style={styles.noteCard}
                onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
              >
                <Text numberOfLines={1} style={styles.noteTitle}>{note.title}</Text>
                <Text numberOfLines={2} style={styles.notePreview}>{note.body || 'Start writing…'}</Text>
              </Pressable>
            ))}
          </View>
        }
      />
    </SafeAreaView>
  );
}

function showStorageError(error: unknown): void {
  Alert.alert(
    'Local storage unavailable',
    error instanceof Error ? error.message : String(error),
  );
}

function ActionButton({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable style={[styles.actionButton, primary && styles.actionButtonPrimary]} onPress={onPress}>
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes) return 'size unknown';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18 },
  eyebrow: { color: '#7B8290', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#151922', fontSize: 34, fontWeight: '800', letterSpacing: -1.2 },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#E9EEFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#2B5CFF', fontWeight: '800' },
  search: { margin: 18, marginBottom: 12, borderRadius: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 13, color: '#171B24', borderWidth: 1, borderColor: '#E8EAF0' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingBottom: 12 },
  actionButton: { flex: 1, alignItems: 'center', borderRadius: 11, backgroundColor: '#E9EBEF', paddingVertical: 10 },
  actionButtonPrimary: { backgroundColor: '#2B5CFF' },
  actionText: { color: '#4E5663', fontSize: 12, fontWeight: '700' },
  actionTextPrimary: { color: '#FFFFFF' },
  recoveryBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 18, marginBottom: 4, borderRadius: 14, padding: 13, backgroundColor: '#FFF7DA', borderWidth: 1, borderColor: '#E9D888' },
  recoveryTitle: { color: '#3D3416', fontSize: 13, fontWeight: '800' },
  recoveryBody: { marginTop: 3, color: '#786C3F', fontSize: 11 },
  list: { paddingHorizontal: 18, paddingBottom: 44 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 9 },
  sectionTitle: { color: '#232832', fontSize: 15, fontWeight: '800' },
  sectionCount: { color: '#8C929D', fontSize: 11, fontWeight: '700' },
  emptyCard: { borderRadius: 16, padding: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAF0' },
  emptyTitle: { color: '#242933', fontSize: 16, fontWeight: '700' },
  emptyBody: { marginTop: 5, color: '#7C8390', lineHeight: 20 },
  documentCard: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 9, borderRadius: 15, padding: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAF0' },
  pdfBadge: { width: 42, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#FFF0EC' },
  pdfBadgeText: { color: '#D65339', fontSize: 10, fontWeight: '900' },
  cardText: { flex: 1 },
  cardTitle: { color: '#20252E', fontSize: 14, fontWeight: '700' },
  cardMeta: { marginTop: 5, color: '#8A909B', fontSize: 11, textTransform: 'capitalize' },
  chevron: { color: '#A1A6AF', fontSize: 24 },
  notesSection: { paddingTop: 4 },
  noteCard: { marginBottom: 9, borderRadius: 15, padding: 15, backgroundColor: '#FFFDF6', borderWidth: 1, borderColor: '#EEE9D8' },
  noteTitle: { color: '#29281F', fontWeight: '700' },
  notePreview: { marginTop: 5, color: '#858170', lineHeight: 18 },
});
