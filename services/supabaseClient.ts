import { createClient } from '@supabase/supabase-js';

// Default Supabase credentials provided by user
const DEFAULT_SUPABASE_URL = 'https://skpdqfmuzhlviovnhuix.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrcGRxZm11emhsdmlvdm5odWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTc3MjksImV4cCI6MjEwMjUzMzcyOX0.vBxx6E2SQ12xBt-fJPzr9NfRFAr9yuJqZ5QysdRgnF0';

export const getSupabaseCredentials = () => {
  const customUrl = (typeof window !== 'undefined' ? localStorage.getItem('VITE_SUPABASE_URL') : '') || '';
  const customKey = (typeof window !== 'undefined' ? localStorage.getItem('VITE_SUPABASE_ANON_KEY') : '') || '';

  return {
    url: customUrl || import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key: customKey || import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
  };
};

export const isSupabaseConfigured = (): boolean => {
  const { url, key } = getSupabaseCredentials();
  return Boolean(url && key && url.includes('supabase.co'));
};

export const setSupabaseCredentials = (url: string, key: string) => {
  localStorage.setItem('VITE_SUPABASE_URL', url.trim());
  localStorage.setItem('VITE_SUPABASE_ANON_KEY', key.trim());
};

const initialCreds = getSupabaseCredentials();

// Create active Supabase client instance
export const supabase = createClient(initialCreds.url, initialCreds.key);
