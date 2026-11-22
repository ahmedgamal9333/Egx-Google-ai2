/**
 * Vercel catch-all function for the existing Express API.
 *
 * The Vite frontend is served from the deployment's static output while
 * every /api/* request is routed through this Express application.
 * Keep business logic in server.ts and server/services; do not duplicate it here.
 */
import { createApiApp } from '../server';

const app = createApiApp();

export default app;
