// SPDX-License-Identifier: MIT
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

export async function hostImport(specifier) {
  for (const anchor of [process.argv[1], '/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js'].filter(Boolean)) {
    const require = createRequire(anchor)
    try { return await import(pathToFileURL(require.resolve(specifier)).href) } catch {}
    if (specifier.startsWith('@earendil-works/pi-ai/')) {
      const suffix = specifier.slice('@earendil-works/pi-ai/'.length)
      for (const directory of require.resolve.paths('@earendil-works/pi-ai') ?? []) {
        try { return await import(pathToFileURL(join(directory, '@earendil-works/pi-ai/dist', suffix + '.js')).href) } catch {}
      }
    }
  }
  throw Object.assign(new Error('DSH_SIWC_UNSUPPORTED_ENGINE'),{code:'DSH_SIWC_UNSUPPORTED_ENGINE'})
}
