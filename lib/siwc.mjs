// SPDX-License-Identifier: MIT
// DSH Go's independent SIWC public-client integration. Protocol reference:
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in
// No code from the separately licensed OpenAI DevKit is incorporated here.
import { randomBytes, randomUUID, createHash, createCipheriv, createDecipheriv } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const SIWC_ROUTE = 'openai-siwc'
export const RESOURCE = 'https://api.openai.com/v1'
const AUTH = 'https://auth.openai.com'
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const DIRECT_SCOPE = 'chatgpt.tokens.use.direct'
const CALLBACK_PATH = '/auth/callback'
const ERROR_MESSAGES = {
  state: '登录回调校验失败，请重新登录', identity: '账号身份校验失败，请重新登录',
  denied: '未获得 ChatGPT 套餐使用授权，请重新授权', token: '登录凭据已失效，请重新登录',
  request: 'OpenAI 暂时无法完成请求，请稍后重试', storage: '无法读取加密登录信息，请检查本机安全存储',
  callback: '无法启动本机登录回调，请稍后重试', models: '未能读取此账号的可用模型，请重试',
  consent: '请先在 ChatGPT 登录面板阅读并同意隐私及本人使用说明',
  origin: '无法确认请求来自本机所有者；此登录渠道不支持共享账号、消息机器人或通用 API 代理',
  background: '请先在 ChatGPT 登录面板明确允许本人后台任务使用套餐',
}
export class SiwcError extends Error {
  constructor(kind, status) {
    super(ERROR_MESSAGES[kind] ?? ERROR_MESSAGES.request)
    this.name = 'SiwcError'
    this.code = `siwc/${kind}`
    if (status !== undefined) this.status = status
  }
}

/** AES-GCM storage. The caller owns key protection; this plugin does not use Android Keystore. */
export class EncryptedStore {
  constructor(filename, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new SiwcError('storage')
    this.filename = filename
    this.key = key
    this.queue = Promise.resolve()
  }
  async read() {
    let encoded
    try { encoded = await readFile(this.filename, 'utf8') } catch (e) {
      if (e.code === 'ENOENT') return { version: 1, hostId: `urn:uuid:${randomUUID()}`, profiles: {} }
      throw new SiwcError('storage')
    }
    try {
      const envelope = JSON.parse(encoded)
      if (envelope.version !== 1) throw new Error('schema')
      const cipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'base64'))
      cipher.setAAD(Buffer.from('DSH-Go-SIWC-v1'))
      cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
      const state = JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.data, 'base64')), cipher.final()]).toString('utf8'))
      if (state.version !== 1 || typeof state.hostId !== 'string' || !state.profiles || typeof state.profiles !== 'object') throw new Error('schema')
      return state
    } catch { throw new SiwcError('storage') }
  }
  async write(value) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from('DSH-Go-SIWC-v1'))
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    const encoded = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    const temp = `${this.filename}.${randomUUID()}.tmp`
    const file = await open(temp, 'wx', 0o600)
    try { await file.writeFile(encoded); await file.sync() } finally { await file.close() }
    await rename(temp, this.filename)
  }
  modify(fn) {
    const result = this.queue.then(async () => {
      const state = await this.read()
      const value = await fn(state)
      await this.write(state)
      return value
    })
    this.queue = result.catch(() => {})
    return result
  }
}

export function validateCallback(url, pending) {
  if (url.origin !== pending.origin || url.pathname !== CALLBACK_PATH ||
      url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== pending.state) throw new SiwcError('state')
  if (url.searchParams.has('error')) throw new SiwcError('denied')
  const code = url.searchParams.get('code')
  const clientId = url.searchParams.get('client_id') || pending.clientId
  if (!code || url.searchParams.getAll('code').length !== 1 || !clientId || clientId === 'dynamic_agent_client' ||
      url.searchParams.getAll('client_id').length > 1 || (pending.clientId && clientId !== pending.clientId)) throw new SiwcError('state')
  return { code, clientId }
}

