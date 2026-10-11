import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  analyzeJobDescriptionAgainstResume,
  JOB_DESCRIPTION_LIMITS,
  validateJobDescriptionInput,
} from "../lib/job-matching.ts";

const validInput = {
  title: "Software Engineer",
  company: "Example Co",
  description: "We use TypeScript and React. PostgreSQL is a plus.",
};

test("validates required fields and configured maximum lengths", () => {
  assert.equal(validateJobDescriptionInput(validInput).success, true);
  assert.equal(validateJobDescriptionInput({ ...validInput, description: "  " }).success, false);
  assert.equal(validateJobDescriptionInput({ ...validInput, title: "" }).success, false);
  assert.equal(validateJobDescriptionInput({ ...validInput, company: "" }).success, false);
  assert.equal(validateJobDescriptionInput({ ...validInput, title: "x".repeat(JOB_DESCRIPTION_LIMITS.title + 1) }).success, false);
  assert.equal(validateJobDescriptionInput({ ...validInput, company: "x".repeat(JOB_DESCRIPTION_LIMITS.company + 1) }).success, false);
  assert.equal(validateJobDescriptionInput({ ...validInput, description: "x".repeat(JOB_DESCRIPTION_LIMITS.description + 1) }).success, false);
});

test("uses the deterministic matcher and gives resume-focused next steps", () => {
  const result = analyzeJobDescriptionAgainstResume("React and TypeScript experience", validInput.description);
  assert.equal(result.score, 67);
  assert.deepEqual(result.matchingSkills, ["React", "TypeScript"]);
  assert.deepEqual(result.skillsNotDetected, ["PostgreSQL"]);
  assert.match(result.nextStep, /only where it accurately reflects your experience/);
});

test("does not show a score when the description contains no recognized skills", () => {
  const result = analyzeJobDescriptionAgainstResume("React experience", "A thoughtful teammate for a growing organization.");
  assert.equal(result.score, null);
  assert.deepEqual(result.matchingSkills, []);
  assert.deepEqual(result.skillsNotDetected, []);
});

test("an empty resume produces zero overlap and does not imply skills are absent", () => {
  const result = analyzeJobDescriptionAgainstResume("", "React, Docker, and TypeScript are useful.");
  assert.equal(result.score, 0);
  assert.deepEqual(result.matchingSkills, []);
  assert.deepEqual(result.skillsNotDetected, ["Docker", "React", "TypeScript"]);
  assert.match(result.explanation, /may still be part of the candidate’s experience/);
});

test("the server action authenticates before loading the session-owned resume", async () => {
  const [action, resumes] = await Promise.all([
    readFile(new URL("../app/dashboard/analyze/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/resumes.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(action.indexOf("if (!currentUser) redirect(\"/login\")") < action.indexOf("await getResume()"));
  assert.match(action, /const resume = await getResume\(\)/);
  assert.match(action, /if \(!resume\)/);
  assert.match(action, /if \(!resume\.content\.trim\(\)\)/);
  assert.doesNotMatch(action, /formData\.get\(["']resumeId["']\)/);
  assert.match(resumes, /const userId = await requireUserId\(\)/);
  assert.match(resumes, /WHERE user_id = \$1/);
});
