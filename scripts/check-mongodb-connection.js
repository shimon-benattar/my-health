#!/usr/bin/env node

const dns = require("node:dns").promises;
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const tls = require("node:tls");
const mongoose = require("mongoose");

const { chooseMongoUri, extractMongoSrvLookupName, parseSimpleEnvFile, summarizeMongoUri } = require("../lib/dbDiagnostics");

async function loadMongoConfig() {
  const selectedFromProcess = chooseMongoUri(process.env);
  if (selectedFromProcess.value) {
    return selectedFromProcess;
  }

  const envPath = path.join(process.cwd(), ".env.local");
  try {
    const envText = await fs.readFile(envPath, "utf8");
    const parsed = parseSimpleEnvFile(envText);
    return chooseMongoUri(parsed);
  } catch {
    return { key: null, value: null };
  }
}

async function resolveSrvRecords(lookupName) {
  if (!lookupName) {
    return { ok: false, reason: "not_srv_uri", records: [] };
  }

  try {
    const records = await dns.resolveSrv(lookupName);
    return {
      ok: true,
      reason: null,
      records: records.map((record) => ({
        name: record.name,
        port: record.port,
        priority: record.priority,
        weight: record.weight,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      records: [],
    };
  }
}

async function testTcp(host, port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 5000, family: 4 }, () => {
      socket.end();
      resolve({ ok: true, reason: null });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, reason: "timeout" });
    });

    socket.on("error", (error) => {
      resolve({ ok: false, reason: error instanceof Error ? error.message : String(error) });
    });
  });
}

async function testTls(host, port) {
  return await new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, timeout: 5000, family: 4 }, () => {
      const authorized = socket.authorized;
      const authorizationError = socket.authorizationError ?? null;
      socket.end();
      resolve({
        ok: authorized || authorizationError === null,
        reason: authorizationError,
      });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, reason: "tls-timeout" });
    });

    socket.on("error", (error) => {
      resolve({ ok: false, reason: error instanceof Error ? error.message : String(error) });
    });
  });
}

async function testMongoose(uri) {
  try {
    await mongoose.connect(uri, {
      bufferCommands: false,
      family: 4,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    const result = {
      ok: true,
      reason: null,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host || null,
      database: mongoose.connection.name || null,
    };
    await mongoose.disconnect();
    return result;
  } catch (error) {
    try {
      await mongoose.disconnect();
    } catch {
      // Best effort only.
    }

    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      readyState: mongoose.connection.readyState,
      host: null,
      database: null,
    };
  }
}

async function main() {
  const mongoConfig = await loadMongoConfig();
  const uri = mongoConfig.value;
  const uriSummary = summarizeMongoUri(uri);
  const srvLookupName = extractMongoSrvLookupName(uri);
  const srv = await resolveSrvRecords(srvLookupName);
  const firstTarget = srv.records[0] ?? null;
  const tcp = firstTarget ? await testTcp(firstTarget.name, firstTarget.port) : { ok: false, reason: "no_srv_target" };
  const tlsResult = firstTarget ? await testTls(firstTarget.name, firstTarget.port) : { ok: false, reason: "no_srv_target" };
  const mongooseResult = uri ? await testMongoose(uri) : { ok: false, reason: "missing MONGODB_URI", readyState: 0, host: null, database: null };

  const summary = {
    ok: mongooseResult.ok,
    source: mongoConfig.key,
    uri: uriSummary,
    checks: {
      srvLookupName,
      srv,
      firstTarget,
      tcp,
      tls: tlsResult,
      mongoose: mongooseResult,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        fatal: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
