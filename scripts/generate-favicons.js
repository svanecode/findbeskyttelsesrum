const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
  { name: 'maskable-icon.png', size: 512 },
];

const outputDir = path.join(process.cwd(), 'public', 'favicons');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate PNG files
async function generateFavicons() {
  const inputSvg = path.join(process.cwd(), 'public', 'favicons', 'favicon.svg');
  
  for (const { name, size } of sizes) {
    await sharp(inputSvg)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, name));
    console.log(`Generated ${name}`);
  }

  // Generate ICO file (combining 16x16 and 32x32)
  await sharp(inputSvg)
    .resize(48, 48)
    .toFile(path.join(outputDir, 'favicon.ico'));
  console.log('Generated favicon.ico');

  // Create Safari pinned tab SVG
  const safariSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="256" cy="256" r="256" fill="#F97316"/>
</svg>`;
  fs.writeFileSync(path.join(outputDir, 'safari-pinned-tab.svg'), safariSvg);
  console.log('Generated safari-pinned-tab.svg');
}

generateFavicons().catch(console.error); 