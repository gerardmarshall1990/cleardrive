import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null); // our `users` table row (role, name, etc.)
  const [loading, setLoading] = useState(true);

  const loadAppUser = useCallback(async () => {
    try {
      const { user: appUser } = await api.me();
      setUser(appUser);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      if (session) await loadAppUser();
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) await loadAppUser();
      else setUser(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadAppUser]);

  async function signup(fields) {
    const { user: appUser, session: newSession } = await api.signup(fields);
    if (newSession) {
      await supabase.auth.setSession({ access_token: newSession.access_token, refresh_token: newSession.refresh_token });
    }
    setUser(appUser);
    return appUser;
  }

  async function login(email, password) {
    const { user: appUser, session: newSession } = await api.login({ email, password });
    await supabase.auth.setSession({ access_token: newSession.access_token, refresh_token: newSession.refresh_token });
    setUser(appUser);
    return appUser;
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, user, loading, signup, login, logout, refreshUser: loadAppUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
