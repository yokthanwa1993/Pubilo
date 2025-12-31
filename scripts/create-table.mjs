import postgres from 'postgres';

const sql = postgres('postgres://postgres.sagivbclfyfhiafvhxvj:jyYh41qqwnl0VeTS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres');

console.log('Creating table...');

await sql`
  CREATE TABLE IF NOT EXISTS page_settings (
    page_id TEXT PRIMARY KEY,
    auto_schedule BOOLEAN DEFAULT false,
    schedule_minutes TEXT DEFAULT '00, 15, 30, 45',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

console.log('Table created!');

// Test
const result = await sql`SELECT * FROM page_settings LIMIT 1`;
console.log('Test query result:', result);

await sql.end();
