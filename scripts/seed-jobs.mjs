import "dotenv/config";
import { pool } from "../lib/db/pool.ts";

const jobs = [
  {
    externalId: "demo-seed-v1-001",
    source: "demo-board-alpha",
    title: "Frontend Developer",
    company: "Lantern Peak Labs",
    location: "United States (Remote)",
    workplaceType: "REMOTE",
    employmentType: "Full-time",
    salaryMin: 105000,
    salaryMax: 138000,
    salaryCurrency: "USD",
    salaryPeriod: "YEAR",
    description:
      "Build accessible product interfaces for a small team developing planning tools for community energy projects. You will work with design and API engineers to ship thoughtful React experiences, improve performance, and maintain a shared component library.",
    jobUrl: "https://jobs.lanternpeak.test/roles/frontend-developer",
    postedAt: "2026-10-08T14:00:00.000Z",
  },
  {
    externalId: "demo-seed-v1-002",
    source: "demo-board-alpha",
    title: "React Developer",
    company: "Copper Cloud Systems",
    location: "Boston, MA",
    workplaceType: "HYBRID",
    employmentType: "Full-time",
    salaryMin: 112000,
    salaryMax: 146000,
    salaryCurrency: "USD",
    salaryPeriod: "YEAR",
    description:
      "Create reliable React workflows for a fictional logistics platform used by regional food distributors. The role includes partnering with product on interaction design, writing maintainable TypeScript, and improving client-side observability.",
    jobUrl: "https://careers.coppercloud.test/openings/react-developer",
    postedAt: "2026-10-06T09:30:00.000Z",
  },
  {
    externalId: "demo-seed-v1-003",
    source: "demo-board-beta",
    title: "Next.js Developer",
    company: "Juniper Relay",
    location: "Seattle, WA",
    workplaceType: "ONSITE",
    employmentType: "Full-time",
    salaryMin: 125000,
    salaryMax: 159000,
    salaryCurrency: "USD",
    salaryPeriod: "YEAR",
    description:
      "Own server-rendered product surfaces for a made-up collaboration company. You will build with Next.js and TypeScript, tune page delivery, connect accessible UI to internal services, and help establish practical frontend patterns.",
    jobUrl: "https://juniperrelay.test/jobs/nextjs-developer",
    postedAt: "2026-10-03T16:15:00.000Z",
  },
  {
    externalId: "demo-seed-v1-004",
    source: "demo-board-beta",
    title: "Full-Stack Developer",
    company: "Tidal Logic Works",
    location: "North America (Remote)",
    workplaceType: "REMOTE",
    employmentType: "Contract",
    salaryMin: 70,
    salaryMax: 95,
    salaryCurrency: "USD",
    salaryPeriod: "HOUR",
    description:
      "Deliver focused product improvements across a TypeScript web app and its PostgreSQL services. This contract role suits an engineer comfortable shaping small features end to end, reviewing tradeoffs, and documenting operational behavior.",
    jobUrl: "https://work.tidallogic.test/positions/full-stack-contract",
    postedAt: "2026-09-29T11:00:00.000Z",
  },
  {
    externalId: "demo-seed-v1-005",
    source: "demo-board-gamma",
    title: "Software Engineer",
    company: "Maple Stack Studio",
    location: "Denver, CO",
    workplaceType: "HYBRID",
    employmentType: "Full-time",
    salaryMin: 118000,
    salaryMax: 152000,
    salaryCurrency: "USD",
    salaryPeriod: "YEAR",
    description:
      "Join a fictional team building inventory and forecasting software for independent repair shops. You will design APIs, contribute to a React-based admin console, and work with teammates to make releases predictable and observable.",
    jobUrl: "https://maplestack.test/careers/software-engineer",
    postedAt: "2026-09-24T13:45:00.000Z",
  },
  {
    externalId: "demo-seed-v1-006",
    source: "demo-board-alpha",
    title: "Backend Developer",
    company: "Kestrel Harbor Software",
    location: "Chicago, IL",
    workplaceType: "ONSITE",
    employmentType: "Full-time",
    salaryMin: 120000,
    salaryMax: 155000,
    salaryCurrency: "USD",
    salaryPeriod: "YEAR",
    description:
      "Develop dependable Node.js services for a fictional appointment coordination product. Work includes PostgreSQL query design, clear service contracts, queue-free background processing, and close collaboration with application engineers.",
    jobUrl: "https://jobs.kestrelharbor.test/backend-developer",
    postedAt: "2026-09-19T08:20:00.000Z",
  },
  {
    externalId: "demo-seed-v1-007",
    source: "demo-board-gamma",
    title: "Frontend Developer, Design Systems",
    company: "Verdant Orbit",
    location: "Toronto, ON",
    workplaceType: "HYBRID",
    employmentType: "Full-time",
    salaryMin: 108000,
    salaryMax: 142000,
    salaryCurrency: "CAD",
    salaryPeriod: "YEAR",
    description:
      "Expand the design system behind an imaginary climate-data workspace. You will build reusable accessible components, document interaction guidance, and collaborate with designers to support consistent experiences across several product teams.",
    jobUrl: "https://careers.verdantorbit.test/roles/design-systems-frontend",
    postedAt: "2026-09-14T15:10:00.000Z",
  },
  {
    externalId: "demo-seed-v1-008",
    source: "demo-board-beta",
    title: "Senior React Engineer",
    company: "Brightfield Circuitry",
    location: "United States (Remote)",
    workplaceType: "REMOTE",
    employmentType: "Full-time",
    salaryMin: 145000,
    salaryMax: 182000,
    salaryCurrency: "USD",
    salaryPeriod: "YEAR",
    description:
      "Guide frontend architecture for a fictional operations platform used by small manufacturing teams. You will mentor peers, improve React and TypeScript foundations, and partner across product and engineering to deliver complex workflows.",
    jobUrl: "https://brightfieldcircuitry.test/team/senior-react-engineer",
    postedAt: "2026-09-09T10:00:00.000Z",
  },
  {
    externalId: "demo-seed-v1-009",
    source: "demo-board-gamma",
    title: "Software Engineer, Developer Tools",
    company: "Orbit Orchard Computing",
    location: "Portland, OR",
    workplaceType: "ONSITE",
    employmentType: "Part-time",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    description:
      "Improve internal tools for a fictional team that maintains educational software. You will simplify local development workflows, build small TypeScript utilities, and help engineers diagnose issues with clear logs and concise documentation.",
    jobUrl: "https://orbitorchard.test/jobs/developer-tools-engineer",
    postedAt: "2026-09-04T12:30:00.000Z",
  },
  {
    externalId: "demo-seed-v1-010",
    source: "demo-board-alpha",
    title: "Backend Developer, Data Services",
    company: "Northline Pixel Company",
    location: "Philadelphia, PA",
    workplaceType: "HYBRID",
    employmentType: "Full-time",
    salaryMin: 115000,
    salaryMax: 148000,
    salaryCurrency: "USD",
    salaryPeriod: "YEAR",
    description:
      "Build data services for a fictional research scheduling product. The team values careful schema changes, efficient SQL, readable TypeScript, and engineers who can explain reliability tradeoffs to both technical and nontechnical partners.",
    jobUrl: "https://northlinepixel.test/careers/backend-data-services",
    postedAt: "2026-08-28T17:00:00.000Z",
  },
];

let client;
let inserted = 0;
let skipped = 0;

try {
  client = await pool.connect();
  await client.query("BEGIN");

  for (const job of jobs) {
    const result = await client.query(
      `INSERT INTO jobs (
         external_id, source, title, company, location, workplace_type,
         employment_type, salary_min, salary_max, salary_currency, salary_period,
         description, job_url, posted_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id`,
      [
        job.externalId,
        job.source,
        job.title,
        job.company,
        job.location,
        job.workplaceType,
        job.employmentType,
        job.salaryMin,
        job.salaryMax,
        job.salaryCurrency,
        job.salaryPeriod,
        job.description,
        job.jobUrl,
        job.postedAt,
      ],
    );

    if (result.rowCount === 1) {
      inserted += 1;
    } else {
      skipped += 1;
    }
  }

  await client.query("COMMIT");
  console.log(`Job seed complete: ${inserted} inserted, ${skipped} skipped, ${jobs.length} processed.`);
} catch {
  await client?.query("ROLLBACK").catch(() => {});
  console.error("Job seed failed; no credentials or database details were printed.");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end().catch(() => {});
}
