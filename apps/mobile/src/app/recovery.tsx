import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  discardRecoveryCopy,
  listRecoveryCopies,
  restoreRecoveryCopy,
  type RecoveryCopy,
} from '@/lib/database';
import { ContentColumn } from '@/components/ContentColumn';
import { alertFailure, confirmDestructive } from '@/lib/alerts';
import { t } from '@/lib/i18n';
import { COLOR, CONTROL, RADIUS, SPACE, TYPE } from '@/lib/theme';

function statusLabel(status: RecoveryCopy['status']): string {
  switch (status) {
    case 'rolled-back': return t('recovery.rolledBack');
    case 'diverged': return t('recovery.diverged');
    case 'failed': return t('recovery.failedStatus');
  }
}

function summarize(copy: RecoveryCopy): string {
  if (copy.entityType === 'note') {
    return 'body' in copy.payload
      ? copy.payload.body || t('recovery.emptyNote')
      : t('recovery.noteEdit');
  }
  return 'kind' in copy.payload
    ? `${copy.payload.kind} · ${t('recovery.annotation')}`
    : t('recovery.annotationEdit');
}

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
      alertFailure(t('recovery.failed'), error);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDiscard = (copy: RecoveryCopy) => confirmDestructive({
    title: t('recovery.discardTitle'),
    message: t('recovery.discardBody'),
    confirmLabel: t('recovery.discard'),
    onConfirm: () => void act(copy, 'discard'),
  });

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
          const entityLabel = t(item.entityType === 'note' ? 'recovery.note' : 'recovery.annotation');
          const busy = busyId === item.journalId;
          return (
            <ContentColumn>
              <View style={styles.card}>
                <Text accessibilityRole="header" style={styles.cardTitle}>{entityLabel} · {statusLabel(item.status)}</Text>
                <Text numberOfLines={3} style={styles.summary}>{summarize(item)}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('recovery.discardLabel')}
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    style={[styles.secondaryButton, busy && styles.disabled]}
                    onPress={() => confirmDiscard(item)}
                  >
                    <Text>{t('recovery.discard')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('recovery.restoreLabel')}
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    style={[styles.primaryButton, busy && styles.disabled]}
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
  safeArea: { flex: 1, backgroundColor: COLOR.background },
  list: { padding: SPACE.xl, gap: SPACE.md },
  header: { marginBottom: SPACE.md },
  title: { color: COLOR.text, fontSize: TYPE.title, fontWeight: '800' },
  description: { marginTop: SPACE.sm, color: '#6F7682', lineHeight: SPACE.xl },
  empty: { borderRadius: RADIUS.md, padding: SPACE.xl, color: '#6F7682', backgroundColor: COLOR.surface },
  card: { borderRadius: RADIUS.lg, padding: SPACE.lg, backgroundColor: COLOR.surface, borderWidth: SPACE.hairline, borderColor: '#E6E8ED' },
  cardTitle: { color: '#252A34', fontWeight: '800', textTransform: 'capitalize' },
  summary: { marginTop: SPACE.sm, color: '#606875', lineHeight: SPACE.xl },
  date: { marginTop: SPACE.sm, color: '#969CA6', fontSize: TYPE.caption },
  actions: { marginTop: SPACE.lg, flexDirection: 'row', justifyContent: 'flex-end', gap: SPACE.sm },
  secondaryButton: { minHeight: CONTROL.minimum, justifyContent: 'center', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, backgroundColor: COLOR.control },
  primaryButton: { minHeight: CONTROL.minimum, justifyContent: 'center', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, backgroundColor: COLOR.brand },
  primaryText: { color: COLOR.surface, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
