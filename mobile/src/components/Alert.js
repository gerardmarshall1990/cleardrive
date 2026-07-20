import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/theme';

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <View style={[styles.wrap, { borderColor: 'rgba(22,163,74,0.3)', backgroundColor: 'rgba(22,163,74,0.1)' }]}>
      <Text style={[styles.text, { color: colors.green }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 12,
    marginBottom: 12,
  },
  text: {
    color: colors.error,
    fontFamily: fonts.sans,
    fontSize: 13,
  },
});
