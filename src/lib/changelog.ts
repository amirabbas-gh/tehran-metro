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
