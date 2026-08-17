import { createClient } from '@supabase/supabase-js';
import { InputRow, Constraint, TimetableVersion, TimetableGrid } from '../types';
import { getSupabaseCredentials, isSupabaseConfigured } from './supabaseClient';

const getClient = () => {
  const { url, key } = getSupabaseCredentials();
  if (!url || !key || !url.includes('supabase.co')) return null;
  return createClient(url, key);
};

// 1. Assignments API
export const fetchAssignmentsSupabase = async (): Promise<InputRow[] | null> => {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('assignments')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.warn('Lỗi fetch assignments Supabase:', error.message);
      return null;
    }

    return (data || []).map(row => ({
      id: Number(row.id),
      teacher: row.teacher,
      subject: row.subject,
      className: row.class_name,
      sessionsPerWeek: Number(row.sessions_per_week)
    }));
  } catch (err) {
    console.warn('Supabase fetch error:', err);
    return null;
  }
};

export const saveAssignmentsSupabase = async (items: InputRow[]): Promise<boolean> => {
  const client = getClient();
  if (!client) return false;

  try {
    // Delete existing rows and insert new ones
    await client.from('assignments').delete().neq('id', 0);
    
    if (items.length === 0) return true;

    const payload = items.map(r => ({
      id: r.id,
      teacher: r.teacher,
      subject: r.subject,
      class_name: r.className,
      sessions_per_week: r.sessionsPerWeek
    }));

    const { error } = await client.from('assignments').insert(payload);
    if (error) {
      console.warn('Lỗi save assignments Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase save error:', err);
    return false;
  }
};

// 2. Constraints API
export const fetchConstraintsSupabase = async (): Promise<Constraint[] | null> => {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('constraints')
      .select('*');

    if (error) return null;

    return (data || []).map(row => ({
      id: String(row.id),
      type: row.type,
      teacher: row.teacher || undefined,
      className: row.class_name || undefined,
      subject: row.subject || undefined,
      day: Number(row.day),
      period: Number(row.period)
    }));
  } catch {
    return null;
  }
};

export const saveConstraintsSupabase = async (items: Constraint[]): Promise<boolean> => {
  const client = getClient();
  if (!client) return false;

  try {
    await client.from('constraints').delete().neq('id', 'placeholder_never_match');

    if (items.length === 0) return true;

    const payload = items.map(c => ({
      id: c.id,
      type: c.type,
      teacher: c.teacher || null,
      class_name: c.className || null,
      subject: c.subject || null,
      day: c.day,
      period: c.period
    }));

    const { error } = await client.from('constraints').insert(payload);
    return !error;
  } catch {
    return false;
  }
};

// 3. Timetable Versions API
export const fetchVersionsSupabase = async (): Promise<TimetableVersion[] | null> => {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('timetable_versions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return null;

    return (data || []).map(row => ({
      id: String(row.id),
      name: row.name,
      createdAt: new Date(row.created_at).toLocaleString('vi-VN'),
      data: row.data || [],
      constraints: row.constraints || [],
      schedule: row.schedule || {},
      unassigned: row.unassigned || []
    }));
  } catch {
    return null;
  }
};

export const saveVersionSupabase = async (ver: TimetableVersion): Promise<boolean> => {
  const client = getClient();
  if (!client) return false;

  try {
    const payload = {
      id: ver.id,
      name: ver.name,
      data: ver.data,
      constraints: ver.constraints,
      schedule: ver.schedule,
      unassigned: ver.unassigned || []
    };

    const { error } = await client.from('timetable_versions').upsert(payload);
    return !error;
  } catch {
    return false;
  }
};

export const deleteVersionSupabase = async (id: string): Promise<boolean> => {
  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client.from('timetable_versions').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
};
