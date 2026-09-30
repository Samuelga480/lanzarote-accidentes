/** Genera slugs URL-amigables a partir de un titulo en espanol. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

/** Anade un sufijo numerico si el slug ya existe. */
export async function uniqueSlug(base: string, exists: (s: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base) || "accidente";
  if (!(await exists(root))) return root;

  for (let n = 2; n < 200; n++) {
    const candidate = `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now()}`;
}
