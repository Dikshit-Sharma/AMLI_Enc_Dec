function repairJson(str) {
  let s = str.replace(/```(?:json)?\n?/g, '').trim();
  const brace = s.match(/\{[\s\S]*\}/);
  if (!brace) return str;
  s = brace[0];

  // "aiSummary": [ text ]  →  "aiSummary": "text"
  s = s.replace(/"aiSummary"\s*:\s*\[([^\]]+)\]/g, (_, inner) => `"aiSummary": "${inner.trim()}"`);

  // "recommendation": text  →  "recommendation": "text"
  s = s.replace(/"recommendation"\s*:\s*(?!")(")?([^"}\s][^"}]*)/g, (_, quoted, val) =>
    quoted ? `"recommendation": "${val}"` : `"recommendation": "${val.trim()}"`
  );

  return s;
}

export function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { void 0; }

  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1].trim()); } catch { void 0; }
  }

  // Try repairing common model errors (unquoted values, array brackets)
  const repaired = repairJson(text);
  if (repaired !== text) {
    try { return JSON.parse(repaired); } catch { void 0; }
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch { void 0; }
  }

  return null;
}
