// Manifest + allowlist models for trusted template assets.

export type IntegrityHash = `sha256:${string}` | `sha512:${string}` | string

export interface ArweaveRef {
  tx: string
  contentType?: string
  sizeBytes?: number
  integrity?: IntegrityHash
}

export interface ManifestSignature {
  algo: 'ed25519' | 'rsa-pkcs1' | 'es256k' | string
  sig: string
  signer?: string
  publicKeyTx?: string
  issuedAt?: string
}

export interface ManifestComponent {
  id: string
  ref: ArweaveRef
  optional?: boolean
}

export interface ManifestDataRef {
  ref: ArweaveRef
  format?: 'json' | 'ndjson' | 'binary' | 'html' | string
}

export interface PageManifest {
  version: string
  pageId: string
  layout: ArweaveRef
  theme?: ArweaveRef
  components: ManifestComponent[]
  data?: ManifestDataRef
  entry: ArweaveRef
  checksum?: IntegrityHash
  previous?: string
  signature?: ManifestSignature
  allowlistHash?: IntegrityHash
  issuedAt?: string
}

export type AllowlistPurpose = 'layout' | 'theme' | 'component' | 'data' | 'bundle' | 'asset' | string

export interface AllowlistItem {
  tx: string
  sha256?: string
  label?: string
  purpose?: AllowlistPurpose
  expiresAt?: string
}

export interface AllowlistSnapshot {
  version: string
  updatedAt: string
  issuer?: string
  entries: AllowlistItem[]
  signature?: ManifestSignature
}

export interface CatalogTemplate {
  id: string
  name: string
  summary?: string
  tags?: string[]
  tx: string
  sha256?: string
  allowlisted: boolean
  lastModified: string
  source?: string
  allowlistTx?: string
  manifestTx?: string
  manifest?: PageManifest
}
