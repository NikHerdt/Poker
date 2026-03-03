const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'shared');
const dest = path.join(__dirname, '..', 'shared');
if (fs.existsSync(src)) {
  fs.cpSync(src, dest, { recursive: true });
}
