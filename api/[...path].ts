/**
 * Vercel catch-all function for the bundled Express API.
 * Local server modules are bundled at build time to make ESM imports
 * resolvable in the Node.js serverless runtime.
 */
import { createApiApp } from '../server.bundle.js';

const app = createApiApp();

export default app;
