import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../lib/AuthContext';
import { colors } from '../theme/theme';
import { stackScreenOptions } from './navConfig';

import Welcome from '../screens/auth/Welcome';
import Login from '../screens/auth/Login';
import Signup from '../screens/auth/Signup';
import JoinDeal from '../screens/auth/JoinDeal';
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

// Custom scheme registered in app.json ("scheme": "cleardrive"). Lets a
// join link (cleardrive://join/:dealId/:role) — the mobile counterpart of
// the emailed/WhatsApp'd web join link — open straight to the JoinDeal
// screen regardless of whether the app is currently logged in or out.
const linking = {
  prefixes: ['cleardrive://'],
  config: {
    screens: {
      JoinDeal: 'join/:dealId/:role',
    },
  },
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

  const Tabs = TABS_BY_ROLE[user?.role] || IndividualTabs;

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Tabs" component={Tabs} />
        ) : (
          <>
            <Stack.Screen name="Welcome" component={Welcome} />
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Signup" component={Signup} />
          </>
        )}
        <Stack.Screen name="JoinDeal" component={JoinDeal} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
