import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Logo } from '../../components/Logo';
import { Input, Select } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorBanner } from '../../components/Alert';
import { useAuth } from '../../lib/AuthContext';
import { colors, fonts } from '../../theme/theme';

const ROLE_LABELS = { seller: 'Seller', buyer: 'Buyer', dealer: 'Dealer', broker: 'Broker' };

export default function Signup({ navigation, route }) {
  const { signup } = useAuth();
  const [role, setRole] = useState(route.params?.role || 'seller');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await signup({ email, password, fullName, phone, role });
      // RootNavigator swaps to the role's tab navigator automatically once `user` updates.
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
        <Text style={styles.heading}>Create your account</Text>
        <ErrorBanner message={error} />

        <Select label="I am a..." selectedValue={role} onValueChange={setRole}>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <Select.Item key={value} label={label} value={value} />
          ))}
        </Select>

        <Input label="Full name" value={fullName} onChangeText={setFullName} />
        <Input label="Phone" keyboardType="phone-pad" placeholder="+9715XXXXXXXX" value={phone} onChangeText={setPhone} />
        <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Input label="Password" secureTextEntry value={password} onChangeText={setPassword} />

        <Button onPress={handleSubmit} loading={loading}>
          Create account
        </Button>
        <Pressable onPress={() => navigation.navigate('Login')}>
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
