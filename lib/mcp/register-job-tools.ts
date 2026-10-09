import type { McpServer } from "@modelcontextprotocol/server";

import {
  createJobToolLogic,
  getJobDetailsInputSchema,
  searchJobsInputSchema,
  type JobToolDependencies,
} from "./job-tools";

function structuredResult(data: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function registerJobTools(
  server: McpServer,
  dependencies: JobToolDependencies,
): void {
  const jobs = createJobToolLogic(dependencies);

  server.registerTool(
    "search_jobs",
    {
      title: "Search jobs",
      description:
        "Search jobs by required title/company keywords, with an optional workplace-type filter. Results are matched against job titles and company names only, not descriptions or locations.",
      inputSchema: searchJobsInputSchema,
    },
    async (input) => structuredResult(await jobs.searchJobs(input)),
  );

  server.registerTool(
    "get_job_details",
    {
      title: "Get job details",
      description:
        "Retrieve public details for one job using its UUID. A missing job is returned as { job: null }.",
      inputSchema: getJobDetailsInputSchema,
    },
    async (input) => structuredResult(await jobs.getJobDetails(input)),
  );
}
