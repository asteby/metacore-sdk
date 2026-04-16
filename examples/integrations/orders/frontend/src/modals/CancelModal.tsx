import React, { useEffect, useState } from "react";

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

export function CancelModal({ open, onOpenChange, action, model, record, endpoint, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => { if (open) { setStep("form"); setReason(""); setErrorMsg(""); } }, [open]);
  if (!open) return null;
  const valid = reason.trim().length > 0;

  async function submit() {
    setStep("submitting");
    try {
      const url = endpoint
        ? `${endpoint}/${record.id}/action/${action.key}`
        : `/data/${model}/me/${record.id}/action/${action.key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
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
        <h2 className="text-lg font-semibold text-red-600">Cancelar pedido</h2>
        <p className="mt-1 text-sm text-zinc-500">Pedido <span className="font-mono">{record.id.slice(0, 8)}</span></p>

        {step === "form" && (
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Motivo</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                className="rounded border px-3 py-2 dark:bg-zinc-800" rows={3}
                placeholder="Ej: Cliente cambió de opinión" />
            </label>
            <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/30">
              Esta acción cancela el pedido y no se puede deshacer.
            </div>
          </div>
        )}

        {step === "submitting" && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
            <p className="text-sm">Cancelando…</p>
          </div>
        )}

        {step === "success" && (
          <div className="mt-4 rounded border bg-green-50 p-3 text-sm dark:bg-green-950/30">
            Pedido cancelado.
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
              <button type="button" onClick={() => close(false)} className="rounded border px-4 py-2 text-sm">Cerrar</button>
              <button type="button" disabled={!valid} onClick={submit}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                Cancelar pedido
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
