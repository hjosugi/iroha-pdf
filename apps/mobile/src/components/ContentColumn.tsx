import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type ContentColumnProps = PropsWithChildren<{
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Keeps phone screens fluid without turning tablet layouts into metre-wide rows.
 * The surrounding background still fills the window; only readable/actionable
 * content is capped and centred.
 */
export function ContentColumn({ children, maxWidth = 760, style }: ContentColumnProps) {
  return <View style={[styles.column, { maxWidth }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  column: {
    width: '100%',
    alignSelf: 'center',
  },
});
