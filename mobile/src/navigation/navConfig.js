import { Pressable, Text } from 'react-native';
import { colors, fonts } from '../theme/theme';
import { useAuth } from '../lib/AuthContext';

export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.navy },
  headerTintColor: colors.white,
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 17 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.navy },
};

export const tabScreenOptions = {
  headerShown: false,
  tabBarStyle: { backgroundColor: colors.navy, borderTopColor: colors.white8 },
  tabBarActiveTintColor: colors.gold,
  tabBarInactiveTintColor: colors.white30,
  tabBarLabelStyle: { fontFamily: fonts.sans, fontSize: 11 },
};

export function tabIcon(emoji) {
  return () => <Text style={{ fontSize: 18 }}>{emoji}</Text>;
}

export function LogoutButton() {
  const { logout } = useAuth();
  return (
    <Pressable onPress={logout} hitSlop={10} style={{ paddingHorizontal: 4 }}>
      <Text style={{ color: colors.white50, fontFamily: fonts.sans, fontSize: 13 }}>Log out</Text>
    </Pressable>
  );
}
