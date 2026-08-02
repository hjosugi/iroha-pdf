import { useCallback, useEffect, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import {
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
import { alertFailure, confirmDestructive } from '@/lib/alerts';
import { createNote, deleteNote, listDocuments, listNotes, listRecoveryCopies } from '@/lib/database';
import { importPdfFromSystem, removeImportedDocument } from '@/lib/files';
import { t } from '@/lib/i18n';
import { markStoreCaptureReady, readStoreCaptureScenario } from '@/lib/store-capture-native';
import { COLOR, CONTROL, RADIUS, SPACE, TRACKING, TYPE } from '@/lib/theme';

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

  const confirmDeleteDocument = (document: WorkspaceDocument) => confirmDestructive({
    title: t('document.deleteTitle'),
    message: t('document.deleteBody', { name: document.title }),
    confirmLabel: t('action.delete'),
    // The quarantine step in removeImportedDocument can put the file back, so
    // the list is reloaded on failure too before the reason is shown.
    onConfirm: () => void removeImportedDocument(document)
      .then(refresh)
      .catch(async (error: unknown) => {
        await refresh();
        showStorageError(error);
      }),
  });

  const confirmDeleteNote = (note: Note) => confirmDestructive({
    title: t('note.deleteTitle'),
    message: t('note.deleteBody', { name: note.title }),
    confirmLabel: t('action.delete'),
    onConfirm: () => void deleteNote(note.id).then(refresh).catch(showStorageError),
  });

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
                accessibilityLabel={t('document.itemLabel', { title: item.title, size: formatBytes(item.sizeBytes) })}
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
                    accessibilityLabel={t('note.itemLabel', { title: note.title })}
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
  alertFailure(t('error.storage'), error);
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
  safeArea: { flex: 1, backgroundColor: COLOR.background },
  contentColumn: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACE.xl, paddingTop: SPACE.xl },
  identity: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  eyebrow: { color: '#7B8290', fontSize: TYPE.caption, fontWeight: '800', letterSpacing: TRACKING.wide },
  title: { color: '#151922', fontSize: TYPE.title, fontWeight: '800', letterSpacing: TRACKING.tight },
  avatar: { width: CONTROL.minimum, height: CONTROL.minimum, borderRadius: RADIUS.md, backgroundColor: '#E9EEFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLOR.brand, fontWeight: '800' },
  search: { margin: SPACE.xl, marginBottom: SPACE.md, borderRadius: RADIUS.md, backgroundColor: COLOR.surface, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, color: COLOR.text, borderWidth: SPACE.hairline, borderColor: '#E8EAF0' },
  actions: { flexDirection: 'row', gap: SPACE.sm, paddingHorizontal: SPACE.xl, paddingBottom: SPACE.md },
  actionButton: { flex: 1, minHeight: CONTROL.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: '#E9EBEF', paddingHorizontal: SPACE.sm, paddingVertical: SPACE.md },
  actionButtonPrimary: { backgroundColor: COLOR.brand },
  actionText: { color: '#4E5663', fontSize: TYPE.label, fontWeight: '700' },
  actionTextPrimary: { color: COLOR.surface },
  recoveryBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACE.xl, marginBottom: SPACE.xs, borderRadius: RADIUS.md, padding: SPACE.md, backgroundColor: '#FFF7DA', borderWidth: SPACE.hairline, borderColor: '#E9D888' },
  recoveryTitle: { color: '#3D3416', fontSize: TYPE.body, fontWeight: '800' },
  recoveryBody: { marginTop: SPACE.xxs, color: '#786C3F', fontSize: TYPE.caption },
  list: { paddingHorizontal: SPACE.xl, paddingBottom: CONTROL.minimum },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.lg, marginBottom: SPACE.sm },
  sectionTitle: { color: '#232832', fontSize: TYPE.heading, fontWeight: '800' },
  sectionCount: { color: '#8C929D', fontSize: TYPE.caption, fontWeight: '700' },
  emptyCard: { borderRadius: RADIUS.lg, padding: SPACE.xl, backgroundColor: COLOR.surface, borderWidth: SPACE.hairline, borderColor: '#E8EAF0' },
  emptyTitle: { color: '#242933', fontSize: TYPE.heading, fontWeight: '700' },
  emptyBody: { marginTop: SPACE.xs, color: '#7C8390', lineHeight: SPACE.xl },
  documentCard: { minHeight: CONTROL.card, flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.sm, borderRadius: RADIUS.lg, backgroundColor: COLOR.surface, borderWidth: SPACE.hairline, borderColor: '#E8EAF0', overflow: 'hidden' },
  cardMainAction: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.md },
  pdfBadge: { width: CONTROL.minimum, height: CONTROL.comfortable, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: '#FFF0EC' },
  pdfBadgeText: { color: '#D65339', fontSize: TYPE.caption, fontWeight: '900' },
  cardText: { flex: 1 },
  cardTitle: { color: '#20252E', fontSize: TYPE.body, fontWeight: '700' },
  cardMeta: { marginTop: SPACE.xs, color: '#8A909B', fontSize: TYPE.caption, textTransform: 'capitalize' },
  chevron: { color: '#A1A6AF', fontSize: SPACE.xxl },
  notesSection: { paddingTop: SPACE.xs },
  noteCard: { minHeight: CONTROL.card, flexDirection: 'row', alignItems: 'stretch', marginBottom: SPACE.sm, borderRadius: RADIUS.lg, backgroundColor: '#FFFDF6', borderWidth: SPACE.hairline, borderColor: '#EEE9D8', overflow: 'hidden' },
  noteMainAction: { minWidth: 0, flex: 1, justifyContent: 'center', padding: SPACE.lg },
  moreButton: { width: CONTROL.comfortable, minHeight: CONTROL.comfortable, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#7C8390', fontSize: TYPE.body, fontWeight: '800', letterSpacing: TRACKING.normal },
  noteTitle: { color: '#29281F', fontWeight: '700' },
  notePreview: { marginTop: SPACE.xs, color: '#858170', lineHeight: SPACE.xl },
});
