import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { stackScreenOptions, tabScreenOptions, tabIcon, LogoutButton } from './navConfig';

import Dashboard from '../screens/admin/Dashboard';
import DealDetail from '../screens/admin/DealDetail';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="DashboardScreen" component={Dashboard} options={{ title: 'Admin', headerRight: LogoutButton }} />
      <Stack.Screen name="DealDetail" component={DealDetail} options={{ title: 'Deal' }} />
    </Stack.Navigator>
  );
}

export function AdminTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{ tabBarLabel: 'Dashboard', tabBarIcon: tabIcon('📊') }} />
    </Tab.Navigator>
  );
}
