import React, { useState, useEffect } from "react";

// SAT catalogs — mirror the options in manifest.actions[].fields.
const CFDI_USAGE = [
  { value: "G01", label: "G01 — Adquisición de mercancías" },
  { value: "G03", label: "G03 — Gastos en general" },
  { value: "I01", label: "I01 — Construcciones" },
  { value: "P01", label: "P01 — Por definir" },
  { value: "S01", label: "S01 — Sin efectos fiscales" },
];
const PAYMENT_FORMS = [
  { value: "01", label: "01 — Efectivo" },
  { value: "03", label: "03 — Transferencia electrónica" },
  { value: "04", label: "04 — Tarjeta de crédito" },
  { value: "28", label: "28 — Tarjeta de débito" },
  { value: "99", label: "99 — Por definir" },
];
const PAYMENT_METHODS = [
  { value: "PUE", label: "PUE — Pago en una exhibición" },
  { value: "PPD", label: "PPD — Pago diferido" },
];

type Step = "form" | "stamping" | "success" | "error";

// Props are the host contract used across metacore — the ActionModalProps
// shape from @asteby/metacore-sdk. We inline the type to keep the bundle typecheck
// self-contained; the SDK export is compatible.
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: { key: string; label?: string };
  model: string;
  record: { id: string; total?: number; currency?: string; fiscal_data?: Record<string, unknown> };
  endpoint?: string;
  onSuccess: () => void;
}

export function StampFiscalModal({
  open, onOpenChange, action, model, record, endpoint, onSuccess,
}: Props) {
  const [step, setStep] = useState<Step>("form");
  const [cfdiUsage, setCfdiUsage] = useState("G03");
  const [paymentForm, setPaymentForm] = useState("03");
  const [paymentMethod, setPaymentMethod] = useState("PUE");
  const [testMode, setTestMode] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (open) {
      setStep("form");
      setResult(null);
      setErrorMsg("");
    }
  }, [open]);

  if (!open) return null;

  const valid = !!(cfdiUsage && paymentForm && paymentMethod);

  async function submit() {
    setStep("stamping");
    try {
      const url = endpoint
        ? `${endpoint}/${record.id}/action/${action.key}`
        : `/data/${model}/me/${record.id}/action/${action.key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cfdi_usage: cfdiUsage,
          payment_form: paymentForm,
          payment_method: paymentMethod,
          test_mode: testMode,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || json.error || "Error al timbrar");
      setResult(json);
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

  const total = record.total != null
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: record.currency || "MXN" }).format(record.total)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Timbrado CFDI</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {step === "form"     && "Configura los datos fiscales para el timbrado"}
          {step === "stamping" && "Enviando al SAT…"}
          {step === "success"  && "Documento timbrado correctamente"}
          {step === "error"    && "Error al timbrar el documento"}
        </p>

        {total && (
          <div className="mt-3 rounded border bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
            Factura <span className="font-mono">{record.id.slice(0, 8)}</span> · Total <b>{total}</b>
          </div>
        )}

        {step === "form" && (
          <div className="mt-4 grid gap-3">
            <Field label="Uso CFDI">
              <Select value={cfdiUsage} onChange={setCfdiUsage} options={CFDI_USAGE} />
            </Field>
            <Field label="Forma de pago">
              <Select value={paymentForm} onChange={setPaymentForm} options={PAYMENT_FORMS} />
            </Field>
            <Field label="Método de pago">
              <Select value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHODS} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
              Modo sandbox (no genera CFDI real)
            </label>
          </div>
        )}

        {step === "stamping" && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
            <p className="text-sm">Conectando con el PAC…</p>
          </div>
        )}

        {step === "success" && result && (
          <div className="mt-4 rounded border bg-green-50 p-3 text-sm dark:bg-green-950/30">
            <div><b>UUID Fiscal:</b> <span className="font-mono text-xs">{result.fiscal_uuid}</span></div>
            <div><b>Ambiente:</b> {result.environment}</div>
            {result.pdf_url && <a href={result.pdf_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-green-700 underline">Descargar PDF</a>}
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
              <Btn onClick={() => close(false)}>Cancelar</Btn>
              <Btn variant="primary" disabled={!valid} onClick={submit}>Timbrar</Btn>
            </>
          )}
          {step === "success" && <Btn variant="primary" onClick={() => close(true)}>Cerrar</Btn>}
          {step === "error" && (
            <>
              <Btn onClick={() => close(false)}>Cerrar</Btn>
              <Btn onClick={() => setStep("form")}>Reintentar</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── local UI primitives (keep the bundle free of host-specific design deps) ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border px-3 py-2 text-sm dark:bg-zinc-800"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Btn({
  children, onClick, disabled, variant,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary";
}) {
  const base = "rounded px-4 py-2 text-sm font-medium transition";
  const style = variant === "primary"
    ? "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
    : "border hover:bg-zinc-100 dark:hover:bg-zinc-800";
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} ${style}`}>
      {children}
    </button>
  );
}
