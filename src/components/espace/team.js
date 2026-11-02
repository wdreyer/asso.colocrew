/**
 * `team` prop expected by the dashboard's `<DayPlans readOnly sessionId team />`, built only from
 * contracts the member may read (their own): no salaries, no colleagues' contracts.
 */
export function teamForSession(contracts, member, sessionId) {
  if (!member?.id) return [];
  return (contracts || [])
    .filter((contract) => contract.memberId === member.id && (contract.sessionId || contract.id) === sessionId)
    .map((contract) => ({
      id: member.id,
      firstName: member.firstName || "",
      name: member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim(),
      role: contract.role || "",
      startDate: contract.workStart || contract.startDate || "",
      endDate: contract.workEnd || contract.endDate || "",
    }));
}
