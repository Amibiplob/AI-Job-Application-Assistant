/** Public onboarding content only. Never put OAuth credentials in this module. */
export const MCP_SERVER_URL = "https://ai-job-application-assistant-lovat.vercel.app/api/mcp";
export const CHATGPT_CONNECTION_GUIDE = "https://developers.openai.com/api/docs/guides/custom-mcp-server";

export const SAMPLE_SEARCH_INPUT = { keywords: "frontend", workplaceType: "REMOTE", limit: 5 } as const;
export const SAMPLE_MATCH_INPUT = {
  resumeText: "Sample resume: I have experience with React, Next.js, TypeScript, JavaScript, PostgreSQL, and Tailwind CSS.",
  jobDescription: "Sample role: We are hiring a frontend developer experienced with React, TypeScript, Next.js, accessibility, and responsive web applications.",
} as const;

export const CONNECT_EXAMPLES = [
  {
    id: "search",
    title: "Find available jobs",
    tool: "search_jobs",
    description: "Search titles and company names, with an optional workplace filter. Results include job IDs to use in your next question.",
    prompt: `Use my connected AI Job Application Assistant to call search_jobs with these inputs:\n${JSON.stringify(SAMPLE_SEARCH_INPUT, null, 2)}\nShow each result's title, company, source, and job ID. Label demonstration listings clearly.`,
    note: "Search covers titles and company names, not descriptions or locations. Workplace filters are REMOTE, HYBRID, or ONSITE. You can request up to 25 results.",
  },
  {
    id: "details",
    title: "Take a closer look",
    tool: "get_job_details",
    description: "Retrieve one job’s public details, including its description and original listing link when available.",
    prompt: "Use my connected AI Job Application Assistant to call get_job_details. Set jobId to the exact job ID (UUID) of the first result from our previous search_jobs call. Show the description, source, and original listing URL if available. If no result was returned, ask me to run a search first; do not invent a job ID.",
    note: "Run the search example first. This tool needs a real job ID from the returned results; it does not accept a title or company name.",
  },
  {
    id: "match",
    title: "Compare your experience",
    tool: "analyze_job_match",
    description: "Compare resume text with a job description. Get a recognized-skill overlap score, shared skills, skills not detected, and a suggested next step.",
    prompt: `Use my connected AI Job Application Assistant to call analyze_job_match with this fictional sample:\n${JSON.stringify(SAMPLE_MATCH_INPUT, null, 2)}\nReturn the actual tool score, matching skills, skills not detected, and suggested next step. Do not calculate a substitute score.`,
    note: "Both text fields are required and each supports up to 20,000 characters. Supply resume text directly; the remote MCP cannot retrieve your website-saved resume.",
  },
] as const;
