import React, { useEffect, useState } from "react";

type Step = "form" | "submitting" | "success" | "error";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: { key: string };
  model: string;
  record: { id: string; name?: string; sku?: string; stock?: number };
  endpoint?: string;
  onSuccess: () => void;
}

export function UpdateStockModal({ open, onOpenChange, action, model, record, endpoint, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [qty, setQty] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (open) { setStep("form"); setQty(String(record.stock ?? "")); setErrorMsg(""); }
  }, [open, record.stock]);
  if (!open) return null;

  const parsed = parseInt(qty, 10);
  const valid = Number.isInteger(parsed) && parsed >= 0;

  async function submit() {
    setStep("submitting");
    try {
      const url = endpoint
        ? `${endpoint}/${record.id}/action/${action.key}`
        : `/data/${model}/me/${record.id}/action/${action.key}`;
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: parsed }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || json.error || "Error");
      setStep("success");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error de conexión"); setStep("error");
    }
  }
  function close(ok = false) { if (ok) onSuccess(); onOpenChange(false); }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Actualizar stock</h2>
        {record.name && (
          <p className="mt-1 text-sm text-zinc-500">
            {record.name}{record.sku && <> · <span className="font-mono">{record.sku}</span></>}
          </p>
        )}

        {step === "form" && (
          <label className="mt-4 grid gap-1 text-sm">
            <span className="font-medium">Nueva cantidad</span>
            <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)}
              className="rounded border px-3 py-2 dark:bg-zinc-800" />
            {record.stock != null && <span className="text-xs text-zinc-500">Stock actual: {record.stock}</span>}
          </label>
        )}

        {step === "submitting" && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {step === "success" && (
          <div className="mt-4 rounded border bg-green-50 p-3 text-sm dark:bg-green-950/30">Stock actualizado.</div>
        )}

        {step === "error" && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30">{errorMsg}</div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {step === "form" && (
            <>
              <button type="button" onClick={() => close(false)} className="rounded border px-4 py-2 text-sm">Cancelar</button>
              <button type="button" disabled={!valid} onClick={submit}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                Guardar
              </button>
            </>
          )}
          {step === "success" && (
            <button type="button" onClick={() => close(true)} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Cerrar</button>
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
