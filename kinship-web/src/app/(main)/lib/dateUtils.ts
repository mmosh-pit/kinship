const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function calculateTimeForTransactionTable(
  firstDate: Date,
  secondDate: Date,
): string {
  const diff = firstDate.getTime() - secondDate.getTime();

  const days = Math.floor(diff / MS_PER_DAY);
  const hours = Math.floor(diff / 3.6e6);
  const minutes = Math.floor((diff % 3.6e6) / 6e4);
  const seconds = Math.floor((diff % 6e4) / 1000);

  if (days >= 1) {
    return `${days}d`;
  }

  if (hours >= 1) {
    return `${hours}h`;
  }

  if (minutes >= 1) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}
