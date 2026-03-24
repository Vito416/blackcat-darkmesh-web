import type { FetchLike } from './catalog'
import type { IntegrityHash, ManifestSignature } from './models'

export interface PipClientOptions {
  baseUrl?: string
  token?: string
  fetcher?: FetchLike
  latestPath?: string
  inboxPath?: string
}

export interface PipDocument {
  tenant: string
  site: string
  manifestTx: string
  manifestHash?: IntegrityHash
  allowlistTx?: string
  allowlistHash?: IntegrityHash
  issuedAt?: string
  expiresAt?: string
  previous?: string
  signature?: ManifestSignature
  version?: string
  [key: string]: unknown
}

const DEFAULT_LATEST_PATH = '/pip/latest'
const DEFAULT_INBOX_PATH = '/inbox'

function env(key: string) {
  return typeof process !== 'undefined' && process.env ? process.env[key] : undefined
}

function resolveBaseUrl(opts: PipClientOptions) {
  const base =
    opts.baseUrl ??
    env('WORKER_PIP_BASE') ??
    env('WORKER_API_BASE') ??
    env('WORKER_BASE_URL') ??
    env('PIP_BASE_URL')
  if (!base) throw new Error('PIP worker base URL is not configured')
  return base
}

function resolveToken(opts: PipClientOptions) {
  return opts.token ?? env('WORKER_PIP_TOKEN') ?? env('WORKER_AUTH_TOKEN') ?? env('WORKER_API_TOKEN')
}

function resolveFetcher(opts: PipClientOptions): FetchLike {
  const fetcher = opts.fetcher ?? ((globalThis as any).fetch as FetchLike | undefined)
  if (!fetcher) throw new Error('Fetch is not available in this runtime')
  return fetcher
}

function buildLatestUrl(base: string, tenant: string, site: string, path: string) {
  const url = new URL(base)
  const prefix = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
  url.pathname = `${prefix}${path.startsWith('/') ? path : `/${path}`}`
  url.search = ''
  url.searchParams.set('tenant', tenant)
  url.searchParams.set('site', site)
  return url.toString()
}

function buildInboxUrl(base: string, subject: string, nonce: string, path: string) {
  const url = new URL(base)
  const prefix = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  url.pathname = `${prefix}${normalizedPath}/${encodeURIComponent(subject)}/${encodeURIComponent(nonce)}`
  url.search = ''
  return url.toString()
}

export async function getLatestPip(tenant: string, site: string, options: PipClientOptions = {}): Promise<PipDocument> {
  if (!tenant) throw new Error('tenant is required')
  if (!site) throw new Error('site is required')

  const fetcher = resolveFetcher(options)
  const url = buildLatestUrl(resolveBaseUrl(options), tenant, site, options.latestPath ?? DEFAULT_LATEST_PATH)
  const headers: Record<string, string> = { accept: 'application/json' }
  const token = resolveToken(options)
  if (token) headers.authorization = `Bearer ${token}`

  const res = await fetcher(url, { method: 'GET', headers })
  if (!res.ok) throw new Error(`PIP fetch failed: HTTP ${res.status}`)

  const body = await res.json()
  const pip = (body && (body.pip ?? body.data?.pip ?? body)) as PipDocument | undefined
  if (!pip || typeof pip !== 'object' || !('manifestTx' in pip)) {
    throw new Error('PIP payload missing or malformed')
  }

  return pip
}

/**
 * Fetch a single PIP envelope via the worker inbox. This is a destructive read: the worker deletes the envelope
 * after a successful fetch, so retries with the same subject/nonce will return 404.
 */
export async function fetchPip(subject: string, nonce: string, options: PipClientOptions = {}): Promise<PipDocument> {
  if (!subject) throw new Error('subject is required')
  if (!nonce) throw new Error('nonce is required')

  const fetcher = resolveFetcher(options)
  const url = buildInboxUrl(resolveBaseUrl(options), subject, nonce, options.inboxPath ?? DEFAULT_INBOX_PATH)
  const headers: Record<string, string> = { accept: 'application/json' }

  const res = await fetcher(url, { method: 'GET', headers })
  if (res.status === 404) throw new Error('PIP not found (already consumed or expired)')
  if (!res.ok) throw new Error(`PIP fetch failed: HTTP ${res.status}`)

  const body = await res.json()
  const payload = body?.payload ?? body?.data?.payload ?? body

  let parsed: PipDocument
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload) as PipDocument
    } catch (err) {
      throw new Error('PIP payload is not valid JSON')
    }
  } else {
    parsed = payload as PipDocument
  }

  if (!parsed || typeof parsed !== 'object' || !('manifestTx' in parsed)) {
    throw new Error('PIP payload missing or malformed')
  }

  return parsed
}
