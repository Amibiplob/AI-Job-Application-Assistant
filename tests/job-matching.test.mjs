import assert from "node:assert/strict";
import test from "node:test";
import { detectSkills, matchResumeToJob } from "../lib/job-matching.ts";

test("detects canonical skills case-insensitively and recognizes listed aliases", () => {
  assert.deepEqual(
    detectSkills("Built with REACT.js, TypeScript, PostgreSQL, and Amazon Web Services."),
    ["AWS", "PostgreSQL", "React", "TypeScript"],
  );
});

test("compares detected skills using rounded job-skill overlap", () => {
  const result = matchResumeToJob(
    "Built production apps with TypeScript and React.js.",
    "Requirements: React, TypeScript, PostgreSQL, and Python.",
  );

  assert.deepEqual(result, {
    score: 50,
    matchingSkills: ["React", "TypeScript"],
    jobSkillsNotDetected: ["PostgreSQL", "Python"],
    explanation: "Detected 2 of 4 job-description skills in the resume (50% overlap). Skills not detected may still be part of the candidate’s experience; this text-based baseline only compares terms in the supplied text.",
  });
});

test("avoids partial-word matches and common lowercase uses of Go", () => {
  assert.deepEqual(detectSkills("We are going to improve the application."), []);
  assert.deepEqual(detectSkills("Go and Golang services"), ["Go"]);
  assert.deepEqual(detectSkills("JavaScript"), ["JavaScript"]);
});

test("returns a safe zero score for empty resume text", () => {
  const result = matchResumeToJob("", "React and Docker are required.");
  assert.equal(result.score, 0);
  assert.deepEqual(result.matchingSkills, []);
  assert.deepEqual(result.jobSkillsNotDetected, ["Docker", "React"]);
  assert.match(result.explanation, /may still be part of the candidate’s experience/);
});

test("returns a safe zero score when no job-description skills are detected", () => {
  const result = matchResumeToJob("Experienced React developer.", "A thoughtful teammate for a growing team.");
  assert.equal(result.score, 0);
  assert.deepEqual(result.matchingSkills, []);
  assert.deepEqual(result.jobSkillsNotDetected, []);
  assert.match(result.explanation, /No dictionary skills were detected/);
});

test("returns the same result for repeated inputs", () => {
  const first = matchResumeToJob("Python and AWS", "Python, AWS, and Docker");
  const second = matchResumeToJob("Python and AWS", "Python, AWS, and Docker");
  assert.deepEqual(first, second);
});
