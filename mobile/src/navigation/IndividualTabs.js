import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { stackScreenOptions, tabScreenOptions, tabIcon, LogoutButton } from './navConfig';

import MyDeals from '../screens/MyDeals';
import NewDeal from '../screens/NewDeal';
import DealDetail from '../screens/DealDetail';

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

// Single tab set for every individual account, whichever side they're
// playing on a given deal — mirrors the web unified /deals routes.
export function IndividualTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="MyDeals" component={MyDealsStack} options={{ tabBarLabel: 'My Deals', tabBarIcon: tabIcon('🚗') }} />
      <Tab.Screen name="NewDeal" component={NewDealStack} options={{ tabBarLabel: 'New Deal', tabBarIcon: tabIcon('➕') }} />
    </Tab.Navigator>
  );
}
