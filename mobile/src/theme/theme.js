// Design tokens mirroring the web app's Tailwind config — Navy background,
// Gold for LoanClear, Green for SafePay, Playfair Display + Inter fonts.
export const colors = {
  navy: '#0D2A4A',
  navyLight: '#153a63',
  gold: '#C9A84C',
  green: '#16A34A',
  error: '#EF4444',
  white: '#FFFFFF',
  white70: 'rgba(255,255,255,0.7)',
  white50: 'rgba(255,255,255,0.5)',
  white40: 'rgba(255,255,255,0.4)',
  white30: 'rgba(255,255,255,0.3)',
  white20: 'rgba(255,255,255,0.2)',
  white8: 'rgba(255,255,255,0.08)',
  white4: 'rgba(255,255,255,0.04)',
};

export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  sans: 'Inter_400Regular',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
};

export function accentColor(product) {
  return product === 'safepay' ? colors.green : colors.gold;
}
