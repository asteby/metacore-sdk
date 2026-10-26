export { extractIdentityDocument, buildDocumentEvidence, catalogsFromRegion, validateRules, IdentityRulesError, MAX_TEXT_LENGTH } from './engine.js'
export { registerIdentityExtractor } from './registry.js'
export { readPdfText, setPdfjsLoader, DEFAULT_MAX_BYTES, DEFAULT_MAX_PAGES, DEFAULT_TIMEOUT_MS } from './pdf.js'
export type { PdfSource, PdfTextResult, ReadPdfOptions, PdfjsLike } from './pdf.js'
export { decodePdfQr } from './qr.js'
export { decodeImageQr, DEFAULT_IMAGE_MAX_SIDE } from './image-qr.js'
export type { DecodeImageQrOptions, ImageQrSource } from './image-qr.js'
export type { DecodePdfQrOptions } from './qr.js'
export { IdentityDocumentError, isIdentityDocumentError } from './errors.js'
export type { IdentityDocumentErrorCode } from './errors.js'
export { sha256Hex, foldText } from './text.js'
export type {
  EvidenceInput,
  ExtractOptions,
  ExtractedValue,
  IdentityCatalogs,
  IdentityExtraction,
  IdentityExtractorFn,
} from './types.js'
export type {
  FiscalDocumentEvidence,
  IdentityDocumentSpec,
  IdentityCapture,
  IdentityFieldRule,
  IdentityRulesV1,
  IdentityStrategy,
} from '../types.js'
