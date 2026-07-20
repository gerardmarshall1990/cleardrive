import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/theme';

export function DarkCard({ children, style }) {
  return <View style={[styles.dark, style]}>{children}</View>;
}

export function GoldCard({ children, style }) {
  return <View style={[styles.gold, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  dark: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.white8,
    backgroundColor: colors.white4,
    padding: 16,
  },
  gold: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.35)',
    backgroundColor: 'rgba(201,168,76,0.08)',
    padding: 16,
  },
});
