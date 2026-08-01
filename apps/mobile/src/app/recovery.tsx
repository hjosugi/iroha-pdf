import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  discardRecoveryCopy,
  listRecoveryCopies,
  restoreRecoveryCopy,
  type RecoveryCopy,
} from '@/lib/database';
import { ContentColumn } from '@/components/ContentColumn';
import { t } from '@/lib/i18n';

export default function RecoveryScreen() {
  const [copies, setCopies] = useState<RecoveryCopy[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => setCopies(await listRecoveryCopies()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (copy: RecoveryCopy, action: 'restore' | 'discard') => {
    setBusyId(copy.journalId);
    try {
      if (action === 'restore') await restoreRecoveryCopy(copy.journalId);
      else await discardRecoveryCopy(copy.journalId);
      await refresh();
    } catch (error) {
      Alert.alert(t('recovery.failed'), error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDiscard = (copy: RecoveryCopy) => {
    Alert.alert(
      t('recovery.discardTitle'),
      t('recovery.discardBody'),
      [
        { text: t('action.cancel'), style: 'cancel' },
        { text: t('recovery.discard'), style: 'destructive', onPress: () => void act(copy, 'discard') },
      ],
    );
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <FlatList
        data={copies}
        keyExtractor={(item) => item.journalId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <ContentColumn>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>{t('recovery.title')}</Text>
              <Text style={styles.description}>
                {t('recovery.description')}
              </Text>
            </View>
          </ContentColumn>
        }
        ListEmptyComponent={<ContentColumn><Text style={styles.empty}>{t('recovery.empty')}</Text></ContentColumn>}
        renderItem={({ item }) => {
          const summary = item.entityType === 'note'
            ? 'body' in item.payload
              ? item.payload.body || t('recovery.emptyNote')
              : t('recovery.noteEdit')
            : 'kind' in item.payload
              ? `${item.payload.kind} · ${t('recovery.annotation')}`
              : t('recovery.annotationEdit');
          const entityLabel = t(item.entityType === 'note' ? 'recovery.note' : 'recovery.annotation');
          const statusLabel = t(item.status === 'rolled-back'
            ? 'recovery.rolledBack'
            : item.status === 'diverged'
              ? 'recovery.diverged'
              : 'recovery.failedStatus');
          return (
            <ContentColumn>
              <View style={styles.card}>
                <Text accessibilityRole="header" style={styles.cardTitle}>{entityLabel} · {statusLabel}</Text>
                <Text numberOfLines={3} style={styles.summary}>{summary}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('recovery.discardLabel')}
                    accessibilityState={{ disabled: busyId === item.journalId }}
                    disabled={busyId === item.journalId}
                    style={[styles.secondaryButton, busyId === item.journalId && styles.disabled]}
                    onPress={() => confirmDiscard(item)}
                  >
                    <Text>{t('recovery.discard')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('recovery.restoreLabel')}
                    accessibilityState={{ disabled: busyId === item.journalId }}
                    disabled={busyId === item.journalId}
                    style={[styles.primaryButton, busyId === item.journalId && styles.disabled]}
                    onPress={() => void act(item, 'restore')}
                  >
                    <Text style={styles.primaryText}>{t('recovery.restoreCopy')}</Text>
                  </Pressable>
                </View>
              </View>
            </ContentColumn>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F9' },
  list: { padding: 20, gap: 12 },
  header: { marginBottom: 12 },
  title: { color: '#171B24', fontSize: 28, fontWeight: '800' },
  description: { marginTop: 8, color: '#6F7682', lineHeight: 20 },
  empty: { borderRadius: 14, padding: 18, color: '#6F7682', backgroundColor: '#FFFFFF' },
  card: { borderRadius: 16, padding: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E8ED' },
  cardTitle: { color: '#252A34', fontWeight: '800', textTransform: 'capitalize' },
  summary: { marginTop: 8, color: '#606875', lineHeight: 19 },
  date: { marginTop: 8, color: '#969CA6', fontSize: 11 },
  actions: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  secondaryButton: { minHeight: 44, justifyContent: 'center', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#ECEEF2' },
  primaryButton: { minHeight: 44, justifyContent: 'center', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#2B5CFF' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
