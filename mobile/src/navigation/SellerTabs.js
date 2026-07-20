import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { stackScreenOptions, tabScreenOptions, tabIcon, LogoutButton } from './navConfig';

import MyDeals from '../screens/seller/MyDeals';
import NewDeal from '../screens/seller/NewDeal';
import DealDetail from '../screens/seller/DealDetail';

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

function NewDealStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="NewDealScreen" component={NewDeal} options={{ title: 'New Deal' }} />
    </Stack.Navigator>
  );
}

export function SellerTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="MyDeals" component={MyDealsStack} options={{ tabBarLabel: 'My Deals', tabBarIcon: tabIcon('🚗') }} />
      <Tab.Screen name="NewDeal" component={NewDealStack} options={{ tabBarLabel: 'New Deal', tabBarIcon: tabIcon('➕') }} />
    </Tab.Navigator>
  );
}
