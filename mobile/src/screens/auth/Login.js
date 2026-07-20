import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Logo } from '../../components/Logo';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorBanner } from '../../components/Alert';
import { useAuth } from '../../lib/AuthContext';
import { colors, fonts } from '../../theme/theme';

export default function Login({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await login(email, password);
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
        <Text style={styles.heading}>Log in</Text>
        <ErrorBanner message={error} />
        <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Input label="Password" secureTextEntry value={password} onChangeText={setPassword} />
        <Button onPress={handleSubmit} loading={loading}>
          Log in
        </Button>
        <Pressable onPress={() => navigation.navigate('Signup')}>
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
