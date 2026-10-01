/**
 * Pipeline de imagenes.
 *
 * El proyecto solo guardaba la URL original de la imagen. Eso significa que la
 * web depende del servidor del medio: si este borra la foto o cambia la URL, la
 * noticia aparece sin imagen. Y no habia ningun WebP ni miniatura, de modo que
 * se servia la imagen original completa, que suele pesar entre 300 KB y 1,5 MB.
 *
 * Aqui la imagen se descarga, se normaliza a WebP y se generan las variantes
 * que el HTML necesita. Se guarda en `public/media`, que Next sirve como
 * estatico y con cache inmutable, porque el nombre del fichero lleva un hash.
 *
 * Si algo falla (404, formato raro, disco lleno), la noticia NO se pierde: se
 * guarda con la URL original y el error registrado en ImageAsset.status.
 */

import sharp from "sharp";
import type { Metadata } from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { safeFetchBinary } from "@/lib/net";
import { imageConfig } from "@/lib/env";
import { log, serializeError, redact } from "@/lib/logger";

/** Anchos que se generan. Todos sirven un proposito real en el HTML. */
const WIDTHS = [400, 800, 1200, 1600];

export type ProcessedImage = {
  ok: boolean;
  /** Ruta servible del hero, p.ej. /media/abc/xyz-1600.webp */
  heroPath: string | null;
  /** Ruta de la imagen para Open Graph. */
  ogPath: string | null;
  /** Mapa de variantes por ancho. */
  variants: Record<string, string> | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  dominantColor: string | null;
  error?: string;
};

/* -------------------------------------------------------------------------- */
/*  Validacion de URL                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Descarta URLs que no son imágenes aunque digan lo contrario. Este filtro no
 * sustituye a la descarga: es solo una primera criba para no gastar ancho de
 * banda en 60 peticiones inútiles por pasada.
 */
