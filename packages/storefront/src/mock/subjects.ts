// Subject kinds for the mock («My items», contract 1.9). A store that declares none (the default) has no such section;
// pass `subjectKinds: MOCK_SUBJECT_KINDS` to rehearse one that declares a «garage» (a cascade catalog with model years
// and a private field) and a catalog-less «size».
import type { SubjectKind } from '../types.js'

export const MOCK_SUBJECT_KINDS: SubjectKind[] = [
  {
    key: 'vehicle',
    label: 'Vehículo',
    label_plural: 'Mi garage',
    max_per_account: 3,
    attach_to_order: true,
    fit_key_template: '{make}/{model}/{year}/{engine}',
    fields: [
      { key: 'make', label: 'Marca', type: 'select', source: 'catalog', required: true },
      { key: 'model', label: 'Modelo', type: 'select', source: 'catalog', depends_on: 'make', required: true },
      { key: 'year', label: 'Año', type: 'year', source: 'catalog', depends_on: 'model', required: true },
      { key: 'engine', label: 'Versión / motor', type: 'select', source: 'catalog', depends_on: 'year' },
      { key: 'plate', label: 'Placas (opcional)', type: 'text', max: 12, private: true },
    ],
    catalog: {
      version: 'mock-1',
      tree: {
        nissan: {
          label: 'Nissan',
          children: {
            np300: {
              label: 'NP300 Frontier',
              from: 2008,
              to: 2022,
              children: { '2.5': { label: '2.5 L', ranges: [[2010, 2015]] }, '2.4': { label: '2.4 L' } },
            },
            versa: { label: 'Versa', from: 2012, to: 2024, children: { '1.6': { label: '1.6 L' } } },
          },
        },
        ford: { label: 'Ford', children: { f150: { label: 'F-150', from: 2000, to: 2020, children: { '5.0': { label: '5.0 L' } } } } },
      },
    },
  },
  {
    key: 'size',
    label: 'Talla',
    label_plural: 'Mis tallas',
    max_per_account: 5,
    fit_key_template: '{garment}/{value}',
    fields: [
      { key: 'garment', label: 'Prenda', type: 'text', required: true },
      { key: 'value', label: 'Talla', type: 'text', required: true, max: 8 },
    ],
    catalog: null,
  },
]
