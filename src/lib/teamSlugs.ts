export function makeTeamSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function normalizeTeamSlug(slug: string): string {
  return makeTeamSlug(slug);
}

