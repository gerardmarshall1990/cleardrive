import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/Button';
import { ErrorBanner } from '../../components/Alert';
import { useAuth } from '../../lib/AuthContext';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

// The join-link landing screen — mirrors web/src/pages/JoinDeal.jsx. Reached
// either via a deep link (cleardrive://join/:dealId/:role) or by navigating
// here manually after Login/Signup carry the same params through.
//  - Already logged in as the right role -> immediately attached, redirected
//    into the deal.
//  - Logged in as the wrong role -> clear error + option to log out and use
//    the correct account.
//  - Not logged in -> choice of quick signup or login, both of which carry
//    the dealId/role through and auto-join immediately on completion.
export default function JoinDeal({ route, navigation }) {
  const { dealId, role } = route.params || {};
  const { user, loading, logout } = useAuth();
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (user.role !== 'individual') {
      setError(`This invite requires an individual account — you're currently logged in as a ${user.role} account.`);
      return;
    }
    setJoining(true);
    api
      .post(`/api/deals/${dealId}/join`, { role })
      .then(({ deal }) => {
        navigation.navigate('Tabs', { screen: 'MyDeals', params: { screen: 'DealDetail', params: { id: deal.id } } });
      })
      .catch((err) => {
        setError(err.message);
        setJoining(false);
      });
  }, [user, loading, dealId, role, navigation]);

  if (loading || joining) {
    return (
      <View style={[styles.wrap, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} style={{ backgroundColor: colors.navy }}>
      <Logo />
      <Text style={styles.heading}>You're invited to a ClearDrive deal</Text>
      <Text style={styles.subheading}>
        Join as the <Text style={styles.roleText}>{role}</Text> to see this deal.
      </Text>
      <ErrorBanner message={error} />

      {!user && (
        <View style={styles.actions}>
          <Button onPress={() => navigation.navigate('Signup', { joinRole: role, joinDeal: dealId })}>
            Create account & join
          </Button>
          <Button variant="secondary" onPress={() => navigation.navigate('Login', { joinRole: role, joinDeal: dealId })}>
            I already have an account — log in
          </Button>
        </View>
      )}

      {user && error && (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            onPress={async () => {
              await logout();
              navigation.navigate('Login', { joinRole: role, joinDeal: dealId });
            }}
          >
            Log out and use a different account
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 80, gap: 8 },
  heading: { marginTop: 24, textAlign: 'center', color: colors.white, fontFamily: fonts.display, fontSize: 19 },
  subheading: { textAlign: 'center', color: colors.white50, fontFamily: fonts.sans, fontSize: 13, maxWidth: 320, marginTop: 6, marginBottom: 12 },
  roleText: { color: colors.white70, fontFamily: fonts.sansSemiBold, textTransform: 'capitalize' },
  actions: { marginTop: 16, width: '100%', maxWidth: 320, gap: 12 },
});
