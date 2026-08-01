import { useCallback, useEffect, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
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
import { BrandMark } from '@/components/BrandMark';
import { ContentColumn } from '@/components/ContentColumn';
import { createNote, deleteNote, listDocuments, listNotes, listRecoveryCopies } from '@/lib/database';
import { importPdfFromSystem, removeImportedDocument } from '@/lib/files';
import { t } from '@/lib/i18n';
import { markStoreCaptureReady, readStoreCaptureScenario } from '@/lib/store-capture-native';

export default function LibraryRoute() {
  const scenario = readStoreCaptureScenario();
  if (scenario) {
    return <Redirect href={{ pathname: '/store-preview', params: { screen: scenario } }} />;
  }
  return <LibraryScreen />;
}

function LibraryScreen() {
  const router = useRouter();
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (documents.length >= 2 && notes.length >= 2) markStoreCaptureReady('library');
  }, [documents.length, notes.length]);

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
      const note = await createNote(t('note.untitled'));
      await refresh();
      router.push({ pathname: '/note/[id]', params: { id: note.id } });
    } catch (error) {
      showStorageError(error);
    }
  };

  const confirmDeleteDocument = (document: WorkspaceDocument) => {
    Alert.alert(
      t('document.deleteTitle'),
      t('document.deleteBody', { name: document.title }),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.delete'),
          style: 'destructive',
          onPress: () => void removeImportedDocument(document)
            .then(refresh)
            .catch(async (error: unknown) => {
              await refresh();
              showStorageError(error);
            }),
        },
      ],
    );
  };

  const confirmDeleteNote = (note: Note) => {
    Alert.alert(
      t('note.deleteTitle'),
      t('note.deleteBody', { name: note.title }),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.delete'),
          style: 'destructive',
          onPress: () => void deleteNote(note.id).then(refresh).catch(showStorageError),
        },
      ],
    );
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
      <ContentColumn style={styles.contentColumn}>
        <View style={styles.header}>
          <View style={styles.identity}>
            <BrandMark />
            <View>
              <Text style={styles.eyebrow}>{t('app.localWorkspace').toLocaleUpperCase()}</Text>
              <Text accessibilityRole="header" style={styles.title}>Iroha PDF</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Google Drive"
            accessibilityHint={t('drive.openHint')}
            hitSlop={4}
            style={styles.avatar}
            onPress={() => router.push('/drive')}
          >
            <Text style={styles.avatarText}>G</Text>
          </Pressable>
        </View>

        <TextInput
          accessibilityLabel={t('document.search')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('document.search')}
          placeholderTextColor="#8B919C"
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={styles.search}
        />

        <View accessibilityRole="toolbar" style={styles.actions}>
          <ActionButton label={t('document.open')} primary onPress={importPdf} />
          <ActionButton label={t('note.new')} onPress={newNote} />
          <ActionButton label={t('tools.title')} onPress={() => router.push('/tools')} />
        </View>

        {recoveryCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(recoveryCount === 1 ? 'recovery.bannerLabelOne' : 'recovery.bannerLabel', { count: recoveryCount })}
            accessibilityHint={t('recovery.bannerHint')}
            style={styles.recoveryBanner}
            onPress={() => router.push('/recovery')}
          >
            <View style={styles.cardText}>
              <Text style={styles.recoveryTitle}>{t('recovery.bannerTitle')}</Text>
              <Text style={styles.recoveryBody}>
                {t(recoveryCount === 1 ? 'recovery.bannerBodyOne' : 'recovery.bannerBody', { count: recoveryCount })}
              </Text>
            </View>
            <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
          </Pressable>
        ) : null}

        <FlatList
          data={filteredDocuments}
          keyExtractor={(item) => item.id}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              <SectionHeader title={t('document.list')} count={filteredDocuments.length} />
              {filteredDocuments.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text accessibilityRole="header" style={styles.emptyTitle}>
                    {t(normalizedQuery ? 'document.noMatch' : 'document.noPdf')}
                  </Text>
                  <Text style={styles.emptyBody}>
                    {t(normalizedQuery ? 'document.searchAgain' : 'document.importHelp')}
                  </Text>
                </View>
              ) : null}
            </>
          }
          renderItem={({ item }) => (
            <View style={styles.documentCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, PDF, ${formatBytes(item.sizeBytes)}`}
                accessibilityHint={t('document.openHint')}
                style={styles.cardMainAction}
                onPress={() => router.push({ pathname: '/viewer/[id]', params: { id: item.id } })}
              >
                <View accessibilityElementsHidden style={styles.pdfBadge}><Text style={styles.pdfBadgeText}>PDF</Text></View>
                <View style={styles.cardText}>
                  <Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMeta}>{sourceLabel(item.source)} · {formatBytes(item.sizeBytes)}</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('document.more', { name: item.title })} accessibilityHint={t('document.deleteHint')} style={styles.moreButton} onPress={() => confirmDeleteDocument(item)}>
                <Text style={styles.moreText}>•••</Text>
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.notesSection}>
              <SectionHeader title={t('note.list')} count={filteredNotes.length} />
              {filteredNotes.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyBody}>{t(normalizedQuery ? 'note.noMatch' : 'note.emptyHelp')}</Text>
                </View>
              ) : null}
              {filteredNotes.map((note) => (
                <View key={note.id} style={styles.noteCard}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${note.title}, note`}
                    accessibilityHint={t('note.openHint')}
                    style={styles.noteMainAction}
                    onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
                  >
                    <Text numberOfLines={1} style={styles.noteTitle}>{note.title}</Text>
                    <Text numberOfLines={2} style={styles.notePreview}>{note.body || t('note.start')}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('note.more', { name: note.title })} accessibilityHint={t('note.deleteHint')} style={styles.moreButton} onPress={() => confirmDeleteNote(note)}>
                    <Text style={styles.moreText}>•••</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          }
        />
      </ContentColumn>
    </SafeAreaView>
  );
}

