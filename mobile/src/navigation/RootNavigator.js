import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../lib/AuthContext';
import { colors } from '../theme/theme';
import { stackScreenOptions } from './navConfig';

import Welcome from '../screens/auth/Welcome';
import Login from '../screens/auth/Login';
import Signup from '../screens/auth/Signup';
import { IndividualTabs } from './IndividualTabs';
import { AdminTabs } from './AdminTabs';
import { PartnerTabs } from './PartnerTabs';

const Stack = createNativeStackNavigator();

const TABS_BY_ROLE = {
  individual: IndividualTabs,
  admin: AdminTabs,
  dealer: PartnerTabs,
  broker: PartnerTabs,
};

export function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (!user) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Welcome" component={Welcome} />
          <Stack.Screen name="Login" component={Login} />
          <Stack.Screen name="Signup" component={Signup} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  const Tabs = TABS_BY_ROLE[user.role] || IndividualTabs;
  return (
    <NavigationContainer>
      <Tabs />
    </NavigationContainer>
  );
}
