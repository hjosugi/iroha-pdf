import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import {
  discardRecoveryCopy,
  listRecoveryCopies,
  restoreRecoveryCopy,
  type RecoveryCopy,
} from '@/lib/database';

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
      Alert.alert('Recovery failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={copies}
        keyExtractor={(item) => item.journalId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Recovery copies</Text>
            <Text style={styles.description}>
              The last valid saved state was kept. Review the interrupted edit before restoring it.
            </Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>No interrupted edits need recovery.</Text>}
        renderItem={({ item }) => {
          const summary = item.entityType === 'note'
            ? 'body' in item.payload
              ? item.payload.body || '(empty note)'
              : 'Note edit'
            : 'kind' in item.payload
              ? `${item.payload.kind} annotation`
              : 'Annotation edit';
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.entityType} · {item.status}</Text>
              <Text numberOfLines={3} style={styles.summary}>{summary}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
              <View style={styles.actions}>
                <Pressable
                  disabled={busyId === item.journalId}
                  style={styles.secondaryButton}
                  onPress={() => void act(item, 'discard')}
                >
                  <Text>Discard</Text>
                </Pressable>
                <Pressable
                  disabled={busyId === item.journalId}
                  style={styles.primaryButton}
                  onPress={() => void act(item, 'restore')}
                >
                  <Text style={styles.primaryText}>Restore copy</Text>
                </Pressable>
              </View>
            </View>
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
  secondaryButton: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#ECEEF2' },
  primaryButton: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#2B5CFF' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
});
