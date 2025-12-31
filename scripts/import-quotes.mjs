import postgres from 'postgres';
import fs from 'fs';

const sql = postgres('postgres://postgres.sagivbclfyfhiafvhxvj:jyYh41qqwnl0VeTS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres');

// Clear existing and recreate
console.log('Clearing existing quotes...');
await sql`DROP TABLE IF EXISTS quotes`;
await sql`
  CREATE TABLE quotes (
    id SERIAL PRIMARY KEY,
    quote_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
console.log('Table ready!');

// Read CSV and normalize line endings
const csvPath = '/Users/yok/Downloads/CHEARB - BEST.csv';
let csvContent = fs.readFileSync(csvPath, 'utf-8');
// Normalize line endings
csvContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Better CSV parser
function parseCSV(content) {
  const quotes = [];
  let currentQuote = '';
  let inQuote = false;

  const lines = content.split('\n');
  console.log(`Total lines: ${lines.length}`);

  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i];

    if (!inQuote) {
      // Check if line starts with date
      const dateMatch = line.match(/^(\d{1,2}\/\d{1,2}\/\d{4}),(.*)$/);
      if (dateMatch) {
        let text = dateMatch[2];

        if (text.startsWith('"')) {
          // Multi-line quote starts
          text = text.substring(1);
          if (text.endsWith('"') && !text.endsWith('""')) {
            // Single line quoted
            text = text.slice(0, -1);
            const clean = text.replace(/""/g, '"').trim();
            if (clean) quotes.push(clean);
          } else {
            // Multi-line
            inQuote = true;
            currentQuote = text;
          }
        } else {
          // Simple unquoted text
          const clean = text.trim();
          if (clean) quotes.push(clean);
        }
      }
    } else {
      // Continue multi-line quote
      if (line.endsWith('"') && !line.endsWith('""')) {
        // End of multi-line quote
        currentQuote += '\n' + line.slice(0, -1);
        const clean = currentQuote.replace(/""/g, '"').trim();
        if (clean) quotes.push(clean);
        currentQuote = '';
        inQuote = false;
      } else {
        currentQuote += '\n' + line;
      }
    }
  }

  return quotes;
}

const quotes = parseCSV(csvContent);
console.log(`Parsed ${quotes.length} quotes`);

// Insert in batches
console.log('Inserting quotes...');
let inserted = 0;

for (const text of quotes) {
  if (text && text.length > 3) {
    try {
      await sql`INSERT INTO quotes (quote_text) VALUES (${text})`;
      inserted++;
      if (inserted % 100 === 0) {
        process.stdout.write(`\r${inserted}/${quotes.length}`);
      }
    } catch (e) {
      // Skip errors
    }
  }
}

console.log(`\nInserted ${inserted} quotes!`);

// Verify
const count = await sql`SELECT COUNT(*) as total FROM quotes`;
console.log('Total in DB:', count[0].total);

await sql.end();
