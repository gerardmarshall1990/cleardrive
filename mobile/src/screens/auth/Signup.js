import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Logo } from '../../components/Logo';
import { Input, Select } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorBanner } from '../../components/Alert';
import { useAuth } from '../../lib/AuthContext';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

const ROLE_LABELS = { dealer: 'Dealer', broker: 'Broker' };

export default function Signup({ navigation, route }) {
  const { signup } = useAuth();
  const joinDeal = route.params?.joinDeal;
  const joinRole = route.params?.joinRole;
  const [role, setRole] = useState(route.params?.role || 'individual');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emiratesId, setEmiratesId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const user = await signup({ email, password, fullName, phone, role, emiratesId: emiratesId.trim() || undefined });

      // Arrived via a join link — attach to the deal immediately on signup
      // completion and land directly inside it. No separate attach step.
      if (joinDeal && joinRole) {
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
        <Text style={styles.heading}>{joinDeal ? 'Join the deal — create your account' : 'Create your account'}</Text>
        <ErrorBanner message={error} />

        {role !== 'individual' && (
          <Select label="I am a..." selectedValue={role} onValueChange={setRole}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <Select.Item key={value} label={label} value={value} />
            ))}
          </Select>
        )}

        <Input label="Full name" value={fullName} onChangeText={setFullName} />
        <Input label="Phone" keyboardType="phone-pad" placeholder="+9715XXXXXXXX" value={phone} onChangeText={setPhone} />
        <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Input
          label="Emirates ID number (optional)"
          placeholder="784-XXXX-XXXXXXX-X"
          value={emiratesId}
          onChangeText={setEmiratesId}
        />
        <Input label="Password" secureTextEntry value={password} onChangeText={setPassword} />

        <Button onPress={handleSubmit} loading={loading}>
          {joinDeal ? 'Create account & join deal' : 'Create account'}
        </Button>
        <Pressable onPress={() => navigation.navigate('Login', joinDeal ? { joinRole, joinDeal } : undefined)}>
          <Text style={styles.footer}>
            Already have an account? <Text style={{ color: colors.gold }}>Log in</Text>
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingVertical: 48 },
  form: { marginTop: 30, width: '100%', maxWidth: 380, gap: 16 },
  heading: { textAlign: 'center', color: colors.white, fontFamily: fonts.display, fontSize: 20 },
  footer: { textAlign: 'center', color: colors.white50, fontFamily: fonts.sans, fontSize: 13 },
});
