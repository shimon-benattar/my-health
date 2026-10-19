import { describe, expect, it } from "vitest";
import { chooseMongoUri, extractMongoSrvLookupName, parseSimpleEnvFile, summarizeMongoUri } from "@/lib/dbDiagnostics";

describe("dbDiagnostics", () => {
  it("parses simple env files with comments and quotes", () => {
    const parsed = parseSimpleEnvFile(`
# comment
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/my-health"
NEXT_PUBLIC_FLAG='enabled'
EMPTY=
INVALID
`);

    expect(parsed).toEqual({
      MONGODB_URI: "mongodb+srv://user:pass@cluster.mongodb.net/my-health",
      NEXT_PUBLIC_FLAG: "enabled",
      EMPTY: "",
    });
  });

  it("summarizes mongo uri details without exposing the raw secret", () => {
    expect(
      summarizeMongoUri("mongodb+srv://user:pass@my-health.0jvyz1d.mongodb.net/my-health?retryWrites=true&w=majority")
    ).toEqual({
      present: true,
      scheme: "mongodb+srv",
      host: "my-health.0jvyz1d.mongodb.net",
      database: "my-health",
      hasUser: true,
      hasPassword: true,
    });
  });

  it("builds the SRV lookup name only for mongodb+srv uris", () => {
    expect(
      extractMongoSrvLookupName("mongodb+srv://user:pass@my-health.0jvyz1d.mongodb.net/my-health")
    ).toBe("_mongodb._tcp.my-health.0jvyz1d.mongodb.net");
    expect(
      extractMongoSrvLookupName("mongodb://user:pass@localhost:27017/my-health")
    ).toBeNull();
  });

  it("prefers the direct uri when both env vars are present", () => {
    expect(
      chooseMongoUri({
        MONGODB_URI: "mongodb+srv://srv-user:srv-pass@cluster.mongodb.net/my-health",
        MONGODB_DIRECT_URI: "mongodb://direct-user:direct-pass@host-1:27017,host-2:27017/my-health",
      })
    ).toEqual({
      key: "MONGODB_DIRECT_URI",
      value: "mongodb://direct-user:direct-pass@host-1:27017,host-2:27017/my-health",
    });
  });
});
