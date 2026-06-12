import type { User } from '@supabase/supabase-js';

export type UserRole = 'owner' | 'ops' | 'auditor';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  internal_company_id: string | null;
  full_name: string | null;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}
