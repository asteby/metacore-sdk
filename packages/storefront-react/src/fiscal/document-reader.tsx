/**
 * "Upload your tax document" flow: the buyer drops the PDF the tax authority gave them, we read it ON THEIR DEVICE
 * (pdf.js is loaded only when a file is chosen, never in the main bundle), they review the prefilled fields and confirm.
 * The file is never uploaded or kept; only the fields the buyer confirms leave, plus minimal evidence of where they came
 * from (`buildDocumentEvidence`). Fields the region lists in `discard_fields` (ids, street...) are never shown or kept.
 *
 * Without JavaScript the same control posts the file to the shop's action (`createInvoiceAction`, intent
 * `extract-document`), which reads it in memory, discards it and sends back `data` to review.
 *
 * When the region lets a PHOTO of the document be read (`image_mode`: `qr_only` | `full`) the buyer can also take a
 * picture of its QR or scan it live with the camera. A QR carries only the tax id and the id of the document: the
 * rest is asked for (or the PDF is uploaded). The image and the camera frames never leave the device.
 *
 * Everything country-specific is the region's `IdentityDocumentSpec`: label, where to get it, accepted types, size,
 * rules, freshness. The component only knows "a document with fiscal data".
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { FiscalDocumentEvidence, IdentityDocumentSpec } from '@asteby/storefront'
import { ErrorSummary, type ErrorSummaryItem, type FieldErrors } from '../checkout/fields.js'
import { useResolvedLocale } from '../locale.js'
import { summarizeExtraction } from './extraction.js'
import { entryLabel, personTypeResolver, suggestInvoiceUse, validateFiscalValues, type FiscalRegion } from './format.js'
import { FiscalIdentityFields, type FiscalIdentityFieldsClassNames } from './identity-fields.js'
import { fill, fiscalMessages, type DeepPartial, type FiscalMessages } from './messages.js'
import { cameraSupported, useCameraQr } from './use-camera-qr.js'
import type { FiscalActionData, FiscalExtractionSummary, FiscalFieldName, FiscalFieldValues, FiscalReadError } from './types.js'

export type FiscalReaderResult = {
  values: FiscalFieldValues
  /** Where the data came from; `null` when the buyer typed everything. */
  evidence: FiscalDocumentEvidence | null
  /** The buyer asked to save the data to their account (`canSave`). */
  save: boolean
}

export type IdentityDocumentReaderClassNames = FiscalIdentityFieldsClassNames &
  Partial<Record<'root' | 'zone' | 'zoneActive' | 'button' | 'link' | 'privacy' | 'status' | 'error' | 'warning' | 'notice' | 'actions' | 'primary' | 'secondary' | 'summary', string>>

export type IdentityDocumentReaderProps = {
  region: FiscalRegion
  /** The document to read. Default: the first of `region.fiscal_id.documents`. */
  document?: IdentityDocumentSpec
  /**
   * URL of the pdf.js worker (`pdf.worker.mjs` from `pdfjs-dist/legacy/build`) that YOUR site serves. There is no
   * default and no CDN: without it the browser cannot read the file and the buyer is sent to manual entry.
   */
  workerSrc?: string
  /** The buyer confirmed the reviewed data. */
  onConfirm: (result: FiscalReaderResult) => void
  /** The buyer chose to type their data. Default: the review form opens empty. */
  onManual?: () => void
  /** Values to start the review with (e.g. a saved profile). */
  initialValues?: Partial<FiscalFieldValues>
  /** Result of the server (no-JS upload): when it carries an `extraction` or an error, it is shown. */
  data?: FiscalActionData | null
  /** The shop has a signed-in buyer: offer "Save to my account". */
  canSave?: boolean
  /** Enables the no-JS upload (a button that posts the file to the action with `intent=extract-document`). */
  serverUpload?: boolean
  /** Short noun of the document for texts ("constancia"). Default: the spec's label in lowercase. */
  documentName?: string
  personTypeOf?: (taxId: string) => string | null
  /** Clock for tests. */
  now?: () => Date
  namePrefix?: string
  locale?: string
  messages?: DeepPartial<FiscalMessages>
  classNames?: IdentityDocumentReaderClassNames
  /** Label of the confirm button. */
  confirmLabel?: ReactNode
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'camera' }
  | { kind: 'review'; extraction: FiscalExtractionSummary | null; revision: number }
  | { kind: 'error'; code: FiscalReadError; sizeLimit?: number }

