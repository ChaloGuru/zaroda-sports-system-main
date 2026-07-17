/**
 * Team promotion (see app/api/tournament-teams/promote) renames a promoted
 * team "{Origin Zone} - {Team Name}" so its lineage is visible at the new
 * level - except when the origin team's own name already mentions the zone
 * (e.g. a zone-level team already named "AWENDO DAGO JS"), in which case the
 * promoted name is carried over unchanged, with no " - " separator at all.
 * Either way, that promoted entry should count toward its parent zone/org on
 * any cross-game leaderboard (organization rankings, medal table) - never
 * appear as its own row.
 *
 * Because not every promoted name has a delimiter to split on, resolution
 * works by prefix-matching against the *other* names present in the same
 * dataset: if one name is a whole-word prefix of another (e.g. "AWENDO" is
 * a prefix of both "AWENDO DAGO JS" and "AWENDO - RINYA JS"), the longer
 * name is folded into the shorter one. Names with no shorter match in the
 * dataset are left as-is.
 */
export function buildCanonicalNameMap(rawNames: string[]): Map<string, string> {
  const names = Array.from(new Set(rawNames.map((n) => n.trim()).filter(Boolean)));
  // Shortest names first - they're the most likely "root" zone/org names.
  const byLength = [...names].sort((a, b) => a.length - b.length);

  const canonical = new Map<string, string>();
  for (const name of names) {
    let root = name;
    for (const candidate of byLength) {
      if (candidate.length >= name.length) break;
      if (!name.toLowerCase().startsWith(candidate.toLowerCase())) continue;
      const nextChar = name[candidate.length];
      if (nextChar === " " || nextChar === "-") {
        root = candidate;
        break;
      }
    }
    canonical.set(name, root);
  }
  return canonical;
}
