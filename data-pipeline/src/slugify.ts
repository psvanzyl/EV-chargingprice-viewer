// Deterministic slug for gemeente names and a URL-safe id sanitizer.

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/['’.]/g, '') // drop apostrophes (straight + curly) and periods
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics -> hyphen
    .replace(/^-+|-+$/g, '') // trim hyphens
    .replace(/-+/g, '-');
}

// OCPI ids can contain '*', '/', spaces, etc. Make a stable, filesystem/URL-safe id.
export function sanitizeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]+/g, '_');
}