const isPdf = (f: File, accept: string[]) => {
  const okType = f.type ? accept.some((a) => a === f.type) || f.type === 'application/pdf' : false
  return okType || /\.pdf$/i.test(f.name)
}

const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)

/** Time to read a PDF in the buyer's browser, worker download and start included. */
const BROWSER_READ_TIMEOUT_MS = 20_000

const mib = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`

export function IdentityDocumentReader(props: IdentityDocumentReaderProps) {
  const { region, workerSrc, onConfirm, onManual, initialValues, data, canSave, serverUpload, personTypeOf, now, namePrefix = 'invoice', messages, classNames: cx = {}, confirmLabel } = props
  const locale = useResolvedLocale(props.locale)
  const all = fiscalMessages(locale, messages)
  const m = all.reader
  const spec = props.document ?? region.fiscal_id?.documents?.[0]
  const reactId = useId().replace(/:/g, '')
  const inputId = `sf-reader-${reactId}-file`
  const helpId = `sf-reader-${reactId}-help`
  const documentName = props.documentName ?? (spec?.label ?? 'document').toLowerCase()

  const fromServer = data?.extraction ?? null
  const serverError = data && !data.ok && data.error && ['not_pdf', 'too_large', 'no_text', 'password', 'unreadable'].includes(data.error.code) ? (data.error.code as FiscalReadError) : null
  const [phase, setPhase] = useState<Phase>(() =>
    fromServer ? { kind: 'review', extraction: fromServer, revision: 0 } : serverError ? { kind: 'error', code: serverError, sizeLimit: spec?.max_bytes } : { kind: 'idle' },
  )
  const [dragging, setDragging] = useState(false)
  const [live, setLive] = useState('')
  const [values, setValues] = useState<FiscalFieldValues>({ tax_id: '', legal_name: '', postal_code: '', tax_regime: '', use: '', ...initialValues, ...(fromServer?.values ?? {}) })
  const [save, setSave] = useState(false)
  const [editing, setEditing] = useState(false)
  const [summary, setSummary] = useState<ErrorSummaryItem[] | null>(null)
  const [summaryKey, setSummaryKey] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const reviewRef = useRef<HTMLHeadingElement>(null)

  /** The compact card is enough only when the document gave everything valid; decided once per reading, never while typing. */
  const needsFields = (vals: FiscalFieldValues, x: FiscalExtractionSummary) => {
    const multi = x.regime_candidates.length > 1
    const problems = validateFiscalValues(region, vals, personTypeResolver(region.fiscal_id, personTypeOf))
    return Object.keys(problems).some((f) => !(multi && f === 'tax_regime'))
  }
  useEffect(() => setHydrated(true), [])
  useEffect(() => () => abort.current?.abort(), [])
  // A new answer from the server (the buyer posted a file without JS and the page came back).
  useEffect(() => {
    if (!fromServer) return
    setValues((cur) => {
      const next = { ...cur, ...fromServer.values }
      const suggestion = next.tax_regime && !next.use ? suggestInvoiceUse(region.fiscal_id, next.tax_regime) : null
      if (suggestion) {
        next.use = suggestion
        setSuggestedUse(suggestion)
      }
      setEditing(needsFields(next, fromServer))
      return next
    })
    setPhase({ kind: 'review', extraction: fromServer, revision: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromServer])
  useEffect(() => {
    if (phase.kind === 'error') errorRef.current?.focus()
    if (phase.kind === 'review' && phase.revision > 0) reviewRef.current?.focus()
  }, [phase])

  // The file picker takes the document's files (PDF); photos have their own control (`image_mode`).
  const accept = useMemo(() => {
    const files = (spec?.accept ?? []).filter((a) => !a.startsWith('image/'))
    return files.length ? files.join(',') : 'application/pdf'
  }, [spec])
  const imageMode = spec?.image_mode && spec.image_mode !== 'none' ? spec.image_mode : null
  const photoInput = useRef<HTMLInputElement>(null)
  const [suggestedUse, setSuggestedUse] = useState<string | null>(null)
  const cameraActive = phase.kind === 'camera' 
  const fieldErrors: FieldErrors = useMemo(() => {
    const out: FieldErrors = {}
    for (const [k, v] of Object.entries(data?.fieldErrors ?? {})) out[k] = all.server.errors[v] ?? v
    return out
  }, [data, all.server.errors])

  const cancel = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    setPhase({ kind: 'idle' })
    setLive('')
  }, [])

  const openManual = useCallback(() => {
    onManual?.()
    setPhase({ kind: 'review', extraction: null, revision: 1 })
    setLive('')
  }, [onManual])

  /** Puts what the engine read (a PDF, or only a QR) in the form, with the region's suggested use when it has one. */
  const showExtraction = useCallback(
    (sum: FiscalExtractionSummary) => {
      const base = { tax_id: '', legal_name: '', postal_code: '', tax_regime: '', use: '', ...sum.values }
      const suggestion = base.tax_regime ? suggestInvoiceUse(region.fiscal_id, base.tax_regime) : null
      if (suggestion && !base.use) base.use = suggestion
      setSuggestedUse(suggestion && base.use === suggestion ? suggestion : null)
      setValues(base)
      setSummary(null)
      setEditing(needsFields(base, sum))
      setPhase({ kind: 'review', extraction: sum, revision: 1 })
      setLive(m.done)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [region.fiscal_id, m.done],
  )

  /** The text of a QR (a photo, or a live frame) -> the fields it carries. Never blocks: no tax id means "no QR of this document". */
  const readQr = useCallback(
    async (text: string | null) => {
      if (!spec) return
      if (!text) return setPhase({ kind: 'error', code: 'no_qr' })
      const eng = await import('@asteby/storefront/fiscal-document')
      const x = eng.extractIdentityDocument('', spec, {
        catalogs: region.fiscal_id ? eng.catalogsFromRegion(region.fiscal_id) : {},
        qr: text,
        ...(now ? { now: now() } : {}),
      })
      if (!x.fields.tax_id) return setPhase({ kind: 'error', code: 'no_qr' })
      const evidence = eng.buildDocumentEvidence(x, { sha256: null, source: 'qr' })
      showExtraction(summarizeExtraction(x, evidence, region.fiscal_id?.regimes.map((r) => r.code)))
    },
    [spec, region, now, showExtraction],
  )

  const readImage = useCallback(
    async (file: File) => {
      if (!spec) return
      if (file.size > spec.max_bytes) return setPhase({ kind: 'error', code: 'too_large', sizeLimit: spec.max_bytes })
      const ctl = new AbortController()
      abort.current = ctl
      setPhase({ kind: 'reading', fileName: file.name })
      setLive(fill(m.reading, { document: documentName }))
      try {
        const eng = await import('@asteby/storefront/fiscal-document')
        const text = await eng.decodeImageQr(file, { maxBytes: spec.max_bytes, signal: ctl.signal })
        if (ctl.signal.aborted) return
        await readQr(text)
      } catch (err) {
        if (ctl.signal.aborted) return
        const code = (err as { code?: string } | null)?.code
        setLive('')
        setPhase({ kind: 'error', code: code === 'too_large' ? 'too_large' : code === 'not_image' ? 'not_image' : 'unreadable', sizeLimit: spec.max_bytes })
      } finally {
        if (abort.current === ctl) abort.current = null
        if (photoInput.current) photoInput.current.value = ''
      }
    },
    [spec, documentName, m.reading, readQr],
  )

  const camera = useCameraQr({
    active: cameraActive,
    onCode: (text) => {
      // "Code read. Review your details": one announcement for the camera path (the review has its own focus).
      void readQr(text)
        .then(() => setLive(`${m.scan.cameraRead}. ${m.done}`))
        .catch(() => setPhase({ kind: 'error', code: 'unreadable' }))
    },
  })

  const read = useCallback(
    async (file: File) => {
      if (!spec) return
      if (imageMode && isImage(file)) return readImage(file)
      if (!isPdf(file, spec.accept ?? [])) return setPhase({ kind: 'error', code: 'not_pdf' })
      if (file.size > spec.max_bytes) return setPhase({ kind: 'error', code: 'too_large', sizeLimit: spec.max_bytes })
      const ctl = new AbortController()
      abort.current = ctl
      setPhase({ kind: 'reading', fileName: file.name })
      setLive(fill(m.reading, { document: documentName }))
      try {
        // On demand: pdf.js is not in the main bundle, it loads here.
        const eng = await import('@asteby/storefront/fiscal-document')
        const { text, sha256 } = await eng.readPdfText(file, {
          maxBytes: spec.max_bytes,
          // In the browser the clock also covers loading and starting the pdf.js worker: a phone on a slow network needs
          // more than the 3 s the server upload allows itself.
          timeoutMs: BROWSER_READ_TIMEOUT_MS,
          ...(spec.max_pages ? { maxPages: spec.max_pages } : {}),
          ...(workerSrc ? { workerSrc } : {}),
          signal: ctl.signal,
        })
        if (ctl.signal.aborted) return
        // The QR is a best-effort cross-check; it never blocks.
        const qr = await eng.decodePdfQr(file, { ...(workerSrc ? { workerSrc } : {}), timeoutMs: BROWSER_READ_TIMEOUT_MS, signal: ctl.signal }).catch(() => null)
        if (ctl.signal.aborted) return
        const x = eng.extractIdentityDocument(text, spec, {
          catalogs: region.fiscal_id ? eng.catalogsFromRegion(region.fiscal_id) : {},
          qr,
          ...(now ? { now: now() } : {}),
        })
        const evidence = eng.buildDocumentEvidence(x, { sha256, source: 'pdf_client' })
        const sum = summarizeExtraction(x, evidence, region.fiscal_id?.regimes.map((r) => r.code))
        showExtraction(sum)
      } catch (err) {
        if (ctl.signal.aborted) return
        const code = (err as { code?: string } | null)?.code
        setLive('')
        setPhase({
          kind: 'error',
          code: code === 'not_pdf' || code === 'too_large' || code === 'no_text' || code === 'password' ? code : 'unreadable',
          sizeLimit: spec.max_bytes,
        })
      } finally {
        if (abort.current === ctl) abort.current = null
        if (fileInput.current) fileInput.current.value = ''
      }
    },
    [spec, workerSrc, region, now, documentName, m.reading, imageMode, readImage, showExtraction],
  )

  if (!spec) return null

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) void read(f)
  }

  const confirm = () => {
    const problems = validateFiscalValues(region, values, personTypeResolver(region.fiscal_id, personTypeOf))
    const keys = Object.keys(problems) as FiscalFieldName[]
    if (keys.length) {
      const labels: Record<FiscalFieldName, string> = {
        tax_id: region.fiscal_id?.label || all.fields.taxId,
        legal_name: all.fields.legalName,
        postal_code: all.fields.postalCode,
        tax_regime: all.fields.regime,
        use: all.fields.use,
      }
      const item = (f: FiscalFieldName): ErrorSummaryItem => {
        const p = problems[f]!
        const msg =
          p === 'required'
            ? all.fields.errors.required
            : p === 'format'
              ? f === 'tax_id'
                ? fill(all.fields.errors.taxIdFormat, { kind: region.fiscal_id?.label ?? '' })
                : fill(all.fields.errors.postalFormat, { example: region.address?.postal_code?.example ?? '' })
              : p === 'person_type'
                ? all.fields.errors.personType
                : p === 'use_not_allowed'
                  ? all.fields.errors.useNotAllowed
                  : all.fields.errors.unknown
        return { name: `${namePrefix}.${f}`, id: `sf-reader-${reactId}-${f}`, label: labels[f], message: msg }
      }
      setSummary(keys.map(item))
      setSummaryKey((k) => k + 1)
      return
    }
    setSummary(null)
    const ev = phase.kind === 'review' ? (phase.extraction?.evidence ?? null) : null
    onConfirm({ values, evidence: ev, save: !!canSave && save })
  }

  const errorsByName: FieldErrors = { ...fieldErrors }
  for (const s of summary ?? []) errorsByName[s.name] = s.message

  // ---- views ------------------------------------------------------------------------------------------------------
  const privacy = serverUpload && !hydrated ? m.privacyServer : m.privacyBrowser

  const idle = (
    <div className={cx.root} data-sf-reader data-state="idle">
      <h3 data-sf-reader-title>{fill(m.title, { document: documentName })}</h3>
      {spec.help ? <p data-sf-reader-help>{spec.help}</p> : null}
      <label
        htmlFor={inputId}
        className={dragging ? cx.zoneActive : cx.zone}
        data-sf-reader-zone
        data-dragging={dragging ? '' : undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span aria-hidden="true" data-sf-reader-icon>
          ⬆
        </span>
        <span data-sf-reader-drop>{dragging ? m.dropActive : m.dropHint}</span>
        <span data-sf-reader-choose>{m.choose}</span>
        <input
          ref={fileInput}
          id={inputId}
          type="file"
          // With JavaScript the file never travels with the form; the name only exists for the no-JS upload.
          name={serverUpload && !hydrated ? 'document' : undefined}
          accept={accept}
          aria-describedby={helpId}
          data-sf-reader-input
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void read(f)
          }}
        />
      </label>
      {imageMode ? (
        <div className={cx.actions} data-sf-reader-scan>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            tabIndex={-1}
            aria-label={m.scan.photo}
            data-sf-reader-photo-input
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void readImage(f)
            }}
          />
          <button type="button" className={cx.secondary} onClick={() => photoInput.current?.click()} data-sf-reader-photo>
            {m.scan.photo}
          </button>
          {hydrated && cameraSupported() ? (
            <button type="button" className={cx.secondary} onClick={() => setPhase({ kind: 'camera' })} data-sf-reader-camera>
              {m.scan.camera}
            </button>
          ) : null}
        </div>
      ) : null}
      <p id={helpId} className={cx.privacy} data-sf-reader-privacy>
        {privacy}
      </p>
      {serverUpload ? (
        <noscript>
          <button type="submit" name="intent" value="extract-document" formEncType="multipart/form-data" formMethod="post" formNoValidate className={cx.secondary} data-sf-reader-upload>
            {m.uploadServer}
          </button>
        </noscript>
      ) : null}
      <p data-sf-reader-links>
        {spec.obtain_url ? (
          <a href={spec.obtain_url} target="_blank" rel="noopener noreferrer" className={cx.link} data-sf-reader-obtain>
            {m.obtain}
          </a>
        ) : null}
        <button type="button" className={cx.link} onClick={openManual} data-sf-reader-manual>
          {m.manual}
        </button>
      </p>
    </div>
  )

  const reading = phase.kind === 'reading' && (
    <div className={cx.root} data-sf-reader data-state="reading">
      <p className={cx.status} data-sf-reader-reading>
        <span aria-hidden="true" data-sf-reader-spinner />
        {fill(m.reading, { document: documentName })} <span data-sf-reader-file>{phase.fileName}</span>
      </p>
      <button type="button" className={cx.secondary} onClick={cancel} data-sf-reader-cancel>
        {m.cancel}
      </button>
    </div>
  )

  const cameraView = phase.kind === 'camera' && (
    <div className={cx.root} data-sf-reader data-state="camera">
      <h3 data-sf-reader-title>{m.scan.cameraTitle}</h3>
      <div data-sf-reader-viewfinder>
        {/* The stream is shown, never recorded; it stops when this view closes. */}
        <video ref={camera.videoRef} playsInline muted aria-label={m.scan.cameraGuide} data-sf-reader-video />
        <span aria-hidden="true" data-sf-reader-frame />
      </div>
      <p className={cx.status} data-sf-reader-camera-status={camera.status}>
        {camera.status === 'denied'
          ? m.scan.cameraDenied
          : camera.status === 'unsupported'
            ? m.scan.cameraUnavailable
            : camera.status === 'starting'
              ? m.scan.cameraStarting
              : m.scan.cameraGuide}
      </p>
      <p className={cx.privacy} data-sf-reader-privacy>
        {privacy}
      </p>
      <div className={cx.actions} data-sf-reader-actions>
        <button type="button" className={cx.secondary} onClick={() => photoInput.current?.click()} data-sf-reader-photo>
          {m.scan.choosePhoto}
        </button>
        <button
          type="button"
          className={cx.primary}
          onClick={() => {
            camera.stop()
            setPhase({ kind: 'idle' })
          }}
          data-sf-reader-camera-close
        >
          {m.scan.closeCamera}
        </button>
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        tabIndex={-1}
        aria-label={m.scan.choosePhoto}
        data-sf-reader-photo-input
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void readImage(f)
        }}
      />
    </div>
  )

  const errored = phase.kind === 'error' && (
    <div className={cx.root} data-sf-reader data-state="error">
      <div ref={errorRef} role="alert" tabIndex={-1} className={cx.error} data-sf-reader-error={phase.code}>
        {fill(m.errors[phase.code], { size: mib(phase.sizeLimit ?? spec.max_bytes) })}
      </div>
      <div className={cx.actions} data-sf-reader-actions>
        <button type="button" className={cx.primary} onClick={openManual} data-sf-reader-manual>
          {m.manual}
        </button>
        <button type="button" className={cx.secondary} onClick={() => setPhase({ kind: 'idle' })} data-sf-reader-retry>
          {m.changeFile}
        </button>
      </div>
    </div>
  )

  const candidates = phase.kind === 'review' && phase.extraction && phase.extraction.regime_candidates.length > 1 ? phase.extraction.regime_candidates : null
  // Without JavaScript the card cannot switch to editing, so the whole form stays (it is what the server action posts).
  const showFields = editing || phase.kind !== 'review' || !phase.extraction || !hydrated
  const pickRegime = (code: string) =>
    setValues((cur) => {
      const next = { ...cur, tax_regime: code }
      const suggestion = suggestInvoiceUse(region.fiscal_id, code)
      if (!next.use && suggestion) {
        next.use = suggestion
        setSuggestedUse(suggestion)
      }
      return next
    })
  const regimeEntries = (() => {
    const all_ = region.fiscal_id?.regimes ?? []
    return candidates ? all_.filter((r) => candidates.includes(r.code)) : all_.filter((r) => r.code === values.tax_regime)
  })()

  const review = phase.kind === 'review' && (
    <div className={cx.root} data-sf-reader data-state="review" data-sf-compact={showFields ? undefined : ''}>
      <h3 ref={reviewRef} tabIndex={-1} data-sf-reader-title>
        {m.reviewTitle}
      </h3>
      <p data-sf-reader-help>{fill(m.reviewHint, { document: documentName })}</p>
      <ErrorSummary
        items={summary}
        focusKey={summaryKey}
        locale={locale}
        title={summary ? (summary.length === 1 ? m.summaryTitleOne : fill(m.summaryTitleMany, { n: summary.length })) : undefined}
      />
      {phase.extraction ? <Warnings x={phase.extraction} m={m} cx={cx} /> : null}
      {showFields ? (
        <FiscalIdentityFields
          region={region}
          values={values}
          onChange={setValues}
          errors={errorsByName}
          idPrefix={`sf-reader-${reactId}`}
          namePrefix={namePrefix}
          fromDocument={phase.extraction?.from_document ?? []}
          documentName={documentName}
          regimeCandidates={candidates ?? undefined}
          suggestedUse={suggestedUse}
          {...(personTypeOf ? { personTypeOf } : {})}
          locale={locale}
          {...(messages ? { messages } : {})}
          classNames={cx}
          hideLegend
          quiet
        />
      ) : (
        <div data-sf-reader-summary>
          {(['tax_id', 'legal_name', 'postal_code', 'use'] as const).map((f) => (
            <input key={f} type="hidden" name={`${namePrefix}.${f}`} value={values[f]} />
          ))}
          {candidates ? null : <input type="hidden" name={`${namePrefix}.tax_regime`} value={values.tax_regime} />}
          <dl data-sf-reader-facts>
            <div>
              <dt>{region.fiscal_id?.label || all.fields.taxId}</dt>
              <dd data-sf-fact="tax_id">{values.tax_id}</dd>
            </div>
            <div>
              <dt>{all.fields.legalName}</dt>
              <dd data-sf-fact="legal_name">{values.legal_name}</dd>
            </div>
            <div>
              <dt>{all.fields.postalCode}</dt>
              <dd data-sf-fact="postal_code">{values.postal_code}</dd>
            </div>
            {!candidates ? (
              <div>
                <dt>{all.fields.regime}</dt>
                <dd data-sf-fact="tax_regime">
                  {regimeEntries[0] ? `${entryLabel(regimeEntries[0], locale)} (${regimeEntries[0].code})` : values.tax_regime}
                </dd>
              </div>
            ) : null}
          </dl>
          {candidates ? (
            <fieldset className={cx.radios} data-sf-fiscal-regimes style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
              <legend className={cx.label}>{all.fields.regime}</legend>
              <p className={cx.hint} data-sf-field-hint>
                {all.fields.regimeFromDocument}
              </p>
              {regimeEntries.map((r, i) => (
                <label key={r.code} className={cx.radio} data-sf-fiscal-radio>
                  <input
                    type="radio"
                    id={i === 0 ? `sf-reader-${reactId}-tax_regime` : undefined}
                    name={`${namePrefix}.tax_regime`}
                    value={r.code}
                    checked={values.tax_regime === r.code}
                    onChange={() => pickRegime(r.code)}
                  />
                  <span>
                    {entryLabel(r, locale)} <span data-sf-fiscal-code>({r.code})</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>
      )}
      {phase.extraction?.evidence ? <input type="hidden" name={`${namePrefix}.document`} value={JSON.stringify(phase.extraction.evidence)} /> : null}
      {canSave ? (
        <label data-sf-reader-save>
          <input type="checkbox" name={`${namePrefix}.save`} checked={save} onChange={(e) => setSave(e.target.checked)} />
          <span>
            {m.saveToAccount}
            <span data-sf-field-hint> {m.saveConsent}</span>
          </span>
        </label>
      ) : null}
      <div className={cx.actions} data-sf-reader-actions>
        <button type="button" className={cx.primary} onClick={confirm} data-sf-reader-confirm>
          {confirmLabel ?? m.confirm}
        </button>
        {showFields ? (
          <button type="button" className={cx.secondary} onClick={() => setPhase({ kind: 'idle' })} data-sf-reader-retry>
            {m.changeFile}
          </button>
        ) : (
          <button type="button" className={cx.secondary} onClick={() => setEditing(true)} data-sf-reader-edit>
            {m.reviewEdit}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div data-sf-document-reader>
      {/* Always mounted so assistive tech announces every change (reading, done). */}
      <div role="status" aria-live="polite" className={cx.status} data-sf-reader-live style={visuallyHidden}>
        {live}
      </div>
      {phase.kind === 'idle' ? idle : null}
      {reading || null}
      {cameraView || null}
      {errored || null}
      {review || null}
    </div>
  )
}

const visuallyHidden = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const

function Warnings({ x, m, cx }: { x: FiscalExtractionSummary; m: FiscalMessages['reader']; cx: IdentityDocumentReaderClassNames }) {
  const items: string[] = []
  if (x.qr_match === false) items.push(m.warnings.qrMismatch)
  if (x.stale === true && x.age_days !== null) items.push(fill(m.warnings.stale, { days: x.age_days }))
  if (x.evidence.source === 'qr') items.push(m.warnings.qrPartial)
  else if (x.regime_candidates.length === 0 && !x.values.tax_regime) items.push(m.warnings.regimeMissing)
  else if (x.missing.some((k) => k !== 'tax_regime' && k !== 'document_id' && k !== 'issued_on')) items.push(m.warnings.fieldsMissing)
  if (!items.length) return null
  return (
    <ul className={cx.warning} data-sf-reader-warnings>
      {items.map((t) => (
        <li key={t} data-sf-reader-warning>
          <span aria-hidden="true">⚠ </span>
          {t}
        </li>
      ))}
    </ul>
  )
}
