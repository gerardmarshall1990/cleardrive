import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Logo } from '../../components/Logo';
import { colors, fonts } from '../../theme/theme';

export default function Welcome({ navigation }) {
  return (
    <ScrollView contentContainerStyle={styles.wrap} style={{ backgroundColor: colors.navy }}>
      <Logo size="lg" />

      <View style={styles.cards}>
        <Pressable onPress={() => navigation.navigate('Signup', { product: 'loanclear' })}>
          <View style={[styles.card, { borderTopColor: colors.gold }]}>
            <Text style={[styles.cardTitle, { color: colors.gold }]}>LoanClear</Text>
            <Text style={styles.cardSubtitle}>Sell your financed car</Text>
            <Text style={styles.cardBody}>Loan cleared same day. Full private sale price.</Text>
            <View style={[styles.cta, { backgroundColor: colors.gold }]}>
              <Text style={[styles.ctaText, { color: colors.navy }]}>Get Started →</Text>
            </View>
          </View>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Signup', { product: 'safepay' })}>
          <View style={[styles.card, { borderTopColor: colors.green }]}>
            <Text style={[styles.cardTitle, { color: colors.green }]}>SafePay</Text>
            <Text style={styles.cardSubtitle}>Any private sale, no loan</Text>
            <Text style={styles.cardBody}>Secure escrow for private sales with no existing loan, AED 100,000+.</Text>
            <View style={[styles.cta, { backgroundColor: colors.green }]}>
              <Text style={[styles.ctaText, { color: '#fff' }]}>Get Started →</Text>
            </View>
          </View>
        </Pressable>
      </View>

      <View style={styles.links}>
        <Pressable onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Already have an account? Log in →</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Signup', { role: 'dealer' })}>
          <Text style={styles.linkDim}>I'm a dealer or broker →</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 80, paddingBottom: 60, gap: 8 },
  cards: { marginTop: 40, width: '100%', gap: 16 },
  card: {
    borderRadius: 16,
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: colors.white8,
    backgroundColor: colors.white4,
    padding: 20,
  },
  cardTitle: { fontFamily: fonts.display, fontSize: 22 },
  cardSubtitle: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.white70, marginTop: 4 },
  cardBody: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50, marginTop: 10 },
  cta: { marginTop: 18, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  ctaText: { fontFamily: fonts.sansBold, fontSize: 14 },
  links: { marginTop: 32, alignItems: 'center', gap: 14 },
  link: { color: colors.white70, fontFamily: fonts.sans, fontSize: 13 },
  linkDim: { color: colors.white40, fontFamily: fonts.sans, fontSize: 13 },
});
