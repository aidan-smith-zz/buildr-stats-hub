function normalizeSlugInput(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function makeTeamSlug(name: string): string {
  return normalizeSlugInput(name)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function normalizeTeamSlug(slug: string): string {
  return makeTeamSlug(slug);
}

