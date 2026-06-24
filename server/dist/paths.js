import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.join(__dirname, '..');
export const repoRoot = path.join(serverRoot, '..');
//# sourceMappingURL=paths.js.map