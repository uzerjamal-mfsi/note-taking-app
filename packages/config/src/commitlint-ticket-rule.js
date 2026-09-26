const TICKET_PATTERN = /AB-\d+$/;

/**
 * Commitlint rule: the commit subject must end with an `AB-<number>` ticket
 * reference, e.g. "feat(api): add note repository AB-1002".
 */
export function ticketReferenceRule(parsed) {
  const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
  const valid = TICKET_PATTERN.test(subject);
  return [valid, "commit subject must end with a ticket reference like AB-1234"];
}

export const ticketReferencePlugin = {
  rules: {
    "ticket-reference": (parsed) => ticketReferenceRule(parsed),
  },
};
