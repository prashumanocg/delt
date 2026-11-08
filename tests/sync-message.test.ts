// #150: a failed check for mail says whose side failed, not always "Couldn't reach Gmail".
import { test } from "node:test";
import assert from "node:assert/strict";
import { syncFailureText } from "../src/lib/sync-message";
import { fromGoogle } from "../src/lib/api-error";

test("#150: offline, no answer, Gmail, timeout and DELT each get their own words", () => {
  assert.equal(syncFailureText({ online: false, status: null }), "You're offline");
  assert.equal(syncFailureText({ online: true, status: null }), "Couldn't reach DELT. Check your connection.");
  assert.equal(syncFailureText({ online: true, status: 502, error: "Gmail didn't answer. Try again in a moment." }), "Gmail didn't answer. Try again in a moment.");
  assert.equal(syncFailureText({ online: true, status: 504 }), "Checking took too long. Try again.");
  assert.equal(syncFailureText({ online: true, status: 500 }), "Something went wrong on DELT's side. Try again.");
  for (const status of [null, 500, 502, 504]) assert.doesNotMatch(syncFailureText({ online: true, status }), /Couldn't reach Gmail/);
});

test("#150: the sync route blames Google only for Google's errors", () => {
  assert.equal(fromGoogle(new Error("Gmail /messages failed (500): backend error")), true);
  assert.equal(fromGoogle(new Error("Gmail didn't answer within 15s")), true);
  assert.equal(fromGoogle(new Error("Google token refresh failed (400): invalid_grant")), true);
  assert.equal(fromGoogle(new Error('duplicate key value violates unique constraint "emails_pkey"')), false);
  assert.equal(fromGoogle(new TypeError("Cannot read properties of undefined")), false);
  assert.equal(fromGoogle(null), false);
});
