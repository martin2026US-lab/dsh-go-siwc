// SPDX-License-Identifier: MIT
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { EncryptedStore, SiwcError } from './siwc.mjs'

async function atomic(filename, data) {
  const temp = filename + '.' + randomUUID() + '.tmp'
  const file = await open(temp, 'wx', 0o600)
  try { await file.writeFile(data); await file.sync() } finally { await file.close() }
  await rename(temp, filename)
}
const registrations = state => ({ ...state, profiles: Object.fromEntries(
  Object.entries(state.profiles).map(([id, profile]) => { const { tokens, ...metadata } = profile; return [id, metadata] })) })

/** Default: tokens never touch disk. Remembering is a separate user action. */
export class PluginStore {
  constructor(directory) {
    this.directory = directory; this.queue = Promise.resolve(); this.remember = false
    this.metadataFile = join(directory, 'registrations.json')
    this.keyFile = join(directory, 'storage-key.bin'); this.vaultFile = join(directory, 'credentials.enc.json')
  }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    try { this.state = JSON.parse(await readFile(this.metadataFile, 'utf8')) }
    catch (error) {
      if (error.code !== 'ENOENT') throw new SiwcError('storage')
      this.state = { version: 1, hostId: 'urn:uuid:' + randomUUID(), profiles: {} }
      await atomic(this.metadataFile, JSON.stringify(this.state))
    }
    if (this.state.version !== 1 || !this.state.profiles || typeof this.state.hostId !== 'string') throw new SiwcError('storage')
    let key
    try { key = await readFile(this.keyFile) } catch (error) { if (error.code !== 'ENOENT') throw new SiwcError('storage') }
    if (key) {
      this.vault = new EncryptedStore(this.vaultFile, key)
      // A surviving key without a vault is a storage failure, not a fresh account.
      try { await readFile(this.vaultFile) } catch { throw new SiwcError('storage') }
      this.state = await this.vault.read(); this.remember = true
    }
    return this
  }
  async read() { return structuredClone(this.state) }
  async write(value) {
    if (this.remember) await this.vault.write(value)
    this.state = structuredClone(value)
    await atomic(this.metadataFile, JSON.stringify(registrations(value)))
  }
  modify(fn) {
    const result = this.queue.then(async () => {
      const state = await this.read(), value = await fn(state)
      await this.write(state); return value
    })
    this.queue = result.catch(() => {}); return result
  }
  setRemember(value) {
    const result = this.queue.then(async () => {
      if (value === this.remember) return
      if (value) {
        const key = randomBytes(32), vault = new EncryptedStore(this.vaultFile, key)
        await vault.write(this.state)
        await atomic(this.keyFile, key)
        this.vault = vault; this.remember = true
      } else {
        // Remove the key first. Existing in-memory credentials remain usable until exit.
        for (const filename of [this.keyFile, this.vaultFile]) {
          try { await unlink(filename) } catch (error) { if (error.code !== 'ENOENT') throw new SiwcError('storage') }
        }
        this.remember = false; this.vault?.key.fill(0); this.vault = undefined
      }
    })
    this.queue = result.catch(() => {}); return result
  }
}
