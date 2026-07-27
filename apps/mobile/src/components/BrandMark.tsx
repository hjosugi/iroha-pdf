import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

export function BrandMark() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.container}>
      <Svg height={28} viewBox="0 0 1024 1024" width={28}>
        <G
          fill="none"
          stroke="#FFFFFF"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={82}
        >
          <Path d="M330 292c-22 132-12 307 43 407 31 57 81 31 129-69" />
          <Path d="M587 347c82 80 119 181 127 303" />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#2B5CFF',
    borderRadius: 13,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
});
