// Generate apple-touch-icon.png (180×180) from public/favicon.svg using Playwright.
// Run: node scripts/gen-apple-touch-icon.mjs
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const SVG_PATH = path.join(ROOT, 'public/favicon.svg')
const OUT_PATH = path.join(ROOT, 'public/apple-touch-icon.png')

const svg = await fs.readFile(SVG_PATH, 'utf8')
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  .icon{width:180px;height:180px}
  .icon svg{width:100%;height:100%;display:block}
</style></head><body><div class="icon">${svg}</div></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 180, height: 180 } })
await page.setContent(html)
const buf = await page.locator('.icon').screenshot({ omitBackground: true })
await fs.writeFile(OUT_PATH, buf)
await browser.close()
console.log(`✅ ${OUT_PATH} written (${buf.length} bytes)`)
