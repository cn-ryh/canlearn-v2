import { describe, expect, it } from "vitest";

describe("web baseline", () => {
  it("keeps the public API versioned", () => {
    expect(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1").toContain("/v1");
  });
});
