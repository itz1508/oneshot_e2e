import test from "node:test";
import assert from "node:assert/strict";
import {
  UnauthenticatedContextProvider,
} from "../../security/authentication-context.js";

test("UnauthenticatedContextProvider returns an unauthenticated principal by design", () => {
  const p = new UnauthenticatedContextProvider().principal();
  assert.equal(p.authenticated, false);
  assert.equal(p.principalId, undefined);
});

test("UnauthenticatedContextProvider is NOT an enforcement boundary (named so it cannot be mistaken for one)", () => {
  // It is a data object describing the current posture, not a gate.
  const provider = new UnauthenticatedContextProvider();
  assert.equal(typeof provider.principal, "function");
  assert.equal(provider.principal().authenticated, false);
});
