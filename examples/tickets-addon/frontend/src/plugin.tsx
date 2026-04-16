/**
 * Tickets addon — reference implementation.
 *
 * Demonstrates:
 *   - Registering a page route
 *   - Registering a custom modal for the "reassign" action
 *   - Contributing a dashboard widget via a slot
 *
 * This file is the federated module's exposed entry. A `vite.config.ts` (not
 * included) wraps it with `@originjs/vite-plugin-federation` so the host can
 * dynamically import it at runtime.
 */

import React from "react";
import { definePlugin, type AddonAPI } from "@asteby/metacore-sdk";

function TicketsPage({ api }: { api: AddonAPI }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Tickets</h1>
      <p className="text-sm text-muted-foreground">
        Addon versión {api.manifest.version} · corriendo en kernel {api.kernelVersion}
      </p>
      {/* Host renders the CRUD via DynamicTable; addon can extend below */}
    </div>
  );
}

function ReassignModal(props: {
  payload: { ticketId: string };
  close: (result?: unknown) => void;
}) {
  const [assignee, setAssignee] = React.useState("");
  return (
    <div className="grid gap-3">
      <label className="text-sm font-medium">Nuevo asignado</label>
      <input
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="rounded-md border px-3 py-2"
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => props.close()} className="text-sm">
          Cancelar
        </button>
        <button
          onClick={() => props.close({ assignee_id: assignee })}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          Reasignar
        </button>
      </div>
    </div>
  );
}

function TicketsWidget() {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">Tickets abiertos</div>
      <div className="mt-1 text-3xl font-bold">—</div>
    </div>
  );
}

export default definePlugin({
  key: "tickets",
  register(api) {
    api.registry.registerRoute({
      path: "/m/tickets/board",
      component: () => <TicketsPage api={api} />,
    });

    api.registry.registerModal({
      slug: "tickets.reassign",
      component: ReassignModal,
    });

    api.registry.registerSlot({
      name: "dashboard.widgets",
      component: TicketsWidget,
      priority: 20,
    });

    api.log.info("tickets addon registered", { version: api.manifest.version });
  },
  dispose() {
    // no-op: registry is torn down with the host shell
  },
});
