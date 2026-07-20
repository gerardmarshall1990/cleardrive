import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/theme';

const VARIANTS = {
  gold: { bg: colors.gold, fg: colors.navy },
  green: { bg: colors.green, fg: '#ffffff' },
  secondary: { bg: 'transparent', fg: colors.white, border: colors.white20 },
  ghost: { bg: 'transparent', fg: colors.white70, border: colors.white20 },
};

export function Button({ children, onPress, variant = 'gold', loading, disabled, style }) {
  const v = VARIANTS[variant] || VARIANTS.gold;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border ? 1 : 0 },
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[styles.text, { color: v.fg }]}>{children}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
