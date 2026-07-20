import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/theme';

const VARIANTS = {
  verified: { bg: 'rgba(22,163,74,0.15)', fg: colors.green },
  pending: { bg: 'rgba(201,168,76,0.15)', fg: colors.gold },
  error: { bg: 'rgba(239,68,68,0.15)', fg: colors.error },
};

export function Badge({ variant = 'pending', children }) {
  const v = VARIANTS[variant] || VARIANTS.pending;
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }]}>
      <Text style={[styles.text, { color: v.fg }]}>{children}</Text>
    </View>
  );
}

export function ProductBadge({ product }) {
  const isSafePay = product === 'safepay';
  return (
    <View style={[styles.badge, { backgroundColor: isSafePay ? 'rgba(22,163,74,0.15)' : 'rgba(201,168,76,0.15)' }]}>
      <Text style={[styles.text, { color: isSafePay ? colors.green : colors.gold }]}>
        {isSafePay ? 'SafePay' : 'LoanClear'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  text: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
  },
});
