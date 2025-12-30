const fs = require('fs');

// Read CSV file
const csvPath = '/Users/yok/Downloads/CHEARB - BEST.csv';
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Better CSV parser for multi-line quoted fields
function parseCSV(content) {
  const quotes = [];
  let i = 0;
  const lines = content.split('\n');

  // Skip header
  i = 1;

  while (i < lines.length) {
    let line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    // Match date at beginning: DD/MM/YYYY,
    const dateMatch = line.match(/^(\d{1,2}\/\d{1,2}\/\d{4}),(.*)$/);
    if (!dateMatch) {
      i++;
      continue;
    }

    const date = dateMatch[1];
    let textPart = dateMatch[2];

    // Check if text starts with a quote
    if (textPart.startsWith('"')) {
      textPart = textPart.substring(1);

      // Keep reading lines until we find closing quote
      while (!textPart.endsWith('"') && i < lines.length - 1) {
        i++;
        textPart += '\n' + lines[i];
      }

      // Remove trailing quote
      if (textPart.endsWith('"')) {
        textPart = textPart.slice(0, -1);
      }
    }

    // Clean up the text - remove carriage returns and extra quotes
    // Also remove anything after a date pattern (parsing error)
    textPart = textPart
      .replace(/\r/g, '')
      .replace(/""/g, '"')
      .replace(/"\s*\d{1,2}\/\d{1,2}\/\d{4},.*/s, '')  // Remove from date onwards
      .trim();

    if (textPart) {
      quotes.push({ date, text: textPart });
    }

    i++;
  }

  return quotes;
}

const quotes = parseCSV(csvContent);
console.log(`Parsed ${quotes.length} quotes`);

// Filter out quotes that are too long (might be parsing errors)
const cleanQuotes = quotes.filter(q => q.text.length < 300 && q.text.length > 10);
console.log(`Clean quotes (< 500 chars): ${cleanQuotes.length}`);

// Output as JSON for API import
const outputPath = '/Users/yok/Developer/Pubilo/scripts/quotes-data.json';
fs.writeFileSync(outputPath, JSON.stringify(cleanQuotes, null, 2));
console.log(`Saved to ${outputPath}`);

// Show first 10 quotes
console.log('\nFirst 10 quotes:');
cleanQuotes.slice(0, 10).forEach((q, i) => {
  const preview = q.text.replace(/\n/g, ' ').substring(0, 60);
  console.log(`${i + 1}. [${q.date}] ${preview}...`);
});

// Show stats
const lengths = cleanQuotes.map(q => q.text.length);
console.log(`\nStats: min=${Math.min(...lengths)}, max=${Math.max(...lengths)}, avg=${Math.round(lengths.reduce((a,b)=>a+b,0)/lengths.length)}`);
