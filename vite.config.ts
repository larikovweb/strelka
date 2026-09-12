import react from '@vitejs/plugin-react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

const version = process.env.GITHUB_SHA?.slice(0, 7) ?? `dev-${Date.now()}`

/** Пишет dist/version.json — приложение сверяет его и перезагружается после нового деплоя (вебвью Telegram кеширует index.html). */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    closeBundle() {
      mkdirSync('dist', { recursive: true })
      writeFileSync('dist/version.json', JSON.stringify({ version }))
    },
  }
}

export default defineConfig({
  base: '/strelka/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), versionFile()],
})
