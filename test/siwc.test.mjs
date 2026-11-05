// SPDX-License-Identifier: MIT
// All credentials and HTTP responses in this suite are synthetic. No live OpenAI calls.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { EncryptedStore, SiwcSession, SIWC_ROUTE, RESOURCE, validateCallback, siwcPayload, installSiwc } from '../lib/siwc.mjs'

const direct = 'openid email offline_access resource.invoke chatgpt.tokens.use.direct'
const tokenResponse = (extra = {}) => ({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
  id_token: 'synthetic-id-token', expires_in: 3600, scope: direct, ...extra })
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-siwc-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return { dir, store: new EncryptedStore(join(dir, 'vault.json'), randomBytes(32)) }
}
async function saveGrant(store, extra = {}) {
  await store.modify(state => {
    state.active = 'subject/client'
    state.profiles[state.active] = { subject: 'subject', clientId: 'oaiapp_synthetic', email: 'test@example.invalid',
      tokens: { access: 'synthetic-access', refresh: 'synthetic-refresh', scopes: direct.split(' '), expiresAt: Date.now() + 3600000, ...extra } }
  })
}

test('encrypted atomic storage survives restart and rejects another key; tokens never appear on disk', async t => {
  const { store } = await fixture(t)
  await saveGrant(store)
  const raw = await readFile(store.filename, 'utf8')
  assert(!raw.includes('synthetic-access')); assert(!raw.includes('synthetic-refresh')); assert(!raw.includes('test@example'))
  assert.equal((await new EncryptedStore(store.filename, store.key).read()).active, 'subject/client')
  await assert.rejects(new EncryptedStore(store.filename, randomBytes(32)).read(), { code: 'siwc/storage' })
})

test('callback requires exact redirect, state, issued client, unique parameters and returning-client identity', () => {
  const pending = { origin: 'http://127.0.0.1:12345', state: 'expected' }
  const good = 'http://127.0.0.1:12345/auth/callback?state=expected&code=c&client_id=oaiapp_test'
  assert.equal(validateCallback(new URL(good), pending).clientId, 'oaiapp_test')
  for (const url of [good.replace('state=expected&',''), good.replace('expected','wrong'), good+'&state=expected',
    good.replace('127.0.0.1','localhost'),good.replace('/auth/callback','/callback'),good.replace('client_id=oaiapp_test','client_id=dynamic_agent_client')]) {
    assert.throws(() => validateCallback(new URL(url), pending), { code: 'siwc/state' })
  }
  assert.throws(() => validateCallback(new URL(good), { ...pending, clientId: 'other' }), { code: 'siwc/state' })
  assert.throws(() => validateCallback(new URL(pending.origin+'/auth/callback?error=access_denied&state=wrong'),pending), { code: 'siwc/state' })
})

test('login persists host and issued client, uses PKCE/nonce, and reuses registration after sign-out', async t => {
  const { store } = await fixture(t)
  let authorization, exchange, identityChecks = 0
  const session = new SiwcSession({ store, fetch: async (url, init) => {
    assert.equal(url, 'https://auth.openai.com/api/accounts/oauth/token')
    exchange = new URLSearchParams(init.body)
    return json(tokenResponse())
  }, verifyIdentity: async (token, clientId, nonce) => {
    assert.equal(clientId,'oaiapp_test'); assert.equal(nonce,authorization.searchParams.get('nonce')); identityChecks++
    return { sub: 'subject', email: 'test@example.invalid' }
  } })
  const interaction = () => ({ signal: new AbortController().signal,
    notify: event => { authorization = new URL(event.url) }, prompt: async () => {
      const callback = new URL(authorization.searchParams.get('redirect_uri'))
      callback.search = new URLSearchParams({ code: 'synthetic-code', state: authorization.searchParams.get('state'), client_id: 'oaiapp_test' })
      return callback.href
    } })
  await session.login(interaction())
  assert.equal(authorization.searchParams.get('client_id'),'dynamic_agent_client')
  assert.equal(authorization.searchParams.get('agent_name_hint'),'DSH Go SIWC')
  const { createHash } = await import('node:crypto')
  assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'),authorization.searchParams.get('code_challenge'))
  assert.equal(exchange.get('resource'),RESOURCE)
  assert.equal(exchange.get('redirect_uri'),authorization.searchParams.get('redirect_uri'))
  const host = authorization.searchParams.get('ext_agent_host_id')
  await store.modify(s => { delete s.profiles[s.active].tokens })
  await session.login(interaction())
  assert.equal(authorization.searchParams.get('client_id'),'oaiapp_test')
  assert.equal(authorization.searchParams.has('agent_name_hint'),false)
  assert.equal(authorization.searchParams.get('ext_agent_host_id'),host)
  assert.equal(identityChecks,2)
})

