// Parse an inline-CSS string ("padding:8px;color:#fff") into a React style
// object, so the original prototype's styling can be reused verbatim. Cached.
const cache = new Map();

export function css(str) {
  if (!str) return undefined;
  if (cache.has(str)) return cache.get(str);
  const obj = {};
  for (const decl of str.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) continue;
    const key = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    obj[key] = val;
  }
  cache.set(str, obj);
  return obj;
}
