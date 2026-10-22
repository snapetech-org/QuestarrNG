import { describe, expect, it } from "vitest";
import { oidcStateCookieName } from "../oidc-auth.js";

describe("OIDC state cookies", () => {
  it("isolates concurrent transactions with fixed-length safe cookie names", () => {
    const first = oidcStateCookieName("first-flow");
    const second = oidcStateCookieName("second-flow");

    expect(first).toMatch(/^questarr_oidc_state_[0-9a-f]{32}$/);
    expect(second).toMatch(/^questarr_oidc_state_[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });
});