test('identity/nonce failure leaves previous account credentials intact', async t => {
  const { store } = await fixture(t);await saveGrant(store)
  let authorization
  const session = new SiwcSession({store,fetch:async()=>json(tokenResponse()),verifyIdentity:async()=>{throw Error('bad nonce')}})
  await assert.rejects(session.login({ signal:new AbortController().signal,notify:e=>{authorization=new URL(e.url)},prompt:async()=>{
    const uri=new URL(authorization.searchParams.get('redirect_uri'))
    uri.search=new URLSearchParams({state:authorization.searchParams.get('state'),code:'c',client_id:'oaiapp_synthetic'})
    return uri.href
  }}),{code:'siwc/identity'})
  assert.equal((await store.read()).profiles['subject/client'].tokens.access,'synthetic-access')
})

test('another account requires an explicit new registration and retains isolated credentials', async t => {
  const { store } = await fixture(t); await saveGrant(store)
  let authorization
  const session = new SiwcSession({ store, fetch: async () => json(tokenResponse()),
    verifyIdentity: async () => ({ sub: 'second-subject', email: 'second@example.invalid' }) })
  const interaction = () => ({ signal: new AbortController().signal, notify: event => { authorization = new URL(event.url) },
    prompt: async () => {
      const uri = new URL(authorization.searchParams.get('redirect_uri'))
      uri.search = new URLSearchParams({ state: authorization.searchParams.get('state'), code: 'synthetic', client_id: 'oaiapp_synthetic' })
      return uri.href
    } })
  await assert.rejects(session.login(interaction()), { code: 'siwc/identity' })
  assert.equal((await store.read()).profiles['subject/client'].tokens.access, 'synthetic-access')
  await session.login(interaction(), { newAccount: true })
  const state = await store.read()
  assert.equal(state.active, 'second-subject/oaiapp_synthetic')
  assert.equal(state.profiles['subject/client'].tokens.access, 'synthetic-access')
  assert.equal(state.profiles[state.active].subject, 'second-subject')
})

test('concurrent refresh rotates once; network failure preserves credentials',async t=>{
  const {store}=await fixture(t);await saveGrant(store,{expiresAt:0})
  let calls=0
  const session=new SiwcSession({store,fetch:async()=>{calls++;return json(tokenResponse({access_token:'rotated-access',refresh_token:'rotated-refresh'}))}})
  assert.deepEqual(await Promise.all(Array.from({length:10},()=>session.accessToken())),Array(10).fill('rotated-access'))
  assert.equal(calls,1);assert.equal((await store.read()).profiles['subject/client'].tokens.refresh,'rotated-refresh')
  await store.modify(s=>{s.profiles[s.active].tokens.expiresAt=0})
  session.fetch=async()=>{throw Error('network')}
  await assert.rejects(session.accessToken(),{code:'siwc/request'})
  assert.equal((await store.read()).profiles['subject/client'].tokens.refresh,'rotated-refresh')
})

test('terminal refresh failure invalidates only active account and never leaks response content',async t=>{
  const {store}=await fixture(t);await saveGrant(store,{expiresAt:0})
  await store.modify(s=>{s.profiles.other={tokens:{refresh:'other-account'}}})
  const session=new SiwcSession({store,fetch:async()=>new Response(JSON.stringify({error:'invalid_grant',refresh_token:'SENSITIVE_SYNTHETIC'}),{status:400})})
  await assert.rejects(session.accessToken(),e=>e.code==='siwc/token'&&!e.message.includes('SENSITIVE'))
  const state=await store.read();assert.equal(state.profiles[state.active].tokens,undefined);assert.equal(state.profiles.other.tokens.refresh,'other-account')
})

test('model discovery preserves visible catalog order and does not share another generation',async t=>{
  const {store}=await fixture(t);await saveGrant(store)
  const session=new SiwcSession({store,fetch:async(url,init)=>{
    assert.equal(url,RESOURCE+'/models');assert.equal(init.headers.Authorization,'Bearer synthetic-access')
    return json({models:[{slug:'b',display_name:'B',visibility:'list'},{slug:'hidden',visibility:'hide'},{slug:'a',visibility:'list'},{slug:'b',visibility:'list'}]})
  }})
  assert.deepEqual((await session.models()).map(m=>m.slug),['b','a'])
})

