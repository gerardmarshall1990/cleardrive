import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { stackScreenOptions, tabScreenOptions, tabIcon, LogoutButton } from './navConfig';

import MyReferrals from '../screens/partner/MyReferrals';
import NewReferral from '../screens/partner/NewReferral';
import DealDetail from '../screens/partner/DealDetail';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MyReferralsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="MyReferralsList" component={MyReferrals} options={{ title: 'My Referrals', headerRight: LogoutButton }} />
      <Stack.Screen name="DealDetail" component={DealDetail} options={{ title: 'Deal' }} />
    </Stack.Navigator>
  );
}

function NewReferralStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="NewReferralScreen" component={NewReferral} options={{ title: 'New Referral' }} />
    </Stack.Navigator>
  );
}

export function PartnerTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="MyReferrals" component={MyReferralsStack} options={{ tabBarLabel: 'My Referrals', tabBarIcon: tabIcon('📋') }} />
      <Tab.Screen name="NewReferral" component={NewReferralStack} options={{ tabBarLabel: 'New Referral', tabBarIcon: tabIcon('➕') }} />
    </Tab.Navigator>
  );
}
