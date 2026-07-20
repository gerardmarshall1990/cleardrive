import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { stackScreenOptions, tabScreenOptions, tabIcon, LogoutButton } from './navConfig';

import MyDeals from '../screens/buyer/MyDeals';
import DealDetail from '../screens/buyer/DealDetail';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MyDealsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="MyDealsList" component={MyDeals} options={{ title: 'My Deals', headerRight: LogoutButton }} />
      <Stack.Screen name="DealDetail" component={DealDetail} options={{ title: 'Deal' }} />
    </Stack.Navigator>
  );
}

export function BuyerTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="MyDeals" component={MyDealsStack} options={{ tabBarLabel: 'My Deals', tabBarIcon: tabIcon('🚗') }} />
    </Tab.Navigator>
  );
}