function showStorageError(error: unknown): void {
  Alert.alert(
    t('error.storage'),
    error instanceof Error ? error.message : String(error),
  );
}

function ActionButton({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={[styles.actionButton, primary && styles.actionButtonPrimary]} onPress={onPress}>
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
  if (!bytes) return t('document.sizeUnknown');
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceLabel(source: WorkspaceDocument['source']): string {
  switch (source) {
    case 'local': return t('document.sourceLocal');
    case 'google-drive': return t('document.sourceDrive');
    case 'icloud': return t('document.sourceIcloud');
    case 'external-provider': return t('document.sourceProvider');
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F9' },
  contentColumn: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { color: '#7B8290', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#151922', fontSize: 30, fontWeight: '800', letterSpacing: -1.1 },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#E9EEFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#2B5CFF', fontWeight: '800' },
  search: { margin: 18, marginBottom: 12, borderRadius: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 13, color: '#171B24', borderWidth: 1, borderColor: '#E8EAF0' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingBottom: 12 },
  actionButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#E9EBEF', paddingHorizontal: 8, paddingVertical: 10 },
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
  documentCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', marginBottom: 9, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EAF0', overflow: 'hidden' },
  cardMainAction: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13 },
  pdfBadge: { width: 42, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#FFF0EC' },
  pdfBadgeText: { color: '#D65339', fontSize: 10, fontWeight: '900' },
  cardText: { flex: 1 },
  cardTitle: { color: '#20252E', fontSize: 14, fontWeight: '700' },
  cardMeta: { marginTop: 5, color: '#8A909B', fontSize: 11, textTransform: 'capitalize' },
  chevron: { color: '#A1A6AF', fontSize: 24 },
  notesSection: { paddingTop: 4 },
  noteCard: { minHeight: 72, flexDirection: 'row', alignItems: 'stretch', marginBottom: 9, borderRadius: 15, backgroundColor: '#FFFDF6', borderWidth: 1, borderColor: '#EEE9D8', overflow: 'hidden' },
  noteMainAction: { minWidth: 0, flex: 1, justifyContent: 'center', padding: 15 },
  moreButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#7C8390', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  noteTitle: { color: '#29281F', fontWeight: '700' },
  notePreview: { marginTop: 5, color: '#858170', lineHeight: 18 },
});
