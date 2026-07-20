import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/theme';

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={[styles.bar, { width: '40%' }]} />
      <View style={[styles.bar, { width: '65%', marginTop: 10 }]} />
      <View style={[styles.bar, { width: '30%', marginTop: 10 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.white8,
    backgroundColor: colors.white4,
    padding: 16,
  },
  bar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.white8,
  },
});
