"use client";

import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { JobDescriptionInput } from "@/lib/job-matching";

const emptyDraft: JobDescriptionInput = { title: "", company: "", description: "" };
type DraftState = [JobDescriptionInput, Dispatch<SetStateAction<JobDescriptionInput>>];
const AnalysisDraftContext = createContext<DraftState | null>(null);

/** In-memory only. The authenticated layout keys this provider to its user. */
export function AnalysisDraftProvider({ children }: { children: ReactNode }) {
  const state = useState<JobDescriptionInput>(emptyDraft);
  return <AnalysisDraftContext.Provider value={state}>{children}</AnalysisDraftContext.Provider>;
}

export function useAnalysisDraft(): DraftState {
  const context = useContext(AnalysisDraftContext);
  const local = useState<JobDescriptionInput>(emptyDraft);
  return context ?? local;
}
