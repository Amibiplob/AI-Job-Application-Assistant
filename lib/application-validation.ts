export const APPLICATION_STATUSES = [
  "SAVED",
  "APPLIED",
  "INTERVIEW",
  "REJECTED",
  "OFFER",
  "WITHDRAWN",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type ApplicationUpdateFields = {
  applicationId: string;
  status: string;
  notes: string;
  appliedAt: string;
};

export type ValidApplicationUpdate = {
  applicationId: string;
  status: ApplicationStatus;
  notes: string | null;
  appliedAt: Date | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTES_LENGTH = 5000;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function validateApplicationUpdate(
  fields: ApplicationUpdateFields,
): ValidApplicationUpdate | null {
  if (
    !isUuid(fields.applicationId)
    || !APPLICATION_STATUSES.some((status) => status === fields.status)
    || fields.notes.length > MAX_NOTES_LENGTH
  ) {
    return null;
  }

  let appliedAt: Date | null = null;
  if (fields.appliedAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.appliedAt)) return null;
    appliedAt = new Date(`${fields.appliedAt}T12:00:00.000Z`);
    if (Number.isNaN(appliedAt.getTime()) || appliedAt.toISOString().slice(0, 10) !== fields.appliedAt) {
      return null;
    }
  }

  return {
    applicationId: fields.applicationId,
    status: fields.status as ApplicationStatus,
    notes: fields.notes.trim() || null,
    appliedAt,
  };
}
