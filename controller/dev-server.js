// Static file server for the controller UI. ponytail: no Next.js/Express for
// a 2-file static page — plain http.createServer is the whole job. Revisit
// MASTER.md §51 (Next.js) once the controller UI actually needs routing,
// SSR, or component state complex enough to justify the framework.
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const PORT = process.env.PORT || 3000;
const ROOT = join(import.meta.dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.apk': 'application/vnd.android.package-archive' };

createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const body = await readFile(join(ROOT, path));
    const headers = { 'Content-Type': TYPES[extname(path)] || 'text/plain' };
    // Force the APK to download (and name it) rather than open in the browser.
    if (extname(path) === '.apk') headers['Content-Disposition'] = 'attachment; filename="hrapp-remote.apk"';
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, () => console.log(`Controller UI on http://localhost:${PORT}`));
