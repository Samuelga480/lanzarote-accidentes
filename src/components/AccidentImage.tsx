/**
 * Imagen de accidente.
 *
 * Si la noticia tiene imageUrl se muestra esa imagen. Si no, se dibuja un
 * marcador SVG determinista generado a partir del identificador: mismo
 * accidente, mismo color. Asi el proyecto no depende de ficheros externos ni
 * de un servicio de imagenes de terceros.
 */

type Props = {
  /** Semilla: id o slug de la noticia. */
  seed: string;
  alt: string;
  imageUrl?: string | null;
  municipality?: string;
  className?: string;
  /** Altura en clases de Tailwind. */
  ratio?: string;
};

/** Hash determinista de 32 bits -> entero. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Paleta sobria, acorde con el tema (grises con un acento rojo occasionally). */
const PALETTES: Array<[string, string]> = [
  ["#2b3036", "#4a5158"],
  ["#3a4048", "#5b636c"],
  ["#242a30", "#3d444b"],
  ["#343a41", "#555d66"],
  ["#1f2429", "#3a4149"],
];

export function AccidentImage({ seed, alt, imageUrl, municipality, className = "", ratio = "aspect-[16/10]" }: Props) {
  const boxClass = `${ratio} w-full overflow-hidden ${className}`;

  if (imageUrl) {
    return (
      <div className={boxClass}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  const h = hash(seed);
  const [from, to] = PALETTES[h % PALETTES.length];
  const angle = h % 90;
  const gid = `g-${h.toString(36)}`;

  return (
    <div className={`${boxClass} bg-ink-soft/10`} role="img" aria-label={alt}>
      <svg viewBox="0 0 320 200" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={gid} gradientTransform={`rotate(${angle} 0.5 0.5)`}>
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <rect width="320" height="200" fill={`url(#${gid})`} />

        {/* Suelo de asfalto en perspectiva */}
        <path d="M0 200 L104 118 L216 118 L320 200 Z" fill="#000" opacity="0.16" />
        <path d="M0 200 L128 136 L192 136 L320 200 Z" fill="#000" opacity="0.13" />

        {/* Marcas viales */}
        <g opacity="0.4" fill="#fff">
          <rect x="150" y="150" width="12" height="30" rx="2" transform="rotate(-18 156 165)" />
          <rect x="176" y="160" width="12" height="30" rx="2" transform="rotate(-18 182 175)" opacity="0.7" />
        </g>

        {/* Icono de aviso */}
        <g transform="translate(160 62)">
          <path
            d="M0 -30 L30 26 H-30 Z"
            fill="#d3232f"
            stroke="#fff"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect x="-2.6" y="-12" width="5.2" height="19" rx="2.6" fill="#fff" />
          <circle cx="0" cy="13" r="3" fill="#fff" />
        </g>

        {municipality ? (
          <text
            x="160"
            y="188"
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
            fontSize="12"
            fontWeight="600"
            fill="#fff"
            opacity="0.82"
          >
            {municipality}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
