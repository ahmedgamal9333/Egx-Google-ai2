/**
 * Vercel catch-all function for the existing Express API.
 * Keep API/business logic in server.ts and server/services.
 */
import { createApiApp } from '../server.ts';

const app = createApiApp();

export default app;
