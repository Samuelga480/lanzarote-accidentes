import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-20 text-center">
      <p className="font-serif text-7xl font-bold text-alert mb-4 leading-none">404</p>
      <h1 className="font-serif text-2xl font-bold mb-3">Página no encontrada</h1>
      <p className="text-ink-soft text-sm max-w-md mx-auto mb-8 leading-relaxed">
        La página que buscas no existe o la noticia ya no está publicada. Si el enlace estaba en un borrador sin
        revisar, es normal que aún no sea accesible.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link href="/" className="btn btn-primary">
          Ir a la portada
        </Link>
        <Link href="/accidentes" className="btn btn-ghost">
          Ver todos los accidentes
        </Link>
        <Link href="/buscar" className="btn btn-ghost">
          Buscar
        </Link>
      </div>
    </div>
  );
}
