import { createContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/auth.service';
import type { AuthState } from '../types/auth';


interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Initial session check
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const profile = await AuthService.getCurrentProfile();
          setState({ user: session.user, profile, loading: false, error: null });
        } else {
          setState({ user: null, profile: null, loading: false, error: null });
        }
      } catch (error: any) {
        setState({ user: null, profile: null, loading: false, error: error.message });
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await AuthService.getCurrentProfile();
        setState({ user: session.user, profile, loading: false, error: null });
      } else {
        setState({ user: null, profile: null, loading: false, error: null });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await AuthService.signOut();
    } catch (error: any) {
      setState(prev => ({ ...prev, error: error.message }));
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, signOut }}>
      {!state.loading && children}
    </AuthContext.Provider>
  );
};
