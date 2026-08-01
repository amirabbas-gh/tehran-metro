/** Pull the first `## x.y.z` version heading from CHANGELOG.md. */
export function parseLatestChangelogVersion(raw: string): string | null {
  const match = raw.match(/^##\s+(\d+\.\d+\.\d+)\s*$/m);
  return match?.[1] ?? null;
}

/** Pull bullet lines from the newest "## ..." section of CHANGELOG.md. */
export function parseLatestChangelogEntries(raw: string): string[] {
  const headingRe = /^##\s+.*$/gm;
  const first = headingRe.exec(raw);
  if (!first) return [];
  const start = first.index + first[0].length;
  const end = headingRe.exec(raw)?.index ?? raw.length;
  return raw
    .slice(start, end)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function parseSemverParts(version: string): number[] | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True when `candidate` is a strictly newer semver than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseSemverParts(candidate);
  const b = parseSemverParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}
