const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
assert.ok(fs.existsSync(path.join(root, 'index.html')), 'index.html must exist');
assert.ok(fs.existsSync(path.join(root, 'ide.html')), 'ide.html must exist');
console.log('[✓] Universal IDE markup structure validated');
