import { CatalogTemplate } from './models'

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>

export const TEMPLATE_CATALOG_QUERY = `#graphql
query TemplateCatalog($limit: Int = 50, $cursor: String) {
  templates(limit: $limit, cursor: $cursor) {
    cursor
    items {
      id
      name
      summary
      tags
      tx
      sha256
      allowlisted
      lastModified
      source
      allowlistTx
      manifestTx
    }
  }
}
`

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] }

export interface CatalogFetchOptions {
  cursor?: string
  limit?: number
  token?: string
  fetcher?: FetchLike
}

export interface CatalogPage {
  items: CatalogTemplate[]
  cursor?: string
}

export async function fetchTemplateCatalog(endpoint: string, options: CatalogFetchOptions = {}): Promise<CatalogPage> {
  const fetcher = options.fetcher ?? ((globalThis as any).fetch as FetchLike | undefined)
  if (!fetcher) throw new Error('Fetch is not available in this runtime')

  const body = JSON.stringify({ query: TEMPLATE_CATALOG_QUERY, variables: { cursor: options.cursor, limit: options.limit ?? 50 } })
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token) headers.authorization = `Bearer ${options.token}`

  const res = await fetcher(endpoint, { method: 'POST', headers, body })
  if (!res.ok) throw new Error(`Catalog fetch failed: HTTP ${res.status}`)

  const json = (await res.json()) as GraphQLResponse<{ templates?: CatalogPage }>
  if (json.errors?.length) throw new Error(`Catalog fetch returned error: ${json.errors[0].message}`)

  return json.data?.templates ?? { items: [], cursor: undefined }
}