async function callbackListener(state, clientId, signal) {
  let resolve, reject
  const result = new Promise((a, b) => { resolve = a; reject = b })
  result.catch(() => {})
  let pending, claimed = false
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (req.method !== 'GET' || claimed) { res.writeHead(400); res.end('Invalid callback'); return }
    try {
      const url = new URL(req.url, pending.origin)
      if (url.pathname !== CALLBACK_PATH) { res.writeHead(404); res.end(); return }
      const value = validateCallback(url, pending)
      claimed = true
      res.end('DSH Go: authorization received. You can return to the app.')
      resolve(value)
    } catch (error) {
      res.writeHead(400); res.end('Authorization not completed. Return to DSH Go.')
      if (error.code === 'siwc/denied') reject(error)
    }
  })
  try {
    await new Promise((a, b) => { server.once('error', b); server.listen(0, '127.0.0.1', a) })
    signal.throwIfAborted()
    pending = { state, clientId, origin: `http://127.0.0.1:${server.address().port}` }
  } catch { server.close(); throw new SiwcError('callback') }
  const abort = () => reject(signal.reason ?? new Error('Login cancelled'))
  signal.addEventListener('abort', abort, { once: true })
  return { result, pending, redirectUri: pending.origin + CALLBACK_PATH, close() {
    signal.removeEventListener('abort', abort); server.close(); server.closeAllConnections()
  } }
}

