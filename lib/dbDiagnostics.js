function stripWrappingQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseSimpleEnvFile(text) {
  return text
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return acc;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        return acc;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1).trim());
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function summarizeMongoUri(uri) {
  if (!uri) {
    return {
      present: false,
      scheme: null,
      host: null,
      database: null,
      hasUser: false,
      hasPassword: false,
    };
  }

  const scheme = uri.startsWith("mongodb+srv://")
    ? "mongodb+srv"
    : uri.startsWith("mongodb://")
      ? "mongodb"
      : "unknown";

  try {
    const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://"));
    return {
      present: true,
      scheme,
      host: parsed.host || null,
      database: parsed.pathname.replace(/^\//, "") || null,
      hasUser: Boolean(parsed.username),
      hasPassword: Boolean(parsed.password),
    };
  } catch {
    return {
      present: true,
      scheme,
      host: null,
      database: null,
      hasUser: false,
      hasPassword: false,
    };
  }
}

function chooseMongoUri(env) {
  const directUri = env.MONGODB_DIRECT_URI?.trim();
  if (directUri) {
    return { key: "MONGODB_DIRECT_URI", value: directUri };
  }

  const uri = env.MONGODB_URI?.trim();
  if (uri) {
    return { key: "MONGODB_URI", value: uri };
  }

  return { key: null, value: null };
}

function extractMongoSrvLookupName(uri) {
  const match = uri?.match(/^mongodb\+srv:\/\/[^@]+@([^/?]+)/);
  return match ? `_mongodb._tcp.${match[1]}` : null;
}

module.exports = {
  chooseMongoUri,
  extractMongoSrvLookupName,
  parseSimpleEnvFile,
  summarizeMongoUri,
};