test('sign-out revokes rotating session or explicitly reports unconfirmed revocation',async t=>{
  const {store}=await fixture(t);await saveGrant(store)
  let revocation
  const session=new SiwcSession({store,fetch:async(url,init)=>{
    if(url.endsWith('openid-configuration'))return json({revocation_endpoint:'https://auth.openai.com/oauth/revoke'})
    revocation=new URLSearchParams(init.body);return new Response('',{status:200})
  }})
  assert.equal((await session.logout()).revocationConfirmed,true);assert.equal(revocation.get('client_id'),'oaiapp_synthetic')
  assert.equal((await session.status()).signedIn,false)
  await saveGrant(store);session.fetch=async()=>{throw Error('offline')}
  assert.equal((await session.logout()).revocationConfirmed,false);assert.equal((await session.status()).signedIn,false)
})

test('SIWC payload keeps local tools and history while enforcing route restrictions',()=>{
  const body=siwcPayload({temperature:1,max_output_tokens:20,previous_response_id:'x',store:true,stream:false,
    input:[{role:'system',content:'instructions'}],tools:[{type:'function',name:'read',parameters:{type:'object'}}]})
  assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.temperature,undefined);assert.equal(body.max_output_tokens,undefined)
  assert.equal(body.input[0].role,'developer');assert.equal(body.tools[0].type,'namespace');assert.equal(body.tools[0].tools[0].name,'read')
  assert.throws(()=>siwcPayload({input:[],tools:[{type:'tool_search'}]}),{code:'siwc/request'})
})