export class SiwcSession {
  constructor({ store, fetch: fetcher = globalThis.fetch, verifyIdentity, onChange = () => {}, beforeAccess = async()=>{} }) {
    this.store = store; this.fetch = fetcher; this.verifyIdentity = verifyIdentity; this.onChange = onChange
    this.refreshing = undefined; this.catalog = undefined; this.generation = 0
    this.requestController = new AbortController(); this.signingOut = false
    this.beforeAccess=beforeAccess
  }
  async status() {
    const state = await this.store.read(), profile = state.profiles[state.active]
    return { id: SIWC_ROUTE, signedIn: !!profile?.tokens, ...(profile ? { account: profile.email ?? 'ChatGPT' } : {}) }
  }
  async json(url, init = {}) {
    let response
    try { response = await this.fetch(url, { ...init, redirect: 'error', signal: init.signal ?? AbortSignal.timeout(20000) }) }
    catch (error) { if (init.signal?.aborted) throw error; throw new SiwcError('request') }
    if (!response.ok) {
      let code
      try { const body = await response.json(); code = typeof body.error === 'string' ? body.error : body.error?.code } catch {}
      if (['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'].includes(code)) throw new SiwcError('token', response.status)
      throw new SiwcError('request', response.status)
    }
    try { return await response.json() } catch { throw new SiwcError('request') }
  }
  tokenRequest(params, signal) {
    return this.json(AUTH + '/api/accounts/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, resource: RESOURCE }), signal })
  }
  tokenSet(data, previous) {
    const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/) : previous?.scopes
    if (!scopes?.includes(DIRECT_SCOPE)) throw new SiwcError('denied')
    if (typeof data.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string' || !data.refresh_token ||
        !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new SiwcError('token')
    return { access: data.access_token, refresh: data.refresh_token, idToken: data.id_token ?? previous?.idToken,
      expiresAt: Date.now() + data.expires_in * 1000, scopes, earliestRefreshAt: data.earliest_refresh_at }
  }
  async login(interaction, { newAccount = false, profileKey } = {}) {
    await this.beforeAccess()
    // Persist host ID before opening the browser. Keep the previous active grant until verification succeeds.
    const saved = await this.store.modify(state => structuredClone(state))
    const previous = newAccount ? undefined : saved.profiles[profileKey ?? saved.active]
    const clientId = previous?.clientId ?? (newAccount ? undefined : saved.pendingClientId)
    const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    const listener = await callbackListener(state, clientId, interaction.signal)
    const manualAbort = new AbortController()
    try {
      const params = new URLSearchParams({ client_id: clientId ?? 'dynamic_agent_client', ext_agent_host_id: saved.hostId,
        response_type: 'code', redirect_uri: listener.redirectUri, scope: SCOPES, resource: RESOURCE,
        state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') })
      if (!clientId) params.set('agent_name_hint', 'DSH Go SIWC')
      // Authorization URLs cross the host's native-plugin RPC. Keep ID tokens out of them.
      interaction.notify({ url: AUTH + '/api/accounts/authorize?' + params })
      const manual = interaction.prompt({ kind: 'text', placeholder: listener.redirectUri,
        signal: AbortSignal.any([interaction.signal, manualAbort.signal]) }).then(input => {
        try { return validateCallback(new URL(input.trim()), listener.pending) } catch { throw new SiwcError('state') }
      })
      const callback = await Promise.race([listener.result, manual])
      interaction.signal.throwIfAborted()
      if (!clientId) await this.store.modify(state => { state.pendingClientId = callback.clientId })
      const data = await this.tokenRequest({ grant_type: 'authorization_code', client_id: callback.clientId,
        code: callback.code, code_verifier: verifier, redirect_uri: listener.redirectUri }, interaction.signal)
      let identity
      try { identity = await this.verifyIdentity(data.id_token, callback.clientId, nonce, interaction.signal) }
      catch { throw new SiwcError('identity') }
      if (!identity?.sub || (previous && previous.subject !== identity.sub)) throw new SiwcError('identity')
      const tokens = this.tokenSet(data)
      interaction.signal.throwIfAborted()
      await this.store.modify(state => {
        const key = `${identity.sub}/${callback.clientId}`
        interaction.signal.throwIfAborted()
        state.profiles[key] = { clientId: callback.clientId, subject: identity.sub, email: identity.email, tokens }
        state.active = key; delete state.pendingClientId
      })
      this.generation++; this.catalog = undefined; this.onChange()
      this.requestController.abort(); this.requestController = new AbortController()
      return { status: 'authorized' }
    } finally { manualAbort.abort(); listener.close() }
  }
  async accessToken(signal) {
    await this.beforeAccess()
    signal?.throwIfAborted()
    if (this.signingOut) throw new SiwcError('token')
    const state = await this.store.read(), profileKey = state.active, profile = state.profiles[profileKey]
    if (!profile?.tokens) throw new SiwcError('token')
    if (profile.tokens.expiresAt > Date.now() + 60000) return profile.tokens.access
    if (!this.refreshing) {
      this.refreshing = this.store.modify(async state => {
        const profile = state.profiles[profileKey]
        if (!profile?.tokens) throw new SiwcError('token')
        if (profile.tokens.expiresAt > Date.now() + 60000) return profile.tokens.access
        const data = await this.tokenRequest({ grant_type: 'refresh_token', client_id: profile.clientId, refresh_token: profile.tokens.refresh })
        profile.tokens = this.tokenSet(data, profile.tokens)
        return profile.tokens.access
      }).catch(async error => {
        if (error.code === 'siwc/token') {
          await this.store.modify(state => { const p = state.profiles[profileKey]; if (p) delete p.tokens })
          this.generation++; this.catalog = undefined; this.onChange()
        }
        throw error
      }).finally(() => { this.refreshing = undefined })
    }
    const token = await this.refreshing
    signal?.throwIfAborted()
    return token
  }
  async models(signal) {
    await this.beforeAccess()
    if (this.catalog && this.catalog.until > Date.now()) return this.catalog.models
    const generation = this.generation
    const token = await this.accessToken(signal)
    const data = await this.json(RESOURCE + '/models', { headers: { Authorization: `Bearer ${token}` }, signal })
    if (!Array.isArray(data.models)) throw new SiwcError('models')
    const seen = new Set()
    const models = data.models.filter(m => m?.visibility === 'list' && typeof m.slug === 'string' && m.slug && !seen.has(m.slug) && seen.add(m.slug))
    if (this.generation !== generation) throw new SiwcError('token')
    this.catalog = { models, until: Date.now() + 5 * 60000 }
    return models
  }
  async switchAccount(profileKey, { allowSignedOut = false } = {}) {
    this.requestController.abort()
    await this.refreshing?.catch(() => {})
    try {
      await this.store.modify(state => {
        if (!state.profiles[profileKey] || (!allowSignedOut && !state.profiles[profileKey].tokens)) throw new SiwcError('token')
        state.active = profileKey
      })
      this.generation++; this.catalog = undefined; this.onChange()
    } finally { this.requestController = new AbortController() }
  }
  async logout() {
    this.signingOut = true
    this.requestController.abort()
    // Wait for any rotating refresh before revoking and clearing its replacement.
    await this.refreshing?.catch(() => {})
    let confirmed = true
    try { await this.store.modify(async state => {
      const profile = state.profiles[state.active]
      if (!profile?.tokens) return
      try {
        const metadata = await this.json(AUTH + '/.well-known/openid-configuration')
        const endpoint = new URL(metadata.revocation_endpoint)
        if (endpoint.origin !== AUTH) throw new Error('revocation origin')
        const response = await this.fetch(endpoint.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: profile.tokens.refresh, token_type_hint: 'refresh_token', client_id: profile.clientId }) })
        confirmed = response.status === 200
      } catch { confirmed = false }
      delete profile.tokens
    }) } finally { this.signingOut = false; this.requestController = new AbortController() }
    this.generation++; this.catalog = undefined; this.onChange()
    return { revocationConfirmed: confirmed }
  }
}

