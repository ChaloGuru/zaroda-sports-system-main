/**
 * Maps each round number (1-indexed) of a generated schedule to a calendar
 * day within the championship's date range, cycling if there are more
 * rounds than days. Returns null for every round when the championship is
 * single-day (start === end) - there's nothing to disambiguate.
 */
export function distributeMatchDates(startDate: Date, endDate: Date, roundCount: number): Array<Date | null> {
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (totalDays <= 1) return Array.from({ length: roundCount }, () => null);

  return Array.from({ length: roundCount }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (i % totalDays));
    return date;
  });
}

/**
 * Same as distributeMatchDates, but counts backward from the championship's
 * final day - for knockout-stage rounds, which are played after pool play
 * wraps up and so belong near the end of the championship, not day one.
 */
export function distributeMatchDatesFromEnd(startDate: Date, endDate: Date, roundCount: number): Array<Date | null> {
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (totalDays <= 1) return Array.from({ length: roundCount }, () => null);

  return Array.from({ length: roundCount }, (_, i) => {
    const daysBeforeEnd = Math.min(roundCount - 1 - i, totalDays - 1);
    const date = new Date(endDate);
    date.setDate(date.getDate() - daysBeforeEnd);
    return date;
  });
}
