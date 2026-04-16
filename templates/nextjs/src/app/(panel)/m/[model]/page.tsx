'use client';

import { use, useState } from 'react';
import { useInstalledAddons } from '@/hooks/use-installed-addons';
import { getMockRecords, type ModelDefinition } from '@/lib/mock-addons';

// ---------------------------------------------------------------------------
// DynamicTable — renders any model's records in a table
// ---------------------------------------------------------------------------

function DynamicTable({
  model,
  records,
}: {
  model: ModelDefinition;
  records: Record<string, unknown>[];
}) {
  // Show at most 6 columns in the table
  const visibleFields = model.fields.slice(0, 6);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {visibleFields.map((field) => (
                <th
                  key={field.key}
                  className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  {field.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleFields.length + 1}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  No records found. Create your first one.
                </td>
              </tr>
            ) : (
              records.map((record, idx) => (
                <tr
                  key={String(record.id ?? idx)}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  {visibleFields.map((field) => (
                    <td key={field.key} className="px-4 py-3 whitespace-nowrap">
                      {field.type === 'select' ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                          {String(record[field.key] ?? '-')}
                        </span>
                      ) : (
                        <span>{String(record[field.key] ?? '-')}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/m/${model.model_key}/${record.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-muted/30 h-11" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-border/50">
          <div className="h-4 w-32 rounded bg-muted/50 animate-pulse" />
          <div className="h-4 w-24 rounded bg-muted/50 animate-pulse" />
          <div className="h-4 w-20 rounded bg-muted/50 animate-pulse" />
          <div className="h-4 w-16 rounded bg-muted/50 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 404 state
// ---------------------------------------------------------------------------

function ModelNotFound({ modelKey }: { modelKey: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
        </svg>
      </div>
      <h2 className="text-xl font-bold mb-1">Model not found</h2>
      <p className="text-sm text-muted-foreground mb-4">
        The model <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">{modelKey}</code> is not registered by any installed addon.
      </p>
      <a
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Back to Dashboard
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page — dynamic model route
// ---------------------------------------------------------------------------

export default function ModelPage({
  params,
}: {
  params: Promise<{ model: string }>;
}) {
  const { model: modelKey } = use(params);
  const { addons, loading } = useInstalledAddons();
  const [filterText, setFilterText] = useState('');

  // Find the model definition across all installed addons
  let modelDef: ModelDefinition | null = null;
  for (const addon of addons) {
    const found = addon.model_definitions.find((m) => m.model_key === modelKey);
    if (found) {
      modelDef = found;
      break;
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-muted/50 animate-pulse" />
        <TableSkeleton />
      </div>
    );
  }

  if (!modelDef) {
    return <ModelNotFound modelKey={modelKey} />;
  }

  // Get mock records and apply basic text filter
  let records = getMockRecords(modelKey);
  if (filterText) {
    const q = filterText.toLowerCase();
    records = records.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(q))
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{modelDef.label_plural}</h1>
          <p className="text-sm text-muted-foreground">
            {records.length} record{records.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter..."
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap">
            + Create
          </button>
        </div>
      </div>

      {/* Table */}
      <DynamicTable model={modelDef} records={records} />
    </div>
  );
}
