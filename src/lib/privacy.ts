/**
 * Proteccion de datos personales.
 *
 * El proyecto NO publica matriculas, telefonos, documentos de identidad ni
 * direcciones particulares. Esta funcion se aplica ANTES de guardar cualquier
 * noticia (manual o generada por IA), de modo que esos datos nunca llegan a la
 * base de datos.
 *
 * No sustituye la revision humana: solo elimina lo que se puede detectar de
 * forma fiable y devuelve avisos para lo que un editor debe comprobar.
 */

export type Finding = {
  type: "MATRICULA" | "TELEFONO" | "DOCUMENTO" | "EMAIL" | "DIRECCION";
  original: string;
  replacement: string;
};

const RULES: Array<{ type: Finding["type"]; re: RegExp; replacement: string }> = [
  // Matriculas nuevas (1234 ABC) y antiguas (GC-1234-A, GC 1234 A)
  {
    type: "MATRICULA",
    re: /\b\d{4}\s?[\s-]?[A-Z]{3}\b/g,
    replacement: "[matricula omitida]",
  },
  {
    type: "MATRICULA",
    re: /\b[A-Z]{2}\s?-\s?\d{4}\s?-\s?[A-Z]{1,2}\b/g,
    replacement: "[matricula omitida]",
  },
  {
    type: "MATRICULA",
    re: /\b[A-Z]{2}\s?\d{4}\s?[A-Z]{1,2}\b/g,
    replacement: "[matricula omitida]",
  },
  // Telefonos de Espana con o sin prefijo internacional
  {
    type: "TELEFONO",
    re: /\+?34[\s-]?[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g,
    replacement: "[telefono omitido]",
  },
  {
    type: "TELEFONO",
    re: /\b[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g,
    replacement: "[telefono omitido]",
  },
  // DNI (8 digitos + letra) y NIE (X/Y/Z + 7 digitos + letra)
  {
    type: "DOCUMENTO",
    re: /\b\d{8}\s?-[A-HJ-NP-TV-Z]\b/g,
    replacement: "[documento omitido]",
  },
  {
    type: "DOCUMENTO",
    re: /\b[XYZ]\d{7}\s?-[A-HJ-NP-TV-Z]\b/g,
    replacement: "[documento omitido]",
  },
  {
    type: "EMAIL",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[correo omitido]",
  },
];

export type SanitizeResult<T> = {
  data: T;
  findings: Finding[];
};

/** Limpia un texto suelto y registra lo que ha encontrado. */
export function sanitizeText(input: string): SanitizeResult<string> {
  let out = input;
  const findings: Finding[] = [];

  for (const rule of RULES) {
    out = out.replace(rule.re, (match) => {
      findings.push({
        type: rule.type,
        original: match,
        replacement: rule.replacement,
      });
      return rule.replacement;
    });
  }

  return { data: out, findings };
}

/**
 * Limpia un registro completo de noticia.
 * Devuelve el objeto saneado y la lista de hallazgos, que se guarda en las
 * notas de revision para que el editor vea que se elimino algo.
 */
export function sanitizeAccident<T extends { title: string; summary: string; body: string; locationDescription?: string | null }>(
  acc: T,
): SanitizeResult<T> {
  const findings: Finding[] = [];
  const clean = (v: string) => {
    const r = sanitizeText(v);
    findings.push(...r.findings);
    return r.data;
  };

  const data = {
    ...acc,
    title: clean(acc.title),
    summary: clean(acc.summary),
    body: clean(acc.body),
    locationDescription: acc.locationDescription ? clean(acc.locationDescription) : acc.locationDescription,
  };

  return { data, findings };
}

/** Resumen legible de los hallazgos, para las notas de revision. */
export function summarizeFindings(findings: Finding[]): string | null {
  if (findings.length === 0) return null;
  const byType = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.type] = (acc[f.type] ?? 0) + 1;
    return acc;
  }, {});
  const parts = Object.entries(byType).map(([t, n]) => `${t.toLowerCase()}: ${n}`);
  return `Datos personales eliminados automaticamente (${parts.join(", ")}).`;
}
