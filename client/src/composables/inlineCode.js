export function parseInlineCodeSegments(text) {
  const value = String(text || "");
  const segments = [];
  const pattern = /`([^`]+)`/g;
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) segments.push({ type: "text", value: value.slice(lastIndex, start) });
    segments.push({ type: "code", value: match[1] });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < value.length) segments.push({ type: "text", value: value.slice(lastIndex) });
  return segments.length ? segments : [{ type: "text", value }];
}
