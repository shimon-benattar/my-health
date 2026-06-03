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
export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Please set the MONGODB_URI environment variable in .env.local");
  }

  if (globalThis._mongooseConnection) {
    return globalThis._mongooseConnection;
  }

  globalThis._mongooseConnection = mongoose.connect(uri, {
    bufferCommands: false,
  });

  return globalThis._mongooseConnection;
}
