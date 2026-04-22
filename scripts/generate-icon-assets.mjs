import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceSvg = path.join(projectRoot, 'assets', 'app-icon.svg');
const outDir = path.join(projectRoot, 'dist-app', 'icon');
const iconsetDir = path.join(outDir, 'adcheck.iconset');
const icnsPath = path.join(outDir, 'adcheck.icns');

const iconEntries = [
  { size: 16, name: 'icon_16x16.png' },
  { size: 32, name: 'icon_16x16@2x.png' },
  { size: 32, name: 'icon_32x32.png' },
  { size: 64, name: 'icon_32x32@2x.png' },
  { size: 128, name: 'icon_128x128.png' },
  { size: 256, name: 'icon_128x128@2x.png' },
  { size: 256, name: 'icon_256x256.png' },
  { size: 512, name: 'icon_256x256@2x.png' },
  { size: 512, name: 'icon_512x512.png' },
  { size: 1024, name: 'icon_512x512@2x.png' },
];

async function main() {
  const svgBuffer = await fs.readFile(sourceSvg);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(iconsetDir, { recursive: true });

  await Promise.all(
    iconEntries.map((entry) => sharp(svgBuffer)
      .resize(entry.size, entry.size)
      .png()
      .toFile(path.join(iconsetDir, entry.name))),
  );

  await execFileAsync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath]);
}

main().catch((error) => {
  console.error('[icon] failed to generate app icon assets');
  console.error(error);
  process.exit(1);
});
