import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

type ModulePlan = { name: string; reason: string; action: string }
type ShoppingList = { modules: ModulePlan[]; notes?: string[] }

const promptPath = path.join(__dirname, '..', 'prompts', 'shopping-list.md')
const promptText = fs.readFileSync(promptPath, 'utf8')

function stubPlan(): ShoppingList {
  return {
    modules: [
      {
        name: 'gateway-template',
        reason: 'serve trusted Arweave template via cache',
        action: 'set txid=<TBD>; cache_ttl=300; allowlist hash',
      },
      {
        name: 'worker-inbox',
        reason: 'short-lived PII envelopes + forget hook',
        action: 'ttl=900; require forget_token; delete-on-download',
      },
      {
        name: 'write-ao',
        reason: 'pseudonymous events with HMAC',
        action: 'OUTBOX_HMAC_SECRET set; export path enabled',
      },
    ],
    notes: ['STUB: OPENAI_API_KEY not set, returning offline plan'],
  }
}

export async function generateShoppingList(context: Record<string, any>): Promise<ShoppingList> {
  if (!process.env.OPENAI_API_KEY) {
    return stubPlan()
  }

  // Lazy import to avoid dependency when not configured
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const OpenAI = require('openai')
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const messages = [
    { role: 'system', content: promptText },
    { role: 'user', content: JSON.stringify(context ?? {}, null, 2) },
  ]

  const resp = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    messages,
    response_format: { type: 'json_object' },
    max_tokens: 800,
    temperature: 0.2,
    user: `darkmesh-web-${randomUUID()}`,
  })

  const raw = resp.choices[0]?.message?.content || '{}'
  return JSON.parse(raw) as ShoppingList
}

// Simple CLI helper for local testing
if (require.main === module) {
  const ctx = process.argv[2] ? JSON.parse(process.argv[2]) : { siteType: 'eshop', region: 'EU' }
  generateShoppingList(ctx)
    .then((plan) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(plan, null, 2))
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err)
      process.exit(1)
    })
}
