import assert from "node:assert/strict";
import test from "node:test";
import { analyzeJobDescriptionAgainstResume, detectSkills, matchResumeToJob, SKILL_DICTIONARY } from "../lib/job-matching.ts";

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

test("recognizes common frontend, accessibility, backend, database, language and testing vocabulary", () => {
  const cases = [
    ["Angular", ["Angular"]], ["ReactJS / React.js", ["React"]],
    ["NextJS VueJS HTML5 CSS3 TailwindCSS responsive web design", ["CSS", "HTML", "Next.js", "Responsive design", "Tailwind CSS", "Vue"]],
    ["WCAG 2.2, WAI-ARIA and keyboard navigation", ["ARIA", "Keyboard accessibility", "WCAG"]],
    ["semantic HTML5", ["HTML", "Semantic HTML"]],
    ["NodeJS ExpressJS Nest.js RESTful APIs GraphQL", ["Express", "GraphQL", "NestJS", "Node.js", "REST APIs"]],
    ["Postgres MySQL Mongo DB Redis", ["MongoDB", "MySQL", "PostgreSQL", "Redis"]],
    ["ECMAScript TypeScript Python Java CSharp Golang", ["C#", "Go", "Java", "JavaScript", "Python", "TypeScript"]],
    ["Jest Vitest Playwright Cypress", ["Cypress", "Jest", "Playwright", "Vitest"]],
  ];
  for (const [text, expected] of cases) assert.deepEqual(detectSkills(text), expected, text);
});

test("every listed alias resolves to its canonical skill without duplicate output", () => {
  for (const entry of SKILL_DICTIONARY) {
    for (const alias of entry.aliases) {
      const detected = detectSkills(`${alias}, ${alias}; ${alias}.`);
      assert.ok(detected.includes(entry.skill), `${alias} => ${entry.skill}`);
      assert.equal(detected.filter(skill => skill === entry.skill).length, 1, alias);
      if (!("caseSensitive" in entry)) assert.ok(detectSkills(alias.toLowerCase()).includes(entry.skill), alias);
    }
  }
});

test("handles wrapped phrases and nonbreaking whitespace without loosening punctuation", () => {
  assert.deepEqual(detectSkills("Web Content\nAccessibility Guidelines, Accessible Rich\tInternet Applications, responsive\u00a0web design, RESTful\nAPIs"),
    ["Accessibility", "ARIA", "REST APIs", "Responsive design", "WCAG"]);
  assert.deepEqual(detectSkills("NextXjs NodeXjs Cx .NETwork"), []);
  assert.deepEqual(detectSkills("(C#), C++, .NET; React/TypeScript"), ["C#", "C++", ".NET", "React", "TypeScript"]);
});

test("does not infer related technologies or match ambiguous prose and embedded terms", () => {
  assert.deepEqual(detectSkills("We go to the next node to sing an aria in semantic prose. Responsive teammates use keyboard shortcuts."), []);
  assert.deepEqual(detectSkills("AngularJS Reactivity PostgreSQLish vitesting préReact Reacté 2Vitest Vitest2"), []);
  assert.deepEqual(detectSkills("JavaScript"), ["JavaScript"]);
  assert.deepEqual(detectSkills("PostgreSQL"), ["PostgreSQL"]);
  assert.deepEqual(detectSkills("NextJS"), ["Next.js"]);
  assert.deepEqual(detectSkills("Node JS, React JS, Next JS"), ["Next.js", "Node.js", "React"]);
  assert.deepEqual(detectSkills("ARIA and aria"), ["ARIA"]);
});

test("new aliases count unique job skills once and preserve the rounded denominator", () => {
  const result = matchResumeToJob(
    "NextJS, NodeJS, WAI-ARIA, Vitest, plus Python and Docker",
    "Next.js / NextJS; Node.js / Node JS; ARIA / WAI-ARIA; Vitest, Angular, WCAG",
  );
  assert.equal(result.score, 67);
  assert.deepEqual(result.matchingSkills, ["ARIA", "Next.js", "Node.js", "Vitest"]);
  assert.deepEqual(result.jobSkillsNotDetected, ["Angular", "WCAG"]);
  assert.match(result.explanation, /Detected 4 of 6/);
  assert.deepEqual(matchResumeToJob("", "WCAG Vitest"), {
    score: 0, matchingSkills: [], jobSkillsNotDetected: ["Vitest", "WCAG"],
    explanation: "Detected 0 of 2 job-description skills in the resume (0% overlap). Skills not detected may still be part of the candidate’s experience; this text-based baseline only compares terms in the supplied text.",
  });
});

test("recognizes all five requirements in the supplied frontend job without inferring resume skills", () => {
  const resume = "I have experience with React, Next.js, TypeScript, JavaScript, PostgreSQL, and Tailwind CSS.";
  const job = "We are hiring a frontend developer experienced with React, TypeScript, Next.js, accessibility, and responsive web applications.";
  assert.deepEqual(detectSkills(job), ["Accessibility", "Next.js", "React", "Responsive design", "TypeScript"]);
  assert.equal(detectSkills(resume).includes("Accessibility"), false);
  assert.equal(detectSkills(resume).includes("Responsive design"), false);
  const match = matchResumeToJob(resume, job);
  assert.deepEqual(match, {
    score: 60,
    matchingSkills: ["Next.js", "React", "TypeScript"],
    jobSkillsNotDetected: ["Accessibility", "Responsive design"],
    explanation: "Detected 3 of 5 job-description skills in the resume (60% overlap). Skills not detected may still be part of the candidate’s experience; this text-based baseline only compares terms in the supplied text.",
  });
  assert.deepEqual(matchResumeToJob(resume, `${job} Accessibility, responsive web application, responsive design, React.js, NextJS.`), match);
  assert.equal(matchResumeToJob(`${resume} Accessibility and responsive design.`, job).score, 100);
  const analysis = analyzeJobDescriptionAgainstResume(resume, job);
  assert.equal(analysis.score, match.score);
  assert.deepEqual(analysis.skillsNotDetected, match.jobSkillsNotDetected);
  assert.match(analysis.nextStep, /only where it accurately reflects your experience/);
  assert.equal(analyzeJobDescriptionAgainstResume(resume, "Seeking a thoughtful teammate.").score, null);
});

test("new requirement phrases retain whole-term boundaries and accept extracted whitespace", () => {
  assert.deepEqual(detectSkills("ACCESSIBILITY; responsive\nweb\u00a0applications"), ["Accessibility", "Responsive design"]);
  assert.deepEqual(detectSkills("inaccessibility accessibilityish préaccessibility accessibilityé unresponsive web applications responsive web applicationsish"), []);
  assert.deepEqual(detectSkills("React and Tailwind CSS"), ["CSS", "React", "Tailwind CSS"]);
});
