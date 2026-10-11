import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeJobMatchInputSchema,
  createJobToolLogic,
  createJobMatchToolLogic,
  getJobDetailsInputSchema,
  MAX_ANALYSIS_TEXT_LENGTH,
  MAX_SEARCH_RESULTS,
  searchJobsInputSchema,
  serializeJobDetails,
  serializeJobSummary,
} from "../lib/mcp/job-tools.ts";
import { analyzeJobDescriptionAgainstResume } from "../lib/job-matching.ts";

const job = {
  id: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  externalId: "internal-feed-id",
  source: "Example Board",
  title: "Backend Engineer",
  company: "Example Co",
  location: "Dhaka",
  workplaceType: "HYBRID",
  employmentType: "FULL_TIME",
  salaryMin: "1000.00",
  salaryMax: "2000.00",
  salaryCurrency: "USD",
  salaryPeriod: "YEAR",
  description: "Build reliable services.",
  jobUrl: "https://jobs.example.test/backend",
  postedAt: new Date("2026-01-02T03:04:05.000Z"),
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  updatedAt: new Date("2026-01-02T03:04:05.000Z"),
};

test("validates search and details tool inputs", () => {
  assert.equal(
    searchJobsInputSchema.safeParse({ keywords: "  backend  ", limit: 5 }).success,
    true,
  );
  assert.equal(searchJobsInputSchema.safeParse({ keywords: "  " }).success, false);
  assert.equal(
    searchJobsInputSchema.safeParse({ keywords: "engineer", limit: MAX_SEARCH_RESULTS + 1 })
      .success,
    false,
  );
  assert.equal(
    getJobDetailsInputSchema.safeParse({ jobId: "not-a-uuid" }).success,
    false,
  );
  assert.equal(
    getJobDetailsInputSchema.safeParse({ jobId: job.id }).success,
    true,
  );
});

test("validates workplace type against application values", () => {
  for (const workplaceType of ["REMOTE", "HYBRID", "ONSITE"]) {
    assert.equal(
      searchJobsInputSchema.safeParse({ keywords: "engineer", workplaceType }).success,
      true,
    );
  }
  assert.equal(
    searchJobsInputSchema.safeParse({ keywords: "engineer", workplaceType: "FLEXIBLE" })
      .success,
    false,
  );
});

test("passes title/company search and bounded result options to listJobs", async () => {
  let receivedOptions;
  const logic = createJobToolLogic({
    async listJobs(options) {
      receivedOptions = options;
      return Array.from({ length: MAX_SEARCH_RESULTS + 10 }, (_, index) => ({
        ...job,
        id: `${index}`,
      }));
    },
    async getJobById() {
      return null;
    },
  });

  const result = await logic.searchJobs({
    keywords: "  backend  ",
    workplaceType: "HYBRID",
    limit: MAX_SEARCH_RESULTS,
  });

  assert.deepEqual(receivedOptions, {
    search: "backend",
    workplaceType: "HYBRID",
    limit: MAX_SEARCH_RESULTS,
    offset: 0,
  });
  assert.equal(result.count, MAX_SEARCH_RESULTS);
  assert.equal(result.jobs.length, MAX_SEARCH_RESULTS);
});

test("serializes public summaries and details without internal fields", () => {
  const summary = serializeJobSummary(job);
  assert.deepEqual(summary, {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    workplaceType: job.workplaceType,
    employmentType: job.employmentType,
    salary: {
      minimum: "1000.00",
      maximum: "2000.00",
      currency: "USD",
      period: "YEAR",
    },
    postedAt: "2026-01-02T03:04:05.000Z",
    source: job.source,
  });
  assert.equal("externalId" in summary, false);

  const details = serializeJobDetails(job);
  assert.equal(details.description, job.description);
  assert.equal(details.jobUrl, job.jobUrl);
  assert.equal(serializeJobDetails({ ...job, jobUrl: "javascript:alert(1)" }).jobUrl, null);
});

