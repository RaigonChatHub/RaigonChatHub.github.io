import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'out');
const indexPath = join(outDir, 'index.html');
const notFoundPath = join(outDir, '404.html');

if (!existsSync(indexPath)) {
  throw new Error('Expected out/index.html to exist after next build.');
}

copyFileSync(indexPath, notFoundPath);
console.log('Prepared GitHub Pages SPA fallback at out/404.html');
