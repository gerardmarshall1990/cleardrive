import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/theme';

export function Logo({ size = 'md', showTagline = true }) {
  const fontSize = size === 'sm' ? 18 : 28;
  return (
    <View>
      <Text style={[styles.wordmark, { fontSize }]}>
        Clear<Text style={{ color: colors.gold }}>Drive</Text>
      </Text>
      {showTagline && <Text style={styles.tagline}>Escrow for every car sale in the UAE</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { fontFamily: fonts.display, color: colors.white },
  tagline: { fontFamily: fonts.sans, color: colors.white40, fontSize: 12, marginTop: 4 },
});