const UNSUPPORTED = ['background','conversation','max_output_tokens','max_tool_calls','metadata','moderation','multi_agent',
  'prompt','prompt_cache_retention','prompt_cache_options','safety_identifier','temperature','top_logprobs','top_p','truncation','user','previous_response_id']
export function siwcPayload(body) {
  const result = { ...body, store: false, stream: true }
  for (const key of UNSUPPORTED) delete result[key]
  result.input = (result.input ?? []).map(item => item.role === 'system' ? { ...item, role: 'developer' } : item)
  if (result.tools?.length) {
    if (result.tools.some(tool => !['function','custom','namespace','web_search'].includes(tool.type))) throw new SiwcError('request')
    const local = result.tools.filter(t => ['function','custom'].includes(t.type))
    result.tools = [...result.tools.filter(t => !['function','custom'].includes(t.type)), ...(local.length ? [{ type: 'namespace', name: 'dsh', description: 'DSH Go local agent tools', tools: local }] : [])]
  }
  if (result.input.some(item => ['tool_search_call','tool_search_output','configuration_update'].includes(item.type))) throw new SiwcError('request')
  return result
}

/** Reuse the existing DSH/pi-ai history, image, tool, usage and SSE machinery. */
export async function installSiwc(ctx, hostImport, storageKey, options = {}) {
  const [{ PiAiAdapter }, { createProvider }, { openAIResponsesApi }, llm, jose] = await Promise.all([
    hostImport('@deepseek-ai/dsh-llm-pi-ai'), hostImport('@earendil-works/pi-ai/models'),
    hostImport('@earendil-works/pi-ai/api/openai-responses.lazy'), hostImport('@deepseek-ai/dsh-llm'), hostImport('jose'),
  ])
  let jwks
  const store = options.store ?? new EncryptedStore(join(process.env.DSH_HOME ?? join(process.env.HOME, '.dsh'), 'dsh-app/siwc.enc.json'), storageKey)
  const session = new SiwcSession({ store, beforeAccess:options.beforeAccess, onChange: () => { ctx.emit('llm/adapters-updated'); options.onChange?.() },
    async verifyIdentity(token, audience, nonce, signal) {
      if (!jwks) {
        const discovery = await fetch(AUTH + '/.well-known/openid-configuration', { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), redirect: 'error' })
        if (!discovery.ok) throw new Error('discovery')
        const metadata = await discovery.json(), uri = new URL(metadata.jwks_uri)
        if (metadata.issuer !== AUTH || uri.origin !== AUTH) throw new Error('issuer')
        jwks = jose.createRemoteJWKSet(uri)
      }
      const { payload } = await jose.jwtVerify(token, jwks, { issuer: AUTH, audience, algorithms: ['RS256'], requiredClaims: ['sub','exp','iat','nonce'], clockTolerance: 30 })
      if (payload.nonce !== nonce) throw new Error('nonce')
      return payload
    },
  })
  const api = openAIResponsesApi()
  const wrap = fn => (model, context, options) => fn(model, context, { ...options, onPayload: siwcPayload })
  const wiredApi = { ...api, stream: wrap(api.stream), streamSimple: wrap(api.streamSimple) }
  let profiles = new Map()
  const emptyCredentials = { async read() {}, async list() { return [] }, async modify() { throw new Error('SIWC credentials are owned by DSH Go') } }
  class Adapter extends PiAiAdapter {
    providerInfo(provider) { return { id: provider, name: 'ChatGPT (SIWC)' } }
    async load(signal) {
      const models = await session.models(signal)
      if (this.loaded === models) return
      // Entitlements come only from the account catalog. Bundled entries supply optional capabilities, not access.
      const { openaiProvider } = await hostImport('@earendil-works/pi-ai/providers/openai')
      const known = new Map(openaiProvider().getModels().map(m => [m.id, m]))
      this.knownCapacity = new Set()
      const descriptors = models.map(raw => {
        const base = known.get(raw.slug)
        if (Number.isFinite(raw.context_window) && raw.context_window > 0 || base?.contextWindow) this.knownCapacity.add(raw.slug)
        return { ...base, id: raw.slug, name: raw.display_name ?? raw.slug, provider: SIWC_ROUTE,
          api: 'openai-responses', baseUrl: RESOURCE, type: 'chat',
          input: Array.isArray(raw.input_modalities) ? raw.input_modalities : base?.input ?? ['text'],
          reasoning: base?.reasoning ?? false,
          contextWindow: Number.isFinite(raw.context_window) && raw.context_window > 0 ? raw.context_window : base?.contextWindow ?? 32768,
          maxTokens: base?.maxTokens ?? 4096,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          compat: { ...base?.compat, supportsDeveloperRole: true, supportsMidConvoSystemMessages: true,
            supportsAdditionalTools: true, supportsToolSearch: false, supportsMidConvoEffort: false, supportsMaxOutputTokens: false },
        }
      })
      const piProvider = createProvider({ id: SIWC_ROUTE, name: 'ChatGPT (SIWC)', baseUrl: RESOURCE,
        auth: { apiKey: { name: 'ChatGPT access token', async resolve({ credential }) {
          return credential?.key ? { auth: { apiKey: credential.key }, source: 'DSH Go SIWC' } : undefined
        } } }, models: descriptors, api: wiredApi })
      profiles = new Map([[SIWC_ROUTE, { displayName: 'ChatGPT (SIWC)', piProvider,
        modelErrors: new Map(), configuredMaxTokens: new Map(), streamIdleTimeoutMs: 120000,
        requestImagePixelBudget: 4194304, requestImageMaxBytes: 1048576,
      }]])
      this.loaded = models
    }
    async listModels(provider) {
      if (!(await session.status()).signedIn) return []
      try { await session.beforeAccess() } catch(error) { if(error.code==='siwc/consent')return [];throw error }
      await this.load()
      return super.listModels(provider)
    }
    async resolveModel(provider, model, signal) { await this.load(signal); return super.resolveModel(provider, model, signal) }
    async prepareCall(provider, model, signal) { await this.load(signal); return super.prepareCall(provider, model, signal) }
    modelInfo(snapshot, provider, model) {
      const info = super.modelInfo(snapshot, provider, model)
      if (!this.knownCapacity?.has(model)) delete info.context
      return info
    }
    async *streamWithSnapshot(call, snapshot) {
      if(!options.authorizeRequest)throw new SiwcError('origin')
      await options.authorizeRequest(call)
      yield* super.streamWithSnapshot({ ...call, signal: call.signal
        ? AbortSignal.any([call.signal, session.requestController.signal]) : session.requestController.signal }, snapshot)
    }
  }
  const adapter = new Adapter({ profiles: () => profiles, auth: { credentials: emptyCredentials },
    resolveApiKey: () => session.accessToken(), resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => llm.resolveImageAttachmentAccess(attachments, path => ctx.get('fs')?.processPathFromHostPath(path), ref),
  })
  ctx.llm.registerAdapter([SIWC_ROUTE], adapter)
  return session
}
