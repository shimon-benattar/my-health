import mongoose from "mongoose";

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConnection: Promise<typeof mongoose> | undefined;
}

if (!process.env.MONGODB_URI) {
  throw new Error("Please set the MONGODB_URI environment variable in .env.local");
}

const uri = process.env.MONGODB_URI;

/**
 * Cached connection: reuse across hot-reloads in development and
 * across invocations within the same Vercel serverless function instance.
 */
const clientPromise: Promise<typeof mongoose> =
  globalThis._mongooseConnection ??
  (globalThis._mongooseConnection = mongoose.connect(uri, {
    bufferCommands: false,
  }));

export default clientPromise;
