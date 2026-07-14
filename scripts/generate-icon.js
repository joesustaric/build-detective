const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '..', 'images', 'icon.svg');
const dest = path.join(__dirname, '..', 'images', 'icon.png');

sharp(src)
  .resize(128, 128)
  .png()
  .toFile(dest)
  .then(() => console.log(`Generated ${dest}`))
  .catch(err => { console.error(err); process.exit(1); });
