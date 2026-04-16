import React, { useEffect, useState } from "react";

type Step = "confirm" | "submitting" | "success" | "error";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: { key: string };
  model: string;
  record: { id: string; title?: string; starts_at?: string };
  endpoint?: string;
  onSuccess: () => void;
}

export function ConfirmModal({ open, onOpenChange, action, model, record, endpoint, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("confirm");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => { if (open) { setStep("confirm"); setErrorMsg(""); } }, [open]);
  if (!open) return null;

  async function submit() {
    setStep("submitting");
    try {
      const url = endpoint
        ? `${endpoint}/${record.id}/action/${action.key}`
        : `/data/${model}/me/${record.id}/action/${action.key}`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
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
        <h2 className="text-lg font-semibold">Confirmar cita</h2>
        {record.title && <p className="mt-1 text-sm text-zinc-500">{record.title}</p>}
        {record.starts_at && <p className="text-xs text-zinc-500">Inicio: {record.starts_at}</p>}

        {step === "confirm" && (
          <p className="mt-4 text-sm">¿Confirmas esta cita con el contacto?</p>
        )}

        {step === "submitting" && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
          </div>
        )}

        {step === "success" && (
          <div className="mt-4 rounded border bg-green-50 p-3 text-sm dark:bg-green-950/30">Cita confirmada.</div>
        )}

        {step === "error" && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30">{errorMsg}</div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {step === "confirm" && (
            <>
              <button type="button" onClick={() => close(false)} className="rounded border px-4 py-2 text-sm">Cancelar</button>
              <button type="button" onClick={submit}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">Confirmar</button>
            </>
          )}
          {step === "success" && (
            <button type="button" onClick={() => close(true)} className="rounded bg-green-600 px-4 py-2 text-sm text-white">Cerrar</button>
          )}
          {step === "error" && (
            <>
              <button type="button" onClick={() => close(false)} className="rounded border px-4 py-2 text-sm">Cerrar</button>
              <button type="button" onClick={() => setStep("confirm")} className="rounded border px-4 py-2 text-sm">Reintentar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
