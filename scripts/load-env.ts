/**
 * Load env for CLI scripts (`npx tsx scripts/...`). Next.js loads `.env.local` automatically;
 * tsx does not. Run from repo root so `DATABASE_URL` in `.env.local` is picked up.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

const root = process.cwd();
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local"), override: true });
