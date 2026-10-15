const fs = require('fs');
const path = require('path');

const distAssets = fs.readdirSync('dist/assets');
const cssFile = distAssets.find(f => f.endsWith('.css'));
const jsFile = distAssets.find(f => f.endsWith('.js'));

if (!cssFile || !jsFile) {
  console.error('Không tìm thấy file build trong dist/assets');
  process.exit(1);
}

// Đảm bảo file style.css ở thư mục gốc luôn được đồng bộ với public/style.css
if (fs.existsSync('public/style.css')) {
  fs.copyFileSync('public/style.css', 'style.css');
}

// Đọc CSS đầy đủ nhất do Tailwind CLI biên dịch (100% đầy đủ class)
let css = '';
if (fs.existsSync('public/style.css')) {
  css = fs.readFileSync('public/style.css', 'utf-8');
} else if (fs.existsSync('dist/style.css')) {
  css = fs.readFileSync('dist/style.css', 'utf-8');
} else {
  css = fs.readFileSync(path.join('dist/assets', cssFile), 'utf-8');
}

const js = fs.readFileSync(path.join('dist/assets', jsFile), 'utf-8');
const xlsx = fs.readFileSync('public/vendor/xlsx.bundle.js', 'utf-8');

const htmlContent = `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f766e" />
    <meta name="description" content="Phần mềm xếp thời khóa biểu tự động thông minh dành cho các trường học, hỗ trợ chạy ngoại tuyến 100%." />
    <title>Smart Scheduler Pro - Ngoại Tuyến 100%</title>
    <style>
${css}
    </style>
    <script>
${xlsx}
    </script>
  </head>
  <body class="bg-gray-50 text-gray-900">
    <div id="root"></div>
    <script>
${js}
    </script>
  </body>
</html>`;

fs.writeFileSync('PhanMemXepTKB_NgoaiTuyen.html', htmlContent);
console.log('✅ Đã tạo thành công PhanMemXepTKB_NgoaiTuyen.html (File đơn độc lập 100%). Dung lượng:', htmlContent.length, 'bytes');
