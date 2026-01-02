import postgres from 'postgres';
const sql = postgres(process.env.SUPABASE_POSTGRES_URL_NON_POOLING || '', { ssl: 'require' });
const [row] = await sql`SELECT cookie FROM tokens WHERE user_id = '100077795357192'`;
console.log(row.cookie + '; i_user=61554708539220');
await sql.end();
