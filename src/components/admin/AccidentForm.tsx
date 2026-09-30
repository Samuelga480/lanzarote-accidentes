"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MUNICIPALITIES, STATUS_LABEL, VEHICLE_LIST } from "@/lib/constants";
import { initialState, type ActionState } from "@/app/admin/action-state";

export type SourceDraft = { outlet: string; url: string; excerpt: string };

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Si viene informado, el formulario edita; si no, crea. */
  accidentId?: string;
  defaults?: {
    title: string;
    summary: string;
    body: string;
    municipalitySlug: string;
    vehicleType: string;
    severity: string;
    occurredAt: string; // "YYYY-MM-DDTHH:mm" ya en hora de Canarias
    fatalities: number;
    injuries: number;
    locationDescription: string;
    imageUrl: string;
    imageAlt: string;
    status: string;
    reviewNotes: string;
  };
  sources?: SourceDraft[];
  /** Un borrador de IA no puede marcarse como publicado desde el propio formulario. */
  lockStatus?: boolean;
  cancelHref?: string;
};

function fieldError(state: ActionState, field: string): string | null {
  return state.fieldErrors?.[field]?.[0] ?? null;
}

export function AccidentForm({
  action,
  accidentId,
  defaults,
  sources: initialSources = [],
  lockStatus = false,
  cancelHref = "/admin",
}: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    initialState(),
  );
  const [sources, setSources] = useState<SourceDraft[]>(
    initialSources.length > 0 ? initialSources : [{ outlet: "", url: "", excerpt: "" }],
  );

  const d = defaults;

  const addSource = () =>
    setSources((s) => [...s, { outlet: "", url: "", excerpt: "" }]);

  const removeSource = (i: number) =>
    setSources((s) => (s.length === 1 ? s : s.filter((_, idx) => idx !== i)));

  const updateSource = (i: number, key: keyof SourceDraft, value: string) =>
    setSources((s) => s.map((src, idx) => (idx === i ? { ...src, [key]: value } : src)));

  // Solo se envían las filas con medio y URL: las vacias se descartan.
  const sourcesJson = JSON.stringify(
    sources.filter((s) => s.outlet.trim() !== "" && s.url.trim() !== ""),
  );

  const inputCls = (field: string) =>
    `field ${fieldError(state, field) ? "border-alert" : ""}`;

  return (
    <form action={formAction} className="space-y-6">
      {accidentId ? <input type="hidden" name="id" value={accidentId} /> : null}
      <input type="hidden" name="sourcesJson" value={sourcesJson} />

      {state.message ? (
        <p
          role="alert"
          className={`text-sm rounded-sm px-3 py-2 border ${
            state.ok
              ? "text-ok bg-ok-soft border-ok/30"
              : "text-alert bg-alert-soft border-alert/30"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      {/* ------------------------- Contenido ------------------------- */}
      <fieldset className="card p-5">
        <legend className="px-2 text-sm font-bold uppercase tracking-wider text-ink-soft">
          Contenido
        </legend>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="title">Titular</label>
            <input
              id="title"
              name="title"
              className={inputCls("title")}
              defaultValue={d?.title ?? ""}
              required
              maxLength={200}
              placeholder="Colisión frontal en la carretera de…"
            />
            {fieldError(state, "title") ? (
              <p className="text-xs text-alert mt-1">{fieldError(state, "title")}</p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="summary">Resumen (entradilla)</label>
            <textarea
              id="summary"
              name="summary"
              className={inputCls("summary")}
              defaultValue={d?.summary ?? ""}
              required
              rows={3}
              maxLength={500}
              placeholder="Dos o tres frases con lo esencial: qué pasó, dónde y cómo está la situación."
            />
            {fieldError(state, "summary") ? (
              <p className="text-xs text-alert mt-1">{fieldError(state, "summary")}</p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="body">Cuerpo de la noticia</label>
            <textarea
              id="body"
              name="body"
              className={`${inputCls("body")} font-serif leading-relaxed`}
              defaultValue={d?.body ?? ""}
              required
              rows={14}
              placeholder={"Un párrafo por idea.\n\nSepara los párrafos con una línea en blanco."}
            />
            <p className="text-[11px] text-ink-mute mt-1">
              Separa los párrafos con una línea en blanco. No incluyas matrículas, teléfonos ni nombres: el
              sistema los elimina igualmente, pero es mejor no escribirlos.
            </p>
            {fieldError(state, "body") ? (
              <p className="text-xs text-alert mt-1">{fieldError(state, "body")}</p>
            ) : null}
          </div>
        </div>
      </fieldset>

      {/* ------------------------- Datos ------------------------- */}
      <fieldset className="card p-5">
        <legend className="px-2 text-sm font-bold uppercase tracking-wider text-ink-soft">
          Datos del accidente
        </legend>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="municipalitySlug">Municipio</label>
            <select
              id="municipalitySlug"
              name="municipalitySlug"
              className={inputCls("municipalitySlug")}
              defaultValue={d?.municipalitySlug ?? MUNICIPALITIES[0].slug}
              required
            >
              {MUNICIPALITIES.map((m) => (
                <option key={m.slug} value={m.slug}>{m.name}</option>
              ))}
            </select>
            {fieldError(state, "municipalitySlug") ? (
              <p className="text-xs text-alert mt-1">{fieldError(state, "municipalitySlug")}</p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="vehicleType">Tipo de vehículo</label>
            <select
              id="vehicleType"
              name="vehicleType"
              className={inputCls("vehicleType")}
              defaultValue={d?.vehicleType ?? "COCHE"}
              required
            >
              {VEHICLE_LIST.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="severity">Gravedad</label>
            <select
              id="severity"
              name="severity"
              className={inputCls("severity")}
              defaultValue={d?.severity ?? "MODERADO"}
              required
            >
              <option value="LEVE">Leve</option>
              <option value="MODERADO">Moderado</option>
              <option value="GRAVE">Grave</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="occurredAt">Fecha y hora (hora de Canarias)</label>
            <input
              id="occurredAt"
              name="occurredAt"
              type="datetime-local"
              className={inputCls("occurredAt")}
              defaultValue={d?.occurredAt ?? ""}
              required
            />
            {fieldError(state, "occurredAt") ? (
              <p className="text-xs text-alert mt-1">{fieldError(state, "occurredAt")}</p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="fatalities">Fallecidos</label>
            <input
              id="fatalities"
              name="fatalities"
              type="number"
              min={0}
              max={50}
              className={inputCls("fatalities")}
              defaultValue={d?.fatalities ?? 0}
            />
          </div>

          <div>
            <label className="label" htmlFor="injuries">Heridos</label>
            <input
              id="injuries"
              name="injuries"
              type="number"
              min={0}
              max={200}
              className={inputCls("injuries")}
              defaultValue={d?.injuries ?? 0}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label" htmlFor="locationDescription">
              Zona (descripción, no dirección exacta)
            </label>
            <input
              id="locationDescription"
              name="locationDescription"
              className={inputCls("locationDescription")}
              defaultValue={d?.locationDescription ?? ""}
              maxLength={200}
              placeholder="Carretera de Playa Blanca, cruce de Las Dunes"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="imageUrl">URL de la imagen (opcional)</label>
            <input
              id="imageUrl"
              name="imageUrl"
              type="url"
              className={inputCls("imageUrl")}
              defaultValue={d?.imageUrl ?? ""}
              placeholder="https://…"
            />
            {fieldError(state, "imageUrl") ? (
              <p className="text-xs text-alert mt-1">{fieldError(state, "imageUrl")}</p>
            ) : null}
            <p className="text-[11px] text-ink-mute mt-1">
              Si la dejas vacía se dibuja una ilustración de marcador.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="imageAlt">Texto alternativo</label>
            <input
              id="imageAlt"
              name="imageAlt"
              className={inputCls("imageAlt")}
              defaultValue={d?.imageAlt ?? ""}
              maxLength={200}
            />
          </div>
        </div>
      </fieldset>

      {/* ------------------------- Fuentes ------------------------- */}
      <fieldset className="card p-5">
        <legend className="px-2 text-sm font-bold uppercase tracking-wider text-ink-soft">
          Fuentes
        </legend>
        <p className="text-xs text-ink-mute mb-4">
          Registra de dónde procede la información. Se publica junto a la noticia para que cualquier persona
          pueda contrastarla.
        </p>

        <div className="space-y-4">
          {sources.map((s, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] items-start p-3 bg-canvas rounded-sm">
              <div>
                <label className="label" htmlFor={`src-outlet-${i}`}>Medio</label>
                <input
                  id={`src-outlet-${i}`}
                  className="field"
                  value={s.outlet}
                  onChange={(e) => updateSource(i, "outlet", e.target.value)}
                  placeholder="Cabildo de Lanzarote"
                />
              </div>
              <div>
                <label className="label" htmlFor={`src-url-${i}`}>URL</label>
                <input
                  id={`src-url-${i}`}
                  type="url"
                  className="field"
                  value={s.url}
                  onChange={(e) => updateSource(i, "url", e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <button
                type="button"
                onClick={() => removeSource(i)}
                className="btn btn-danger mt-6"
                aria-label="Eliminar fuente"
              >
                ×
              </button>
              <div className="sm:col-span-3">
                <label className="label" htmlFor={`src-excerpt-${i}`}>
                  Cita o resumen de la fuente (opcional)
                </label>
                <textarea
                  id={`src-excerpt-${i}`}
                  className="field"
                  rows={2}
                  value={s.excerpt}
                  onChange={(e) => updateSource(i, "excerpt", e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={addSource} className="btn btn-ghost mt-3">
          + Añadir fuente
        </button>
      </fieldset>

      {/* ------------------------- Estado y envío ------------------------- */}
      <fieldset className="card p-5">
        <legend className="px-2 text-sm font-bold uppercase tracking-wider text-ink-soft">
          Estado editorial
        </legend>

        {lockStatus ? (
          <>
            <input type="hidden" name="status" value="PENDING_REVIEW" />
            <p className="text-sm text-warn bg-warn-soft border border-warn/30 rounded-sm px-3 py-2">
              Este borrador lo generó una IA. Mientras lo revises se mantiene como{" "}
              <strong>pendiente de revisión</strong>. Usa el botón «Aprobar y publicar» de la cabecera cuando
              hayas verificado las fuentes.
            </p>
          </>
        ) : (
          <div>
            <label className="label" htmlFor="status">Estado</label>
            <select id="status" name="status" className="field" defaultValue={d?.status ?? "PENDING_REVIEW"}>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4">
          <label className="label" htmlFor="reviewNotes">Notas de revisión</label>
          <textarea
            id="reviewNotes"
            name="reviewNotes"
            className="field"
            rows={3}
            defaultValue={d?.reviewNotes ?? ""}
            maxLength={2000}
            placeholder="Qué has verificado, qué dudas quedan, por qué se ha descartado…"
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : accidentId ? "Guardar cambios" : "Crear noticia"}
        </button>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
