const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

if (!fs.existsSync(DIST_DIR)) {
  console.error('Lỗi: Chưa tìm thấy thư mục dist. Đang tiến hành build...');
  try {
    require('child_process').execSync('npx vite build', { stdio: 'inherit' });
  } catch (e) {
    console.error('Lỗi khi build dự án:', e);
  }
}

const server = http.createServer((req, res) => {
  let safePath = req.url.split('?')[0];
  let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Lỗi máy chủ nội bộ');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`===================================================`);
  console.log(`   SMART SCHEDULER PRO - CHẠY NGOẠI TUYẾN KHÔNG MẠNG`);
  console.log(`   Ứng dụng đang mở tại địa chỉ: ${url}`);
  console.log(`===================================================`);
  
  // Tự động mở trình duyệt web mặc định trên Windows
  const startCmd = process.platform === 'win32' ? `start ${url}` : `open ${url}`;
  exec(startCmd);
});
