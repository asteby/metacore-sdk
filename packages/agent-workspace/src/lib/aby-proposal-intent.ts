/**
 * Detect explicit accept / reject of an Aby proposal from voice or typed text.
 * Only used when a pending proposal exists — short intents, not long messages.
 */
export function normalizeSpeechIntent(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[¡!¿?.,;:"'`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type ProposalSpeechDecision = 'approve' | 'reject'

export function matchProposalDecision(raw: string): ProposalSpeechDecision | null {
  const n = normalizeSpeechIntent(raw)
  if (!n || n.length > 48) return null

  if (
    /^(aceptar|acepto|si|ok|okay|dale|confirmo|confirmar|aprobar|apruebo|de acuerdo|listo|hazlo|aplica)(\b|$)/.test(
      n,
    ) ||
    /\b(aceptar|acepto|confirmar|aprobar|apruebo|aplica)\b/.test(n)
  ) {
    return 'approve'
  }

  if (
    /^(rechazar|rechazo|no|cancelar|cancelo|descartar|negativo)(\b|$)/.test(n) ||
    /\b(rechazar|rechazo|cancelar|descartar)\b/.test(n)
  ) {
    return 'reject'
  }

  return null
}
