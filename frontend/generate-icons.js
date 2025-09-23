import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="50" fill="#3b82f6"/>
  <g transform="translate(128, 128)">
    <path d="M204 42H52c-17.7 0-32 14.3-32 32v107c0 17.7 14.3 32 32 32h152c17.7 0 32-14.3 32-32V74c0-17.7-14.3-32-32-32zM204 181H52V74h152v107z" fill="white"/>
    <path d="M64 0h86v42H64zM64 213h86v43H64z" fill="white"/>
    <rect x="85" y="96" width="64" height="64" rx="5" fill="white"/>
  </g>
</svg>`;

// Generate 192x192 icon
sharp(Buffer.from(svgContent))
  .resize(192, 192)
  .png()
  .toFile(join(__dirname, 'public', 'pwa-192x192.png'))
  .then(() => console.log('Generated pwa-192x192.png'))
  .catch(err => console.error('Error generating 192x192:', err));

// Generate 512x512 icon
sharp(Buffer.from(svgContent))
  .resize(512, 512)
  .png()
  .toFile(join(__dirname, 'public', 'pwa-512x512.png'))
  .then(() => console.log('Generated pwa-512x512.png'))
  .catch(err => console.error('Error generating 512x512:', err));

// Generate favicon
sharp(Buffer.from(svgContent))
  .resize(32, 32)
  .png()
  .toFile(join(__dirname, 'public', 'favicon.ico'))
  .then(() => console.log('Generated favicon.ico'))
  .catch(err => console.error('Error generating favicon:', err));