export function looksLikeImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const path = u.pathname.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|avif|gif|bmp|tiff?)$/.test(path)) return true;
    // Las CDN de imagenes suelen servir sin extension.
    if (/(\/image\/|\/images\/|photo|thumb|\/media\/)/.test(path)) return true;
    if (/(^|\.)images?\.(arso|cmscloud|core|press|azureedge|cloudfront|fastly)\./i.test(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Procesado                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Descarga y procesa una imagen, dejando todas las variantes en disco.
 *
 * @param accidentId agrupa los ficheros de una misma noticia
 * @param kind HERO | THUMB | OG
 */
export async function processImage(params: {
  accidentId: string;
  url: string;
  alt?: string | null;
  kind?: "HERO" | "THUMB" | "OG";
}): Promise<ProcessedImage> {
  const failure = (error: string): ProcessedImage => ({
    ok: false, heroPath: null, ogPath: null, variants: null,
    width: null, height: null, bytes: null, dominantColor: null, error,
  });

  if (!imageConfig.enabled()) return failure("Pipeline de imagenes deshabilitado.");
  if (!params.url) return failure("No hay URL de imagen.");
  if (!looksLikeImageUrl(params.url)) return failure("La URL no parece una imagen.");

  // En Vercel y en los planes gratuitos de Render el disco es de solo lectura.
  // En ese caso NO se intenta descargar ni convertir: se usa directamente la
  // URL del medio. Descargar la imagen para luego no poder guardaria solo
  // gastaria ancho de banda y CPU en cada pasada.
  if (imageConfig.mode() === "external") {
    log.info("Modo imagen: externa (el disco no admite escritura)", {
      url: redact(params.url),
    });
    return {
      ok: true,
      // Se marca como externa para que el llamante sepa que no hay fichero
      // local y no intente construir una ruta /media/... que no existe.
      heroPath: params.url,
      ogPath: params.url,
      variants: null,
      width: null,
      height: null,
      bytes: null,
      dominantColor: null,
    };
  }

  // --- 1. Descarga ---
  const download = await safeFetchBinary(params.url, {
    timeoutMs: imageConfig.timeoutMs(),
    maxBytes: 12 * 1024 * 1024,
  });

  if (!download.ok || !download.bytes) {
    const error = download.error ?? "Descarga fallida";
    await recordAsset(params, { status: "FAILED", error, originalUrl: params.url });
    log.warn("No se pudo descargar la imagen", {
      accidentId: params.accidentId, url: redact(params.url), error,
    });
    return failure(error);
  }

  const buffer = download.bytes;
  if (buffer.length < 1024) {
    const error = "La imagen es demasiado pequena";
    await recordAsset(params, { status: "SKIPPED", error, originalUrl: params.url });
    return failure(error);
  }

  // --- 2. Lectura de metadatos ---
  // Metadata, no sharp.Metadata: el namespace `sharp` no se puede usar como tipo
// cuando el import es por defecto.
let meta: Metadata;
  try {
    meta = await sharp(buffer, { failOn: "none" }).metadata();
  } catch (err) {
    const error = "El fichero no es una imagen valida";
    await recordAsset(params, { status: "FAILED", error, originalUrl: params.url });
    log.debug("No se pudo leer la imagen", { ...serializeError(err) });
    return failure(error);
  }

  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;

  if (!srcWidth || !srcHeight) return failure("La imagen no tiene dimensiones.");

  // Un icono de 16x16 o un banner de 1000x50 no sirve de foto principal.
  const minDim = imageConfig.minDimension();
  if (Math.min(srcWidth, srcHeight) < minDim) {
    const error = `Dimensiones insuficientes (${srcWidth}x${srcHeight})`;
    await recordAsset(params, { status: "SKIPPED", error, originalUrl: params.url });
    return failure(error);
  }

  // El formato original puede no ser el que dice la extension. Se normaliza a
  // WebP siempre, que es lo que se sirve.
  // Los formatos con canal alfa y los animados se quedan como estan; no tiene
  // sentido convertirlos a WebP estatico sin perder animacion.
  const isAnimated = Boolean(meta.pages && meta.pages > 1);

  // --- 3. Color dominante, para el fondo mientras carga ---
  let dominantColor: string | null = null;
  try {
    // `stats()` devuelve los canales dominantes ya calculados. Con
    // `resize(1,1).raw()` habria que leer los bytes a mano y no es portable
    // entre versiones de sharp.
    const stats = await sharp(buffer, { failOn: "none" }).stats();
    // `stats.dominant` es un objeto { r, g, b }, no un array: no se puede
    // desestructurar con corchetes.
    const { r, g, b } = stats.dominant;
    dominantColor = `#${[r, g, b]
      .map((n) => Math.round(n).toString(16).padStart(2, "0"))
      .join("")}`;
  } catch {
    // El color dominante es un adorno (el fondo mientras carga la imagen): si
    // falla, se sigue sin el.
    dominantColor = null;
  }

  // --- 4. Escritura de variantes ---
  const dir = path.join(process.cwd(), imageConfig.dir(), params.accidentId);
  const baseDir = path.join(process.cwd(), "public");
  const relativeDir = path
    .relative(baseDir, dir)
    .replace(/\\/g, "/");

  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    const error = `No se pudo crear el directorio: ${err instanceof Error ? err.message : String(err)}`;
    await recordAsset(params, { status: "FAILED", error, originalUrl: params.url });
    return failure(error);
  }

  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  const quality = imageConfig.quality();
  const maxWidth = imageConfig.maxWidth();

  const variants: Record<string, string> = {};
  let heroPath: string | null = null;
  let heroWidth = 0;
  let heroBytes: number | null = null;

  // Solo se generan anchos que no excedan el original: estirar una imagen de
  // 800 px a 1600 produce un archivo mas grande y mas feo.
  const targetWidths = WIDTHS.filter((w) => w <= srcWidth);
  if (targetWidths.length === 0) targetWidths.push(Math.min(srcWidth, maxWidth));

  for (const width of targetWidths) {
    const filename = `${hash}-${width}.webp`;
    const outputPath = path.join(dir, filename);

    try {
      const pipeline = sharp(buffer, { failOn: "none" }).rotate(); // respeta EXIF
      let output: Buffer;

      if (isAnimated) {
        output = await pipeline.toBuffer();
      } else {
        output = await pipeline
          .resize({ width, withoutEnlargement: true })
          .webp({ quality, effort: 4 })
          .toBuffer();
      }

      await writeFile(outputPath, output);
      variants[String(width)] = `/${relativeDir}/${filename}`;

      // El hero es la variante de mayor ancho generada: `targetWidths` esta
      // ordenado de menor a mayor, asi que basta con comprobar si esta es la
      // ultima que se ha escrito.
      if (!heroPath || width >= heroWidth) {
        heroPath = `/${relativeDir}/${filename}`;
        heroWidth = width;
        heroBytes = output.length;
      }
    } catch (err) {
      log.warn("No se pudo escribir una variante", {
        accidentId: params.accidentId, width, ...serializeError(err),
      });
    }
  }

  if (!heroPath) {
    const error = "No se pudo escribir ninguna variante en disco";
    await recordAsset(params, { status: "FAILED", error, originalUrl: params.url });
    return failure(error);
  }

  const ogPath = variants["1200"] ?? variants["800"] ?? heroPath;

  await recordAsset(params, {
    status: "PROCESSED",
    originalUrl: params.url,
    localPath: heroPath,
    ogPath,
    width: srcWidth,
    height: srcHeight,
    bytes: heroBytes,
    dominantColor,
    alt: params.alt ?? undefined,
    variants: JSON.stringify(variants),
  });

  return {
    ok: true, heroPath, ogPath, variants,
    width: srcWidth, height: srcHeight, bytes: heroBytes,
    dominantColor,
  };
}

/* -------------------------------------------------------------------------- */
/*  Registro en base de datos                                                 */
/* -------------------------------------------------------------------------- */

async function recordAsset(
  params: { accidentId: string; url: string; alt?: string | null; kind?: "HERO" | "THUMB" | "OG" },
  data: {
    status: string; originalUrl: string; error?: string;
    localPath?: string; ogPath?: string; width?: number; height?: number;
    // `| null` porque estos campos llegan a null cuando el procesado no llego a
    // terminar, y el tipo exacto no los admite si se declaran sin null.
    bytes?: number | null; dominantColor?: string | null;
    alt?: string; variants?: string;
  },
): Promise<void> {
  try {
    await prisma.imageAsset.create({
      data: {
        accidentId: params.accidentId,
        kind: params.kind ?? "HERO",
        originalUrl: data.originalUrl,
        status: data.status,
        error: data.error ?? null,
        localPath: data.localPath ?? null,
        ogPath: data.ogPath ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        bytes: data.bytes ?? null,
        dominantColor: data.dominantColor ?? null,
        alt: data.alt ?? params.alt ?? null,
        variants: data.variants ?? null,
      },
    });
  } catch (err) {
    // Un fallo al registrar no debe impedir que la noticia se cree.
    log.warn("No se pudo registrar ImageAsset", {
      accidentId: params.accidentId, ...serializeError(err),
    });
  }
}

/**
 * Reconstruye el mapa de variantes desde lo guardado en base de datos.
 * Lo usa el componente de imagen, que no debe asumir el sistema de ficheros.
 */
export function variantsFromRow(variants: string | null): Record<string, string> {
  if (!variants) return {};
  try {
    const parsed: unknown = JSON.parse(variants);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}