import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Logo } from '../../components/Logo';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorBanner } from '../../components/Alert';
import { useAuth } from '../../lib/AuthContext';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

export default function Login({ navigation, route }) {
  const { login } = useAuth();
  const joinDeal = route.params?.joinDeal;
  const joinRole = route.params?.joinRole;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);

      // Arrived via a join link — attach to the deal immediately and land
      // directly inside it, instead of the generic role-based tab navigator.
      if (joinDeal && joinRole) {
        if (user.role !== 'individual') {
          setError(`This invite requires an individual account — you're logged in as a ${user.role} account`);
          return;
        }
        const { deal } = await api.post(`/api/deals/${joinDeal}/join`, { role: joinRole });
        navigation.navigate('Tabs', { screen: 'MyDeals', params: { screen: 'DealDetail', params: { id: deal.id } } });
        return;
      }
      // Otherwise, RootNavigator swaps to the role's tab navigator automatically once `user` updates.
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} style={{ backgroundColor: colors.navy }}>
      <Logo />
      <View style={styles.form}>
        <Text style={styles.heading}>Log in</Text>
        <ErrorBanner message={error} />
        <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Input label="Password" secureTextEntry value={password} onChangeText={setPassword} />
        <Button onPress={handleSubmit} loading={loading}>
          Log in
        </Button>
        <Pressable onPress={() => navigation.navigate('Signup', joinDeal ? { joinRole, joinDeal } : undefined)}>
          <Text style={styles.footer}>
            No account? <Text style={{ color: colors.gold }}>Sign up</Text>
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  form: { marginTop: 40, width: '100%', maxWidth: 380, gap: 18 },
  heading: { textAlign: 'center', color: colors.white, fontFamily: fonts.display, fontSize: 20 },
  footer: { textAlign: 'center', color: colors.white50, fontFamily: fonts.sans, fontSize: 13 },
});
