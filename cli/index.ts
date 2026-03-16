#!/usr/bin/env node
import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

const program = new Command()
program.name('blackcat-web').description('Darkmesh web CLI (Node)').version('0.1.0')

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

program
  .command('telemetry:pull')
  .description('Fetch telemetry snapshot from gateway (read-only)')
  .option('--url <url>', 'Gateway telemetry endpoint', process.env.GATEWAY_TELEMETRY_URL)
  .option('--out <file>', 'Save snapshot to file', 'var/telemetry-snapshot.json')
  .action(async (opts) => {
    const url = opts.url
    if (!url) throw new Error('Set --url or GATEWAY_TELEMETRY_URL')
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    fs.mkdirSync(path.dirname(opts.out), { recursive: true })
    fs.writeFileSync(opts.out, JSON.stringify(json, null, 2))
    console.log(`Saved snapshot to ${opts.out}`)
  })

program
  .command('templates:sync')
  .description('Download template manifest metadata via gateway')
  .option('--url <url>', 'Gateway templates endpoint', process.env.GATEWAY_TEMPLATES_URL)
  .option('--out <file>', 'Save manifest list', 'var/templates.json')
  .action(async (opts) => {
    const url = opts.url
    if (!url) throw new Error('Set --url or GATEWAY_TEMPLATES_URL')
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    fs.mkdirSync(path.dirname(opts.out), { recursive: true })
    fs.writeFileSync(opts.out, JSON.stringify(json, null, 2))
    console.log(`Saved templates to ${opts.out}`)
  })

program
  .command('ingest:smoke')
  .description('Run local ingest smoke if available')
  .option('--script <file>', 'Path to smoke script', 'scripts/verify/ingest_smoke.lua')
  .action((opts) => {
    if (!fs.existsSync(opts.script)) {
      console.warn('Smoke script not found, skipping')
      return
    }
    const { spawnSync } = require('child_process')
    const res = spawnSync('lua', [opts.script], { stdio: 'inherit' })
    if (res.status !== 0) throw new Error('Smoke failed')
  })

program.parseAsync().catch((err) => {
  console.error(err)
  process.exit(1)
})