const fixtureRoot=process.env.DSH_TEST_ENGINE
test('real bundled DSH adapter: encrypted grant → dynamic model → mocked Responses SSE and tools',{
  skip:!fixtureRoot||!existsSync(join(fixtureRoot,'node_modules/@deepseek-ai/dsh/package.json'))?'Set DSH_TEST_ENGINE to the extracted runtime engine':false,
},async t=>{
  const {dir}=await fixture(t)
  const oldHome=process.env.DSH_HOME,oldFetch=globalThis.fetch
  process.env.DSH_HOME=dir
  t.after(()=>{globalThis.fetch=oldFetch;if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome})
  const require=createRequire(join(fixtureRoot,'package.json'))
  const hostImport=async name=>{
    if(name.startsWith('@earendil-works/pi-ai/')) return import(pathToFileURL(join(fixtureRoot,'node_modules/@earendil-works/pi-ai/dist',name.slice('@earendil-works/pi-ai/'.length)+'.js')).href)
    return import(pathToFileURL(require.resolve(name)).href)
  }
  let adapter,payload,requests=0,streamMode='normal'
  const ctx={get:()=>undefined,emit(){},llm:{registerAdapter(providers,value){assert.deepEqual(providers,[SIWC_ROUTE]);adapter=value}}}
  let authorized=true
  const session=await installSiwc(ctx,hostImport,randomBytes(32),{authorizeRequest:async()=>{if(!authorized)throw new Error('synthetic unauthorized origin')}})
  await saveGrant(session.store)
  const events=(tool)=>{
    const item=tool?{type:'function_call',id:'fc_1',call_id:'call_1',name:'read',namespace:'dsh',arguments:'{"path":"note"}',status:'completed'}:
      {type:'message',id:'msg_1',role:'assistant',content:[{type:'output_text',text:'done',annotations:[]}],status:'completed'}
    return [{type:'response.created',response:{id:'resp_1',status:'in_progress'}},
      {type:'response.output_item.added',output_index:0,item:tool?{...item,arguments:''}:{...item,content:[]}},
      ...(tool?[{type:'response.function_call_arguments.delta',output_index:0,item_id:'fc_1',delta:item.arguments}]:[
        {type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},
        {type:'response.output_text.delta',output_index:0,content_index:0,delta:'done'}]),
      {type:'response.output_item.done',output_index:0,item},
      {type:'response.completed',response:{id:'resp_1',status:'completed',output:[item],usage:{input_tokens:10,output_tokens:4,total_tokens:14}}}]
  }
  globalThis.fetch=async(url,init={})=>{
    const target=String(url instanceof Request?url.url:url)
    if(target===RESOURCE+'/models')return json({models:[{slug:'gpt-6.1-sol',display_name:'Test GPT',visibility:'list'}]})
    assert.equal(target,RESOURCE+'/responses','No unmocked network request is permitted')
    const request=url instanceof Request?url:null
    payload=JSON.parse(request?await request.text():init.body)
    assert.equal((request?.headers??new Headers(init.headers)).get('authorization'),'Bearer synthetic-access')
    if(streamMode==='network')throw new Error('SYNTHETIC_NETWORK_DISCONNECT')
    if(streamMode==='failed')return new Response('event: response.failed\ndata: '+JSON.stringify({type:'response.failed',response:{id:'synthetic',status:'failed',
      error:{code:'subscription_sharing_usage_limit_exceeded',message:'Synthetic quota limit'}}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}})
    const stream=events(requests++===0).map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join('')
    return new Response(stream,{headers:{'Content-Type':'text/event-stream'}})
  }
  session.fetch=(...args)=>globalThis.fetch(...args)
  assert.equal((await adapter.listModels(SIWC_ROUTE))[0].id,'gpt-6.1-sol')
  const options={provider:SIWC_ROUTE,model:'gpt-6.1-sol',system:'Test agent',messages:[{role:'user',content:[{type:'text',text:'read note'}]}],
    tools:[{name:'read',description:'Read a local file',parameters:{type:'object',properties:{path:{type:'string'}},required:['path']}}],signal:new AbortController().signal}
  const chunks=[];for await(const chunk of adapter.stream(options))chunks.push(chunk)
  assert.equal(payload.store,false);assert.equal(payload.stream,true);assert.equal(payload.max_output_tokens,undefined)
  assert(chunks.some(c=>c.blockType==='tool-call'||c.block?.type==='tool-call'),JSON.stringify(chunks))
  assert(chunks.some(c=>c.type==='usage'))
  assert.equal(chunks.at(-1).type,'finish')
  assert(!JSON.stringify(payload).includes('tool_search'))
  const { BlockAssembler, createAssistantMessage, createToolResultMessage } = await hostImport('@deepseek-ai/dsh-llm')
  const assembler = new BlockAssembler()
  for (const chunk of chunks) assembler.push(chunk)
  const content = assembler.blocks()
  const call = content.find(block => block.type === 'tool-call')
  assert(call, 'The model tool call reaches DSH intact')
  const assistant = createAssistantMessage({ content, source: { provider: SIWC_ROUTE, model: options.model, replayState: chunks.at(-1).replayState } })
  const result = createToolResultMessage({ callId: call.id, content: [{ type: 'text', text: 'local note contents' }], isError: false })
  const final=[];for await(const chunk of adapter.stream({...options,messages:[...options.messages,assistant,result]}))final.push(chunk)
  assert(final.some(c=>c.type==='text-delta'&&c.text==='done'))
  const wireCall=payload.input.find(item=>item.type==='function_call')
  const wireResult=payload.input.find(item=>item.type==='function_call_output')
  assert(wireCall&&wireResult);assert.equal(wireCall.call_id,wireResult.call_id)
  assert(JSON.stringify(wireResult).includes('local note contents'))
  const before=requests;authorized=false
  await assert.rejects(async()=>{for await(const _ of adapter.stream(options)){}},/unauthorized origin/)
  assert.equal(requests,before,'An unauthorized request never reaches Responses')
  authorized=true
  streamMode='failed'
  const failed=[];for await(const chunk of adapter.stream(options))failed.push(chunk)
  assert.equal(failed.at(-1).type,'finish');assert.equal(failed.at(-1).reason.kind,'error')
  streamMode='network'
  const offline=[];for await(const chunk of adapter.stream(options))offline.push(chunk)
  assert.equal(offline.at(-1).type,'finish');assert.equal(offline.at(-1).reason.kind,'error')
  streamMode='normal'
  const recovered=[];for await(const chunk of adapter.stream(options))recovered.push(chunk)
  assert(recovered.some(c=>c.type==='text-delta'&&c.text==='done'))
  const abort=new AbortController();abort.abort()
  const cancelled=[];for await(const chunk of adapter.stream({...options,signal:abort.signal}))cancelled.push(chunk)
  assert.equal(cancelled.at(-1).type,'finish');assert.notEqual(cancelled.at(-1).reason.kind,'stop')
})
