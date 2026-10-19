import mongoose from "mongoose";

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConnection: Promise<typeof mongoose> | undefined;
}

/**
 * Lazily connect to MongoDB. Safe to call multiple times — reuses the cached
 * Promise across hot-reloads in development and across invocations within the
 * same Vercel serverless function instance.
 */
export function getMongoConnectionUri(env: NodeJS.ProcessEnv = process.env): string {
  const directUri = env.MONGODB_DIRECT_URI?.trim();
  if (directUri) {
    return directUri;
  }

  const uri = env.MONGODB_URI?.trim();
  if (uri) {
    return uri;
  }

  throw new Error("Please set MONGODB_URI or MONGODB_DIRECT_URI in .env.local");
}

export async function connectDB(): Promise<typeof mongoose> {
  const uri = getMongoConnectionUri();

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (globalThis._mongooseConnection) {
    try {
      await globalThis._mongooseConnection;
    } catch (error) {
      if (globalThis._mongooseConnection) {
        globalThis._mongooseConnection = undefined;
      }
      throw error;
    }

    if (mongoose.connection.readyState === 1) {
      return mongoose;
    }

    globalThis._mongooseConnection = undefined;
  }

  const connection = mongoose.connect(uri, {
    bufferCommands: false,
    family: 4,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  globalThis._mongooseConnection = connection;

  // Don't cache a failed attempt, otherwise every later request reuses the
  // rejected promise until the server restarts.
  connection.catch(() => {
    if (globalThis._mongooseConnection === connection) {
      globalThis._mongooseConnection = undefined;
    }
  });

  await connection;
  return mongoose;
}

export async function resetDBConnection(): Promise<void> {
  globalThis._mongooseConnection = undefined;

  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
    } catch {
      // Best-effort reset for stale/broken pools.
    }
  }
}
