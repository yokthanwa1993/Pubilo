import postgres from 'postgres';

const sql = postgres('postgres://postgres.sagivbclfyfhiafvhxvj:jyYh41qqwnl0VeTS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres');

console.log('Finding quotes with 2024 or 2025...');

// Count
const countResult = await sql`
  SELECT COUNT(*) as total FROM quotes
  WHERE quote_text LIKE '%2024%' OR quote_text LIKE '%2025%'
`;
console.log(`Total quotes with 2024/2025: ${countResult[0].total}`);

// Show examples
const examples = await sql`
  SELECT id, LEFT(quote_text, 80) as preview
  FROM quotes
  WHERE quote_text LIKE '%2024%' OR quote_text LIKE '%2025%'
  LIMIT 5
`;
console.log('Examples:');
examples.forEach(q => console.log(`  [${q.id}] ${q.preview}...`));

// Delete them
console.log('\nDeleting...');
const deleted = await sql`
  DELETE FROM quotes
  WHERE quote_text LIKE '%2024%' OR quote_text LIKE '%2025%'
  RETURNING id
`;
console.log(`Deleted ${deleted.length} quotes`);

// Show remaining count
const remaining = await sql`SELECT COUNT(*) as total FROM quotes`;
console.log(`Remaining quotes: ${remaining[0].total}`);

await sql.end();
