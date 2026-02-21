import { PrismaClient } from "@prisma/client";
import { copyFileSync, chmodSync, existsSync } from "fs";
import { join } from "path";

const ENGINE_NAME = "query-engine-rhel-openssl-3.0.x";

/**
 * On Vercel/Lambda the deployment filesystem is read-only. Prisma tries to chmod the query
 * engine binary at runtime, causing EPERM and a broken UI. Copy the engine to /tmp (writable)
 * once per cold start and point Prisma at it so this never happens on the deployed site.
 */
function ensurePrismaEngineForServerless(): void {
  if (process.env.PRISMA_QUERY_ENGINE_BINARY) return;
  const isServerless = process.env.VERCEL === "1" || typeof process.env.AWS_LAMBDA_FUNCTION_NAME === "string";
  if (!isServerless) return;

  const tmpPath = `/tmp/${ENGINE_NAME}`;
  if (existsSync(tmpPath)) {
    process.env.PRISMA_QUERY_ENGINE_BINARY = tmpPath;
    return;
  }

  const cwd = process.cwd();
  const candidates: string[] = [
    join(cwd, "node_modules", ".prisma", "client", ENGINE_NAME),
  ];
  try {
    const clientEntry = require.resolve("@prisma/client");
    candidates.push(
      join(clientEntry, "..", "..", ".prisma", "client", ENGINE_NAME),
      join(clientEntry, "..", "..", "..", ".prisma", "client", ENGINE_NAME),
    );
  } catch {
    // require.resolve can fail in some bundler contexts; cwd candidate is enough
  }

  const sourcePath = candidates.find((p) => existsSync(p));
  if (!sourcePath) return;

  try {
    copyFileSync(sourcePath, tmpPath);
    chmodSync(tmpPath, 0o555);
    process.env.PRISMA_QUERY_ENGINE_BINARY = tmpPath;
  } catch (err) {
    console.warn("[prisma] Could not copy query engine to /tmp:", err);
  }
}

ensurePrismaEngineForServerless();

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
