/**
 * Códigos de error estables de genui (ADR 0001 del SDK, §2.6). Son parte del
 * contrato: el kernel Go emite los mismos y los vectores de conformidad los fijan.
 */
export const GENUI_ERROR_CODES = [
  'genui.invalid_json',
  'genui.invalid_document',
  'genui.unsupported_version',
  'genui.unknown_block',
  'genui.field_not_allowed',
  'genui.required',
  'genui.type',
  'genui.enum',
  'genui.pattern',
  'genui.duplicate_id',
  'genui.unsafe_link',
  'genui.external_link_disabled',
  'genui.bad_ref',
  'genui.ref_not_allowed',
  'genui.unknown_overlay',
  'genui.unknown_target',
  'genui.invalid_action',
  'genui.invalid_block',
  'genui.limit.bytes',
  'genui.limit.depth',
  'genui.limit.blocks',
  'genui.limit.children',
  'genui.limit.tabs',
  'genui.limit.steps',
  'genui.limit.overlays',
  'genui.limit.sources',
  'genui.limit.bindings',
  'genui.limit.actions',
  'genui.limit.columns',
  'genui.limit.rows',
  'genui.limit.series',
  'genui.limit.fields',
  'genui.limit.items',
  'genui.limit.length',
  'genui.limit.properties',
  'genui.limit.markdown',
] as const

export type GenUIErrorCode = (typeof GENUI_ERROR_CODES)[number]

export class GenUIError extends Error {
  constructor(
    public readonly code: GenUIErrorCode,
    message: string,
    public readonly path: string = '',
  ) {
    super(message)
    this.name = 'GenUIError'
  }
}
