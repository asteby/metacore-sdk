/**
 * What the current person may do, as decided by the host (from its roles or
 * permissions). The UI only hides or disables controls: the server must still
 * enforce every rule, this is not a security boundary.
 */
export interface DataloadCapabilities {
  /** Apply a load (dry-run is read-only and is always offered). */
  launch: boolean
  /** Cancel a run in flight. */
  cancel: boolean
  /** Approve or reject rows in the review queue, and apply the approved ones. */
  approve: boolean
  /** Requeue media that could not be backed up. */
  retryMedia: boolean
  /** Re-read every backed-up original and compare its sha256. */
  verifyMedia: boolean
  /** Edit and save an organization's overrides. */
  editOverrides: boolean
}

export const ALL_CAPABILITIES: DataloadCapabilities = {
  launch: true,
  cancel: true,
  approve: true,
  retryMedia: true,
  verifyMedia: true,
  editOverrides: true,
}

/**
 * Without `capabilities` the UI offers everything (the server decides). Once the
 * host passes an object, anything it leaves out is denied: a new capability added
 * to the SDK never appears enabled by accident.
 */
export function resolveCapabilities(c?: Partial<DataloadCapabilities>): DataloadCapabilities {
  if (!c) return ALL_CAPABILITIES
  return {
    launch: !!c.launch,
    cancel: !!c.cancel,
    approve: !!c.approve,
    retryMedia: !!c.retryMedia,
    verifyMedia: !!c.verifyMedia,
    editOverrides: !!c.editOverrides,
  }
}
