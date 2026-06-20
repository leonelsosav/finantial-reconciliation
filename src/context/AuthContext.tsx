import { createContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/auth.service';
import type { AuthState } from '../types/auth';


interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  useEffect(() => {
    // Initial session check
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const profile = await AuthService.getCurrentProfile();
          setState({ user: session.user, profile, loading: false, error: null });
          if (profile) {
            setSelectedCompanyId(profile.role === 'owner' ? '' : (profile.internal_company_id || ''));
          }
        } else {
          setState({ user: null, profile: null, loading: false, error: null });
          setSelectedCompanyId('');
        }
      } catch (error: any) {
        setState({ user: null, profile: null, loading: false, error: error.message });
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await AuthService.getCurrentProfile();
        setState({ user: session.user, profile, loading: false, error: null });
        if (profile) {
          setSelectedCompanyId(profile.role === 'owner' ? '' : (profile.internal_company_id || ''));
        }
      } else {
        setState({ user: null, profile: null, loading: false, error: null });
        setSelectedCompanyId('');
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
    <AuthContext.Provider value={{ ...state, signOut, selectedCompanyId, setSelectedCompanyId }}>
      {!state.loading && children}
    </AuthContext.Provider>
  );
};
