import { describe, expect, it } from 'vitest'
import {
  filenameFromContentDisposition,
  looksLikeFilenameTemplate,
} from '../use-print-document'

describe('filenameFromContentDisposition', () => {
  it('parses quoted filename', () => {
    expect(filenameFromContentDisposition('inline; filename="cfdi-F-950.pdf"')).toBe(
      'cfdi-F-950.pdf',
    )
  })

  it('parses RFC 5987 filename*', () => {
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''cfdi-F%20950.pdf"),
    ).toBe('cfdi-F 950.pdf')
  })

  it('returns undefined for empty', () => {
    expect(filenameFromContentDisposition(undefined)).toBeUndefined()
  })
})

describe('looksLikeFilenameTemplate', () => {
  it('detects mustache', () => {
    expect(looksLikeFilenameTemplate('cfdi-{{record.number}}.pdf')).toBe(true)
    expect(looksLikeFilenameTemplate('cfdi-F-950.pdf')).toBe(false)
  })
})
