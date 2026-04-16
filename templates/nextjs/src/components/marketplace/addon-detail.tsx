'use client';

import { useState } from 'react';
import type { CatalogAddon } from '@/lib/marketplace-client';
import { AddonIcon } from './addon-icon';
import { InstallButton } from './install-button';

type Tab = 'description' | 'tools' | 'settings';

interface AddonDetailProps {
  addon: CatalogAddon;
  installed: boolean;
  onStatusChange: () => void;
}

export function AddonDetail({ addon, installed, onStatusChange }: AddonDetailProps) {
  const [tab, setTab] = useState<Tab>('description');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'description', label: 'Descripción' },
    { key: 'tools', label: 'Tools' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <div className="flex items-start gap-5 mb-8">
        <AddonIcon
          iconType={addon.icon_type}
          iconSlug={addon.icon_slug}
          iconColor={addon.icon_color}
          size={64}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{addon.name}</h1>
            {addon.author === 'Metacore' && (
              <span title="Verificado" className="text-pink-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-white/40 mb-4">
            {addon.version && <span>v{addon.version}</span>}
            {addon.author && (
              <>
                <span className="text-white/10">|</span>
                <span>{addon.author}</span>
              </>
            )}
            <span className="text-white/10">|</span>
            <span className="capitalize">{addon.category}</span>
          </div>
          <p className="text-sm text-white/60 leading-relaxed mb-5">
            {addon.description}
          </p>
          <InstallButton
            addonKey={addon.key}
            version={addon.version}
            installed={installed}
            onStatusChange={onStatusChange}
            size="md"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === t.key
                ? 'text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'description' && (
        <div className="space-y-6">
          {/* Features */}
          {addon.features && addon.features.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Características</h3>
              <ul className="grid grid-cols-2 gap-2">
                {addon.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview of what gets added */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Al instalar se agrega</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <div className="text-lg font-bold text-white">{addon.tools?.length ?? 0}</div>
                <div className="text-[11px] text-white/40">Tools</div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <div className="text-lg font-bold text-white">{addon.settings?.length ?? 0}</div>
                <div className="text-[11px] text-white/40">Settings</div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <div className="text-lg font-bold text-white">1</div>
                <div className="text-[11px] text-white/40">Nav item</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'tools' && (
        <div>
          {addon.tools && addon.tools.length > 0 ? (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white/40 uppercase tracking-wider">ID</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white/40 uppercase tracking-wider">Nombre</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white/40 uppercase tracking-wider">Descripción</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white/40 uppercase tracking-wider">Params</th>
                  </tr>
                </thead>
                <tbody>
                  {addon.tools.map((tool) => (
                    <tr key={tool.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-pink-400">{tool.id}</td>
                      <td className="px-4 py-2.5 text-white/70">{tool.name}</td>
                      <td className="px-4 py-2.5 text-white/50">{tool.description}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {tool.params.map((p) => (
                            <span key={p} className="text-[11px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 font-mono">
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-white/40">Este addon no expone tools.</p>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div>
          {addon.settings && addon.settings.length > 0 ? (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white/40 uppercase tracking-wider">Key</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white/40 uppercase tracking-wider">Label</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white/40 uppercase tracking-wider">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white/40 uppercase tracking-wider">Secreto</th>
                  </tr>
                </thead>
                <tbody>
                  {addon.settings.map((s) => (
                    <tr key={s.key} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-pink-400">{s.key}</td>
                      <td className="px-4 py-2.5 text-white/70">{s.label}</td>
                      <td className="px-4 py-2.5 text-white/50">{s.type}</td>
                      <td className="px-4 py-2.5">
                        {s.secret ? (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            secret
                          </span>
                        ) : (
                          <span className="text-white/30">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-white/40">Este addon no requiere configuración.</p>
          )}
        </div>
      )}
    </div>
  );
}
