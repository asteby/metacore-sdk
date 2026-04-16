import React from "react";

// Host contract: a registered modal receives the action payload and a close
// callback. The payload's shape follows manifest.actions[].fields.
export function StampSATModal(props: {
  payload: { record_id: string; rfc_receptor?: string; uso_cfdi?: string };
  close: (result?: { rfc_receptor: string; uso_cfdi: string }) => void;
}) {
  const [rfc, setRfc] = React.useState(props.payload.rfc_receptor ?? "");
  const [uso, setUso] = React.useState(props.payload.uso_cfdi ?? "G03");
  const valid = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc);

  return (
    <div className="grid gap-3 p-4">
      <h2 className="text-lg font-semibold">Timbrar CFDI</h2>

      <label className="text-sm font-medium">RFC receptor</label>
      <input
        value={rfc}
        onChange={(e) => setRfc(e.target.value.toUpperCase())}
        placeholder="XAXX010101000"
        className="rounded-md border px-3 py-2 font-mono"
      />

      <label className="text-sm font-medium">Uso CFDI</label>
      <select
        value={uso}
        onChange={(e) => setUso(e.target.value)}
        className="rounded-md border px-3 py-2"
      >
        <option value="G01">G01 — Adquisición de mercancías</option>
        <option value="G03">G03 — Gastos en general</option>
        <option value="P01">P01 — Por definir</option>
      </select>

      <div className="flex justify-end gap-2 mt-2">
        <button onClick={() => props.close()} className="text-sm">
          Cancelar
        </button>
        <button
          disabled={!valid}
          onClick={() => props.close({ rfc_receptor: rfc, uso_cfdi: uso })}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          Timbrar
        </button>
      </div>
    </div>
  );
}
