'use client';

import { use } from 'react';
import { useInstalledAddons } from '@/hooks/use-installed-addons';
import { getMockRecord, type ModelDefinition, type FieldDefinition } from '@/lib/mock-addons';

// ---------------------------------------------------------------------------
// DynamicForm — renders fields from a model definition
// ---------------------------------------------------------------------------

function DynamicFormField({
  field,
  value,
}: {
  field: FieldDefinition;
  value: unknown;
}) {
  const baseInputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          className={`${baseInputClass} min-h-[80px]`}
          defaultValue={String(value ?? '')}
          placeholder={field.label}
        />
      ) : field.type === 'select' ? (
        <select
          className={baseInputClass}
          defaultValue={String(value ?? '')}
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'}
          className={baseInputClass}
          defaultValue={String(value ?? '')}
          placeholder={field.label}
        />
      )}
    </div>
  );
}

function DynamicForm({
  model,
  record,
}: {
  model: ModelDefinition;
  record: Record<string, unknown>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {model.fields.map((field) => (
          <DynamicFormField
            key={field.key}
            field={field}
            value={record[field.key]}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function FormSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-20 rounded bg-muted/50 animate-pulse" />
            <div className="h-9 rounded-lg bg-muted/50 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

function RecordNotFound({ modelKey, id }: { modelKey: string; id: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z" /><path d="M3 7.6v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8" /><path d="M15 2v5h5" />
        </svg>
      </div>
      <h2 className="text-xl font-bold mb-1">Record not found</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Could not find record <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">{id}</code> in{' '}
        <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">{modelKey}</code>.
      </p>
      <a
        href={`/m/${modelKey}`}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Back to list
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ModelDetailPage({
  params,
}: {
  params: Promise<{ model: string; id: string }>;
}) {
  const { model: modelKey, id } = use(params);
  const { addons, loading } = useInstalledAddons();

  // Find model definition
  let modelDef: ModelDefinition | null = null;
  for (const addon of addons) {
    const found = addon.model_definitions.find((m) => m.model_key === modelKey);
    if (found) {
      modelDef = found;
      break;
    }
  }

  const record = getMockRecord(modelKey, id);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-muted/50 animate-pulse" />
        <FormSkeleton />
      </div>
    );
  }

  if (!modelDef || !record) {
    return <RecordNotFound modelKey={modelKey} id={id} />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <a href={`/m/${modelKey}`} className="hover:text-foreground transition-colors">
              {modelDef.label_plural}
            </a>
            <span>/</span>
            <span className="text-foreground">#{id}</span>
          </div>
          <h1 className="text-2xl font-bold">
            {String(record[modelDef.fields[0]?.key] ?? `${modelDef.label} #${id}`)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/m/${modelKey}`}
            className="h-9 inline-flex items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted transition-colors"
          >
            Back
          </a>
          <button className="h-9 rounded-lg border border-red-500/30 px-4 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors">
            Delete
          </button>
          <button className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Save
          </button>
        </div>
      </div>

      {/* Form */}
      <DynamicForm model={modelDef} record={record} />
    </div>
  );
}
