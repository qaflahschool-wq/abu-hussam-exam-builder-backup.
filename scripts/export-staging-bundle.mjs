import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const bundleRoot = path.join(root, '.wrangler/staging-bundle');
const distRoot = path.join(root, 'dist');
const outputRoot = '/tmp/abu-hussam-staging-deploy-artifact';
await mkdir(outputRoot, { recursive: true });

const worker = await readFile(path.join(bundleRoot, 'worker.js'));
await writeFile(path.join(outputRoot, 'worker.js'), worker);
const assets = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }
    const relative = path.relative(distRoot, absolute).split(path.sep).join('/');
    const bytes = await readFile(absolute);
    const textual = /\.(html|js|css|json|svg|txt|xml|webmanifest)$/i.test(relative);
    const storedPath = textual ? 'assets/' + relative : 'assets-base64/' + relative + '.b64';
    const destination = path.join(outputRoot, storedPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, textual ? bytes : Buffer.from(bytes).toString('base64'));
    const contentType = relative.endsWith('.html') ? 'text/html; charset=utf-8'
      : relative.endsWith('.js') ? 'application/javascript; charset=utf-8'
      : relative.endsWith('.css') ? 'text/css; charset=utf-8'
      : relative.endsWith('.svg') ? 'image/svg+xml'
      : relative.endsWith('.ico') ? 'image/x-icon'
      : relative.endsWith('.jpg') || relative.endsWith('.jpeg') ? 'image/jpeg'
      : relative.endsWith('.png') ? 'image/png'
      : relative.endsWith('.webmanifest') ? 'application/manifest+json'
      : 'application/octet-stream';
    assets.push({
      path: '/' + relative,
      storedPath,
      encoding: textual ? 'utf8' : 'base64',
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contentType,
    });
  }
}
await walk(distRoot);
const manifest = {
  format: 'ABU_HUSSAM_CLOUDFLARE_DEPLOY_ARTIFACT_V1',
  worker: { path: 'worker.js', size: worker.byteLength, sha256: createHash('sha256').update(worker).digest('hex') },
  assets,
};
await writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared Worker bundle and ' + assets.length + ' static assets at ' + outputRoot);
