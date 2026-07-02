/**
 * Every results share carries a fixed pitch to other championship
 * coordinators - this is a deliberate growth loop, not just a results link.
 */
export function buildResultsShareMessage(championshipName: string, url: string): string {
  return (
    `🏆 ${championshipName} results are live on Zaroda Sports!\n\n` +
    "Sports championship coordinators - manage registration, live results, rankings and medal tables digitally. " +
    "Base-level championships are free, forever. See it in action:\n" +
    url
  );
}
