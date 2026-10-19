import { describe, expect, it } from "vitest";
import { getMongoConnectionUri } from "@/lib/db";

describe("getMongoConnectionUri", () => {
  it("prefers MONGODB_DIRECT_URI when provided", () => {
    expect(
      getMongoConnectionUri({
        MONGODB_URI: "mongodb+srv://srv-user:srv-pass@cluster.mongodb.net/my-health",
        MONGODB_DIRECT_URI: "mongodb://direct-user:direct-pass@host-1:27017,host-2:27017/my-health",
      } as NodeJS.ProcessEnv)
    ).toBe("mongodb://direct-user:direct-pass@host-1:27017,host-2:27017/my-health");
  });

  it("falls back to MONGODB_URI when no direct uri is set", () => {
    expect(
      getMongoConnectionUri({
        MONGODB_URI: "mongodb+srv://srv-user:srv-pass@cluster.mongodb.net/my-health",
      } as NodeJS.ProcessEnv)
    ).toBe("mongodb+srv://srv-user:srv-pass@cluster.mongodb.net/my-health");
  });

  it("throws when neither mongo env var is configured", () => {
    expect(() => getMongoConnectionUri({} as NodeJS.ProcessEnv)).toThrow(
      "Please set MONGODB_URI or MONGODB_DIRECT_URI in .env.local"
    );
  });
});
