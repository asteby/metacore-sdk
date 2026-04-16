import React, { useEffect, useState } from "react";

const CARRIERS = [
  { value: "DHL", label: "DHL" },
  { value: "FedEx", label: "FedEx" },
  { value: "UPS", label: "UPS" },
  { value: "Estafeta", label: "Estafeta" },
  { value: "other", label: "Otro" },
];

type Step = "form" | "submitting" | "success" | "error";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: { key: string };
  model: string;
  record: { id: string };
  endpoint?: string;
  onSuccess: () => void;
}

export function FulfillModal({ open, onOpenChange, action, model, record, endpoint, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("DHL");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (open) { setStep("form"); setTracking(""); setCarrier("DHL"); setNotes(""); setErrorMsg(""); }
  }, [open]);

  if (!open) return null;
  const valid = tracking.trim().length > 0 && carrier.length > 0;

  async function submit() {
    setStep("submitting");
    try {
      const url = endpoint
        ? `${endpoint}/${record.id}/action/${action.key}`
        : `/data/${model}/me/${record.id}/action/${action.key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracking_number: tracking.trim(), carrier, notes }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || json.error || "Error");
      setStep("success");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error de conexión");
      setStep("error");
    }
  }

  function close(ok = false) { if (ok) onSuccess(); onOpenChange(false); }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Cumplir pedido</h2>
        <p className="mt-1 text-sm text-zinc-500">Pedido <span className="font-mono">{record.id.slice(0, 8)}</span></p>

        {step === "form" && (
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Número de seguimiento</span>
              <input value={tracking} onChange={(e) => setTracking(e.target.value)}
                className="rounded border px-3 py-2 dark:bg-zinc-800" placeholder="1Z999AA1..." />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Empresa de envío</span>
              <select value={carrier} onChange={(e) => setCarrier(e.target.value)}
                className="rounded border px-3 py-2 dark:bg-zinc-800">
                {CARRIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Notas</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                className="rounded border px-3 py-2 dark:bg-zinc-800" rows={2} />
            </label>
          </div>
        )}

        {step === "submitting" && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
            <p className="text-sm">Procesando…</p>
          </div>
        )}

        {step === "success" && (
          <div className="mt-4 rounded border bg-green-50 p-3 text-sm dark:bg-green-950/30">
            Pedido marcado como cumplido.
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
              <button type="button" disabled={!valid} onClick={submit}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                Confirmar cumplimiento
              </button>
            </>
          )}
          {step === "success" && (
            <button type="button" onClick={() => close(true)} className="rounded bg-green-600 px-4 py-2 text-sm text-white">Cerrar</button>
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