test("returns a clean null result for a missing job", async () => {
  let requestedId;
  const logic = createJobToolLogic({
    async listJobs() {
      return [];
    },
    async getJobById(id) {
      requestedId = id;
      return null;
    },
  });

  assert.deepEqual(await logic.getJobDetails({ jobId: job.id }), { job: null });
  assert.equal(requestedId, job.id);
});

test("validates caller-supplied analysis fields and rejects unexpected properties", () => {
  const valid = { resumeText: "Resume", jobDescription: "Job" };
  assert.equal(analyzeJobMatchInputSchema.safeParse(valid).success, true);
  assert.equal(analyzeJobMatchInputSchema.safeParse({ jobDescription: "Job" }).success, false);
  assert.equal(analyzeJobMatchInputSchema.safeParse({ resumeText: "Resume" }).success, false);
  assert.equal(analyzeJobMatchInputSchema.safeParse({ ...valid, extra: "value" }).success, false);
  assert.equal(analyzeJobMatchInputSchema.safeParse({ resumeText: "", jobDescription: "Job" }).success, false);
  assert.equal(analyzeJobMatchInputSchema.safeParse({ resumeText: " \n ", jobDescription: "Job" }).success, false);
  assert.equal(analyzeJobMatchInputSchema.safeParse({ resumeText: "Resume", jobDescription: " \t " }).success, false);
});

test("accepts the 20,000 character boundary and rejects larger inputs", () => {
  const valid = { resumeText: "r".repeat(MAX_ANALYSIS_TEXT_LENGTH), jobDescription: "Job" };
  assert.equal(analyzeJobMatchInputSchema.safeParse(valid).success, true);
  assert.equal(
    analyzeJobMatchInputSchema.safeParse({ ...valid, resumeText: `${valid.resumeText}r` }).success,
    false,
  );
  assert.equal(
    analyzeJobMatchInputSchema.safeParse({ resumeText: "Resume", jobDescription: "j".repeat(MAX_ANALYSIS_TEXT_LENGTH) }).success,
    true,
  );
  assert.equal(
    analyzeJobMatchInputSchema.safeParse({ resumeText: "Resume", jobDescription: "j".repeat(MAX_ANALYSIS_TEXT_LENGTH + 1) }).success,
    false,
  );
});

test("analysis output matches the website matcher and never echoes supplied text", () => {
  const resumeText = "Private resume: TypeScript, React, and PostgreSQL.";
  const jobDescription = "Confidential posting seeks React, TypeScript, and AWS.";
  const result = createJobMatchToolLogic().analyzeJobMatch({ resumeText, jobDescription });
  const websiteResult = analyzeJobDescriptionAgainstResume(resumeText, jobDescription);

  assert.deepEqual(
    {
      score: result.score,
      matchingSkills: result.matchingSkills,
      skillsNotDetected: result.skillsNotDetected,
      explanation: result.explanation,
      nextStep: result.nextStep,
    },
    websiteResult,
  );
  assert.match(result.scoreDescription, /heuristic, not a hiring probability/i);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(resumeText), false);
  assert.equal(serialized.includes(jobDescription), false);
  assert.equal(serialized.includes("Private resume"), false);
  assert.equal(serialized.includes("Confidential posting"), false);
});

test("returns a nullable score when the description has no recognized skills", () => {
  const result = createJobMatchToolLogic().analyzeJobMatch({
    resumeText: "Experienced professional",
    jobDescription: "Seeking a motivated and collaborative teammate.",
  });
  assert.equal(result.score, null);
  assert.deepEqual(result.matchingSkills, []);
  assert.deepEqual(result.skillsNotDetected, []);
  assert.match(result.explanation, /no skill overlap to score/i);
});

test("invalid analysis errors do not include submitted text", () => {
  const secretLookingInput = "user supplied private string";
  assert.throws(
    () => createJobMatchToolLogic().analyzeJobMatch({ resumeText: " ", jobDescription: secretLookingInput }),
    (error) => {
      assert.doesNotMatch(error.message, /user supplied private string/);
      return true;
    },
  );
});
