import { createClient } from '@supabase/supabase-js';

// Get Supabase URL and Anon Key from environment variables or localStorage overrides
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (typeof window !== 'undefined' ? localStorage.getItem('VITE_SUPABASE_URL') : '') || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof window !== 'undefined' ? localStorage.getItem('VITE_SUPABASE_ANON_KEY') : '') || '';

export const isSupabaseConfigured = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL');
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('VITE_SUPABASE_ANON_KEY');
  return Boolean(url && key && url.includes('supabase.co'));
};

export const getSupabaseCredentials = () => {
  return {
    url: import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('VITE_SUPABASE_URL') || '',
    key: import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('VITE_SUPABASE_ANON_KEY') || ''
  };
};

export const setSupabaseCredentials = (url: string, key: string) => {
  localStorage.setItem('VITE_SUPABASE_URL', url.trim());
  localStorage.setItem('VITE_SUPABASE_ANON_KEY', key.trim());
};

// Create client instance (dummy fallback if not yet configured)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
