import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/theme';

export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {action && <View style={{ marginTop: 16 }}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.white, textAlign: 'center' },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50, textAlign: 'center', marginTop: 6 },
});
