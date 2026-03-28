// Remove objects (and array entries) whose string values contain `filter`, recursively.
// Nested objects are cleaned first so only offending subtrees or objects with leaking
// direct string fields are removed.
export const filterObject = (obj: unknown, filter: string): unknown => {
  if (!filter) return obj;

  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string' && obj.includes(filter)) return undefined;
    return obj;
  }

  if (Array.isArray(obj)) {
    const out: unknown[] = [];
    for (const item of obj) {
      const cleaned = filterObject(item, filter);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }

  const src = obj as Record<string, unknown>;
  const originalKeys = Object.keys(src);
  const result: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(src)) {
    const cleaned = filterObject(v, filter);
    if (cleaned !== undefined) result[k] = cleaned;
  }

  for (const v of Object.values(result)) {
    if (typeof v === 'string' && v.includes(filter)) return undefined;
  }

  if (originalKeys.length > 0 && Object.keys(result).length === 0) return undefined;

  return result;
};
