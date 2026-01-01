import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

// Create Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.warn('[db] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Create postgres connection for raw SQL queries
const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

export const sql = dbUrl ? postgres(dbUrl, { ssl: 'require' }) : null;

// Types for database tables
export interface Token {
  id: string;
  user_id: string;
  access_token: string;
  post_token?: string;
  fb_dtsg?: string;
  cookie?: string;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  user_id: string;
  page_id: string;
  page_name: string;
  page_token: string;
  created_at: string;
}

export interface ScheduledPost {
  id: string;
  user_id: string;
  page_id: string;
  content: string;
  image_url?: string;
  scheduled_time: string;
  status: 'pending' | 'published' | 'failed';
  post_id?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface PageSettings {
  page_id: string;
  auto_schedule: boolean;
  schedule_minutes: string;
  ai_model?: string;
  ai_resolution?: string;
  link_image_size?: string;
  image_image_size?: string;
  updated_at: string;
}

// Helper functions using Supabase
export async function getToken(userId: string): Promise<Token | null> {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[db] getToken error:', error);
  }
  return data as Token || null;
}

export async function upsertToken(userId: string, data: Partial<Token>) {
  const { data: result, error } = await supabase
    .from('tokens')
    .upsert({
      user_id: userId,
      access_token: data.access_token || null,
      post_token: data.post_token || null,
      fb_dtsg: data.fb_dtsg || null,
      cookie: data.cookie || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select();

  if (error) console.error('[db] upsertToken error:', error);
  return result || [];
}

export async function getPages(userId: string): Promise<Page[]> {
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('user_id', userId);

  if (error) console.error('[db] getPages error:', error);
  return (data || []) as Page[];
}

export async function upsertPage(userId: string, pageId: string, pageName: string, pageToken: string) {
  const { data, error } = await supabase
    .from('pages')
    .upsert({
      user_id: userId,
      page_id: pageId,
      page_name: pageName,
      page_token: pageToken,
    }, { onConflict: 'user_id,page_id' })
    .select();

  if (error) console.error('[db] upsertPage error:', error);
  return data || [];
}

export async function getPendingPosts(): Promise<ScheduledPost[]> {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_time', new Date().toISOString())
    .order('scheduled_time', { ascending: true });

  if (error) console.error('[db] getPendingPosts error:', error);
  return (data || []) as ScheduledPost[];
}

export async function createScheduledPost(data: Omit<ScheduledPost, 'id' | 'created_at' | 'updated_at'>) {
  const { data: result, error } = await supabase
    .from('scheduled_posts')
    .insert({
      user_id: data.user_id,
      page_id: data.page_id,
      content: data.content,
      image_url: data.image_url || null,
      scheduled_time: data.scheduled_time,
      status: data.status || 'pending',
    })
    .select();

  if (error) console.error('[db] createScheduledPost error:', error);
  return result || [];
}

export async function updatePostStatus(id: string, status: string, postId?: string, error?: string) {
  const { data, error: dbError } = await supabase
    .from('scheduled_posts')
    .update({
      status,
      post_id: postId || null,
      error: error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select();

  if (dbError) console.error('[db] updatePostStatus error:', dbError);
  return data || [];
}

// Page Settings functions
export async function getPageSettings(pageId: string): Promise<PageSettings | null> {
  const { data, error } = await supabase
    .from('page_settings')
    .select('*')
    .eq('page_id', pageId)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[db] getPageSettings error:', error);
  }
  return data as PageSettings || null;
}

export async function upsertPageSettings(
  pageId: string,
  autoSchedule: boolean,
  scheduleMinutes: string,
  aiModel?: string,
  aiResolution?: string,
  linkImageSize?: string,
  imageImageSize?: string
) {
  const updateData: Record<string, any> = {
    page_id: pageId,
    auto_schedule: autoSchedule,
    schedule_minutes: scheduleMinutes,
    updated_at: new Date().toISOString(),
  };

  // Only include optional fields if provided
  if (aiModel !== undefined) updateData.ai_model = aiModel;
  if (aiResolution !== undefined) updateData.ai_resolution = aiResolution;
  if (linkImageSize !== undefined) updateData.link_image_size = linkImageSize;
  if (imageImageSize !== undefined) updateData.image_image_size = imageImageSize;

  const { data, error } = await supabase
    .from('page_settings')
    .upsert(updateData, { onConflict: 'page_id' })
    .select();

  if (error) console.error('[db] upsertPageSettings error:', error);
  return data || [];
}
