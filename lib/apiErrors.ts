export function isDatabaseUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const name = error.name ?? "";
  const message = error.message ?? "";

  return (
    /MongooseServerSelectionError|MongoServerSelectionError|MongoNetworkTimeoutError/i.test(name) ||
    /could not connect to any servers/i.test(message) ||
    /ip (address )?is on your atlas cluster'?s ip whitelist/i.test(message) ||
    /secureconnect.*timed out/i.test(message) ||
    /connecttimeoutms/i.test(message) ||
    /before initial connection is complete if `bufferCommands = false`/i.test(message)
  );
}

export function databaseUnavailablePayload(requestId?: string) {
  return {
    error: "Database is unavailable. Check MongoDB Atlas connectivity or IP allowlist and try again.",
    code: "database_unavailable",
    requestId,
  };
}
