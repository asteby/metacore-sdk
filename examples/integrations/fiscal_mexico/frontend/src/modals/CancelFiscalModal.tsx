import React, { useEffect, useState } from "react";

const CANCEL_REASONS = [
  { value: "01", label: "01 — Emitido con errores, con relación", requiresUUID: true },
  { value: "02", label: "02 — Emitido con errores, sin relación", requiresUUID: false },
  { value: "03", label: "03 — No se llevó a cabo la operación",  requiresUUID: false },
  { value: "04", label: "04 — Operación nominativa en factura global", requiresUUID: false },
];

type Step = "form" | "cancelling" | "success" | "error";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: { key: string };
  model: string;
  record: { id: string; fiscal_data?: { fiscal_uuid?: string } };
  endpoint?: string;
  onSuccess: () => void;
}

export function CancelFiscalModal({
  open, onOpenChange, action, model, record, endpoint, onSuccess,
}: Props) {
  const [step, setStep] = useState<Step>("form");
  const [reason, setReason] = useState("");
  const [replacement, setReplacement] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (open) { setStep("form"); setReason(""); setReplacement(""); setErrorMsg(""); }
  }, [open]);

  if (!open) return null;

  const requiresUUID = CANCEL_REASONS.find((r) => r.value === reason)?.requiresUUID ?? false;
  const valid = !!reason && (!requiresUUID || replacement.trim().length === 36);

  async function submit() {
    setStep("cancelling");
    try {
      const url = endpoint
        ? `${endpoint}/${record.id}/action/${action.key}`
        : `/data/${model}/me/${record.id}/action/${action.key}`;
      const payload: Record<string, unknown> = { cancel_reason: reason };
      if (requiresUUID) payload.replacement_uuid = replacement.trim();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || json.error || "Error al cancelar");
      setStep("success");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error de conexión");
      setStep("error");
    }
  }

  function close(ok = false) {
    if (ok) onSuccess();
    onOpenChange(false);
  }

  const currentUUID = record.fiscal_data?.fiscal_uuid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-red-600">Cancelación CFDI</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {step === "form"       && "Selecciona el motivo de cancelación"}
          {step === "cancelling" && "Enviando cancelación al SAT…"}
          {step === "success"    && "Documento cancelado correctamente"}
          {step === "error"      && "Error al cancelar el documento"}
        </p>

        {currentUUID && (
          <div className="mt-3 rounded border bg-zinc-50 p-3 text-xs dark:bg-zinc-800">
            UUID actual: <span className="font-mono">{currentUUID}</span>
          </div>
        )}

        {step === "form" && (
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Motivo</span>
              <select
                value={reason}
                onChange={(e) => { setReason(e.target.value); if (e.target.value !== "01") setReplacement(""); }}
                className="rounded border px-3 py-2 dark:bg-zinc-800"
              >
                <option value="">Seleccionar motivo…</option>
                {CANCEL_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            {requiresUUID && (
              <label className="grid gap-1 text-sm">
                <span className="font-medium">UUID sustituto</span>
                <input
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="rounded border px-3 py-2 font-mono dark:bg-zinc-800"
                />
                <span className="text-xs text-zinc-500">Requerido para motivo 01.</span>
              </label>
            )}
            <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/30">
              ⚠ Esta acción cancela el CFDI ante el SAT y no se puede deshacer.
            </div>
          </div>
        )}

        {step === "cancelling" && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
            <p className="text-sm">Procesando cancelación…</p>
          </div>
        )}

        {step === "error" && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30">
            {errorMsg}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {step === "form" && (
            <>
              <button type="button" onClick={() => close(false)} className="rounded border px-4 py-2 text-sm">Cancelar</button>
              <button
                type="button" disabled={!valid} onClick={submit}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Cancelar CFDI
              </button>
            </>
          )}
          {step === "success" && (
            <button type="button" onClick={() => close(true)} className="rounded bg-red-600 px-4 py-2 text-sm text-white">Cerrar</button>
          )}
          {step === "error" && (
            <>
              <button type="button" onClick={() => close(false)} className="rounded border px-4 py-2 text-sm">Cerrar</button>
              <button type="button" onClick={() => setStep("form")} className="rounded border px-4 py-2 text-sm">Reintentar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
