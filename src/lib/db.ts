import { neon } from '@neondatabase/serverless';

// Create Neon client
export const sql = neon(process.env.DATABASE_URL!);

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
  updated_at: string;
}

// Helper functions
export async function getToken(userId: string): Promise<Token | null> {
  const result = await sql`SELECT * FROM tokens WHERE user_id = ${userId} LIMIT 1`;
  return result[0] as Token || null;
}

export async function upsertToken(userId: string, data: Partial<Token>) {
  return sql`
    INSERT INTO tokens (user_id, access_token, post_token, fb_dtsg, cookie, updated_at)
    VALUES (${userId}, ${data.access_token || null}, ${data.post_token || null}, ${data.fb_dtsg || null}, ${data.cookie || null}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = COALESCE(EXCLUDED.access_token, tokens.access_token),
      post_token = COALESCE(EXCLUDED.post_token, tokens.post_token),
      fb_dtsg = COALESCE(EXCLUDED.fb_dtsg, tokens.fb_dtsg),
      cookie = COALESCE(EXCLUDED.cookie, tokens.cookie),
      updated_at = NOW()
    RETURNING *
  `;
}

export async function getPages(userId: string): Promise<Page[]> {
  return sql`SELECT * FROM pages WHERE user_id = ${userId}` as Promise<Page[]>;
}

export async function upsertPage(userId: string, pageId: string, pageName: string, pageToken: string) {
  return sql`
    INSERT INTO pages (user_id, page_id, page_name, page_token)
    VALUES (${userId}, ${pageId}, ${pageName}, ${pageToken})
    ON CONFLICT (user_id, page_id) DO UPDATE SET
      page_name = EXCLUDED.page_name,
      page_token = EXCLUDED.page_token
    RETURNING *
  `;
}

export async function getPendingPosts(): Promise<ScheduledPost[]> {
  return sql`
    SELECT * FROM scheduled_posts
    WHERE status = 'pending' AND scheduled_time <= NOW()
    ORDER BY scheduled_time ASC
  ` as Promise<ScheduledPost[]>;
}

export async function createScheduledPost(data: Omit<ScheduledPost, 'id' | 'created_at' | 'updated_at'>) {
  return sql`
    INSERT INTO scheduled_posts (user_id, page_id, content, image_url, scheduled_time, status)
    VALUES (${data.user_id}, ${data.page_id}, ${data.content}, ${data.image_url || null}, ${data.scheduled_time}, ${data.status || 'pending'})
    RETURNING *
  `;
}

export async function updatePostStatus(id: string, status: string, postId?: string, error?: string) {
  return sql`
    UPDATE scheduled_posts
    SET status = ${status}, post_id = ${postId || null}, error = ${error || null}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
}

// Page Settings functions
export async function getPageSettings(pageId: string): Promise<PageSettings | null> {
  const result = await sql`SELECT * FROM page_settings WHERE page_id = ${pageId} LIMIT 1`;
  return result[0] as PageSettings || null;
}

export async function upsertPageSettings(pageId: string, autoSchedule: boolean, scheduleMinutes: string) {
  return sql`
    INSERT INTO page_settings (page_id, auto_schedule, schedule_minutes, updated_at)
    VALUES (${pageId}, ${autoSchedule}, ${scheduleMinutes}, NOW())
    ON CONFLICT (page_id) DO UPDATE SET
      auto_schedule = EXCLUDED.auto_schedule,
      schedule_minutes = EXCLUDED.schedule_minutes,
      updated_at = NOW()
    RETURNING *
  `;
}
