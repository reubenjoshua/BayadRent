export function statusClass(status: string) {
  if (status === 'PAID') return 'status status-paid';
  if (status === 'OVERDUE') return 'status status-overdue';
  if (status === 'DUE') return 'status status-due';
  if (status === 'PARTIAL') return 'status status-due';
  if (status === 'WAIVED') return 'status status-muted';
  return 'status status-muted';
}
