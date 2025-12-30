const fs = require('fs');
const path = require('path');

// Read CSV file
const csvPath = '/Users/yok/Downloads/CHEARB - BEST.csv';
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse CSV with multi-line text fields
function parseCSV(content) {
  const quotes = [];
  let currentQuote = '';
  let inQuotes = false;
  let currentDate = '';

  const lines = content.split('\n');

  // Skip header
  let i = 1;

  while (i < lines.length) {
    const line = lines[i];

    if (!inQuotes) {
      // Check if line starts with a date pattern (DD/MM/YYYY)
      const dateMatch = line.match(/^(\d{1,2}\/\d{1,2}\/\d{4}),(.*)$/);
      if (dateMatch) {
        currentDate = dateMatch[1];
        let text = dateMatch[2];

        // Check if text starts with quote
        if (text.startsWith('"')) {
          text = text.substring(1);
          // Check if it ends with quote on same line
          if (text.endsWith('"')) {
            text = text.slice(0, -1);
            quotes.push({ date: currentDate, text: text });
          } else {
            // Multi-line quote
            inQuotes = true;
            currentQuote = text;
          }
        } else {
          // Single line without quotes
          quotes.push({ date: currentDate, text: text });
        }
      } else if (line.trim()) {
        // Continuation of multi-line without proper date start - skip
      }
    } else {
      // We're inside a multi-line quote
      if (line.endsWith('"')) {
        currentQuote += '\n' + line.slice(0, -1);
        quotes.push({ date: currentDate, text: currentQuote });
        inQuotes = false;
        currentQuote = '';
      } else {
        currentQuote += '\n' + line;
      }
    }
    i++;
  }

  return quotes;
}

const quotes = parseCSV(csvContent);
console.log(`Parsed ${quotes.length} quotes`);

// Output as JSON for API import
const outputPath = '/Users/yok/Developer/Pubilo/scripts/quotes-data.json';
fs.writeFileSync(outputPath, JSON.stringify(quotes, null, 2));
console.log(`Saved to ${outputPath}`);

// Show first 5 quotes
console.log('\nFirst 5 quotes:');
quotes.slice(0, 5).forEach((q, i) => {
  console.log(`${i + 1}. [${q.date}] ${q.text.substring(0, 50)}...`);
});
