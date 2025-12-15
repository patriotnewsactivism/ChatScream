/**
 * PWA Icon Generator Script
 *
 * This script generates PNG icons from the SVG source.
 *
 * Usage:
 *   node scripts/generate-icons.js
 *
 * Requirements:
 *   npm install sharp
 *
 * Or use an online tool:
 *   1. Go to https://realfavicongenerator.net/
 *   2. Upload public/icons/icon.svg
 *   3. Download and extract to public/icons/
 */

const fs = require('fs');
const path = require('path');

// Icon sizes needed for PWA
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const BADGE_SIZES = [72];

// SVG source path
const SVG_PATH = path.join(__dirname, '../public/icons/icon.svg');
const OUTPUT_DIR = path.join(__dirname, '../public/icons');

async function generateIcons() {
  try {
    // Check if sharp is available
    let sharp;
    try {
      sharp = require('sharp');
    } catch {
      console.log('Sharp not installed. Using placeholder approach.');
      generatePlaceholders();
      return;
    }

    const svgBuffer = fs.readFileSync(SVG_PATH);

    for (const size of ICON_SIZES) {
      const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);

      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`Generated: icon-${size}x${size}.png`);
    }

    // Generate badge icon
    for (const size of BADGE_SIZES) {
      const outputPath = path.join(OUTPUT_DIR, `badge-${size}x${size}.png`);

      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`Generated: badge-${size}x${size}.png`);
    }

    console.log('\\nAll icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    generatePlaceholders();
  }
}

function generatePlaceholders() {
  console.log('\\nCreating placeholder HTML file with instructions...');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Generate PWA Icons</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 2rem; background: #0a0a0a; color: #fff; }
    h1 { color: #0284c7; }
    .icon-preview { width: 192px; height: 192px; border-radius: 24px; margin: 2rem 0; }
    code { background: #1a1a1a; padding: 0.5rem 1rem; display: block; margin: 1rem 0; border-radius: 8px; }
    a { color: #0284c7; }
    ol { line-height: 2; }
  </style>
</head>
<body>
  <h1>ChatScream PWA Icons</h1>
  <p>Your SVG icon has been created. To generate PNG versions:</p>

  <h2>Option 1: Use Online Generator</h2>
  <ol>
    <li>Go to <a href="https://realfavicongenerator.net/" target="_blank">realfavicongenerator.net</a></li>
    <li>Upload <code>public/icons/icon.svg</code></li>
    <li>Configure settings as needed</li>
    <li>Download the package</li>
    <li>Extract to <code>public/icons/</code></li>
  </ol>

  <h2>Option 2: Use Sharp (Node.js)</h2>
  <code>npm install sharp</code>
  <code>node scripts/generate-icons.js</code>

  <h2>Required Icon Sizes</h2>
  <ul>
    ${ICON_SIZES.map(s => `<li>icon-${s}x${s}.png</li>`).join('')}
  </ul>

  <h2>Icon Preview</h2>
  <img src="icon.svg" class="icon-preview" alt="App Icon">
</body>
</html>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'README.html'), html);
  console.log('Created: public/icons/README.html');
  console.log('Open this file in a browser for instructions on generating PNG icons.');
}

// Run the script
generateIcons();
