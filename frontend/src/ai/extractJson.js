export function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { void 0; }

  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1].trim()); } catch { void 0; }
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch { void 0; }
  }

  return null;
}
