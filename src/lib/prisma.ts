import { PrismaClient } from "@prisma/client";
import { copyFileSync, chmodSync, existsSync } from "fs";
import { join } from "path";

const ENGINE_NAME = "query-engine-rhel-openssl-3.0.x";

/**
 * On serverless (Vercel/Lambda) the filesystem is read-only and Prisma tries to chmod the
 * query engine binary, causing EPERM. Copy the engine to /tmp (writable) and point Prisma at it.
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

  let sourcePath: string;
  try {
    const clientEntry = require.resolve("@prisma/client");
    sourcePath = join(clientEntry, "..", "..", ".prisma", "client", ENGINE_NAME);
  } catch {
    sourcePath = join(process.cwd(), "node_modules", ".prisma", "client", ENGINE_NAME);
  }
  if (!existsSync(sourcePath)) return;

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
