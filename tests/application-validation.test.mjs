import assert from "node:assert/strict";
import test from "node:test";
import { APPLICATION_STATUSES, validateApplicationUpdate } from "../lib/application-validation.ts";

const applicationId = "ecbfa2d7-4f45-4bb9-a0e2-f02f54a1170a";

function fields(overrides = {}) {
  return {
    applicationId,
    status: "SAVED",
    notes: " Follow up next week ",
    appliedAt: "",
    ...overrides,
  };
}

test("accepts only the schema's application statuses", () => {
  assert.deepEqual(APPLICATION_STATUSES, ["SAVED", "APPLIED", "INTERVIEW", "REJECTED", "OFFER", "WITHDRAWN"]);
  for (const status of APPLICATION_STATUSES) {
    assert.equal(validateApplicationUpdate(fields({ status }))?.status, status);
  }
  assert.equal(validateApplicationUpdate(fields({ status: "PENDING" })), null);
});

test("normalizes optional notes and applied dates", () => {
  const result = validateApplicationUpdate(fields({ appliedAt: "2024-02-29" }));
  assert.equal(result?.notes, "Follow up next week");
  assert.equal(result?.appliedAt?.toISOString(), "2024-02-29T12:00:00.000Z");
  assert.equal(validateApplicationUpdate(fields({ notes: "   " }))?.notes, null);
});

test("rejects malformed IDs, invalid dates, and oversized notes", () => {
  assert.equal(validateApplicationUpdate(fields({ applicationId: "not-a-uuid" })), null);
  assert.equal(validateApplicationUpdate(fields({ appliedAt: "2023-02-29" })), null);
  assert.equal(validateApplicationUpdate(fields({ appliedAt: "2024/02/29" })), null);
  assert.equal(validateApplicationUpdate(fields({ notes: "x".repeat(5001) })), null);
});
