const http = require('http');
const fs = require('fs');
const path = require('path');
const { parse } = require('url');

const PORT = 3000;
const TEMP_DIR = path.join(__dirname, '.next', 'standalone', 'public', 'temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  const parsedUrl = parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Serve temp files directly
  if (pathname.startsWith('/temp/')) {
    const filename = pathname.replace('/temp/', '');
    const filepath = path.join(TEMP_DIR, filename);
    
    // Security: prevent directory traversal
    if (!filepath.startsWith(TEMP_DIR)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    
    if (fs.existsSync(filepath)) {
      const ext = path.extname(filepath);
      const contentType = ext === '.png' ? 'image/png' : 
                         ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                         'application/octet-stream';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      fs.createReadStream(filepath).pipe(res);
      return;
    } else {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
  }
  
  // For other requests, use Next.js handler
  require('./.next/standalone/server.js');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
