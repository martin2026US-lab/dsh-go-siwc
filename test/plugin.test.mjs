// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PluginStore } from '../lib/store.mjs'
import { Controller } from '../lib/controller.mjs'
import { SiwcSession } from '../lib/siwc.mjs'
import { panelView, wirePanel, PANEL } from '../lib/panel.mjs'
import { NOTICE_VERSION } from '../lib/policy.mjs'
const kitRoot=process.env.DSH_PLUGIN_KIT
const {createTestHost}=kitRoot ? await import(pathToFileURL(join(kitRoot,'lib/testing.js'))) : {}
const {checkView}=kitRoot ? await import(pathToFileURL(join(kitRoot,'lib/view-check.js'))) : {}

const credentials={access:'SYNTHETIC_ACCESS_TOKEN',refresh:'SYNTHETIC_REFRESH_TOKEN',idToken:'SYNTHETIC_ID_TOKEN',expiresAt:Date.now()+3600000}
async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'siwc-plugin-'))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const store=await new PluginStore(dir).init()
  return {dir,store}
}
async function grant(store) {
  await store.modify(state=>{
    state.active='subject/issued-client'
    state.profiles[state.active]={subject:'subject',clientId:'issued-client',email:'test@example.invalid',tokens:{...credentials}}
  })
}

test('default keeps tokens off disk and preserves account registration across engine restarts',async t=>{
  const {dir,store}=await fixture(t);await grant(store)
  for(const filename of await readdir(dir)) {
    const bytes=await readFile(join(dir,filename),'utf8')
    for(const token of Object.values(credentials).filter(v=>typeof v==='string'))assert(!bytes.includes(token))
  }
  assert.deepEqual(await readdir(dir),['registrations.json'])
  const restarted=await new PluginStore(dir).init(), state=await restarted.read()
  assert.equal(state.hostId,(await store.read()).hostId)
  assert.equal(state.profiles[state.active].clientId,'issued-client')
  assert.equal(state.profiles[state.active].tokens,undefined)
})

test('explicit remembering encrypts grants and retains rotating tokens after restart; forgetting removes persisted credentials',async t=>{
  const {dir,store}=await fixture(t);await grant(store)
  await store.setRemember(true)
  let restarted=await new PluginStore(dir).init()
  assert.equal(restarted.remember,true)
  assert.equal((await restarted.read()).profiles['subject/issued-client'].tokens.refresh,credentials.refresh)
  await restarted.modify(state=>{state.profiles[state.active].tokens.refresh='SYNTHETIC_ROTATED_REFRESH'})
  const encrypted=await readFile(restarted.vaultFile,'utf8');assert(!encrypted.includes('SYNTHETIC_'))
  restarted=await new PluginStore(dir).init()
  assert.equal((await restarted.read()).profiles['subject/issued-client'].tokens.refresh,'SYNTHETIC_ROTATED_REFRESH')
  await restarted.setRemember(false)
  assert.deepEqual(await readdir(dir),['registrations.json'])
  assert((await restarted.read()).profiles['subject/issued-client'].tokens)
  const afterExit=await new PluginStore(dir).init()
  assert.equal((await afterExit.read()).profiles['subject/issued-client'].tokens,undefined)
})

test('corrupted or missing persistent vault fails closed',async t=>{
  const {dir,store}=await fixture(t);await grant(store);await store.setRemember(true)
  await writeFile(store.vaultFile,'invalid')
  await assert.rejects(new PluginStore(dir).init(),{code:'siwc/storage'})
  await rm(store.vaultFile)
  await assert.rejects(new PluginStore(dir).init(),{code:'siwc/storage'})
})

test('all login, account, storage and confirmation states render within native SDK schema',{skip:!kitRoot?'Set DSH_PLUGIN_KIT to the host SDK':false},()=>{
  for(const locale of ['zh-CN','en-US'])for(const signedIn of [false,true])for(const settings of [false,true])for(const consent of [false,true])for(const phase of ['ready','waiting'])for(const dialog of [undefined,'remember','logout','background']) {
    const state={phase,signedIn,dialog,settings,consent,remember:true,active:'subject/client',accounts:[{id:'subject/client',email:'test@example.invalid'}]}
    const result=checkView(panelView(state,locale),{budget:'panel'})
    assert.equal(result.ok,true,JSON.stringify(result.issues))
  }
})

test('native panel requires explicit storage confirmation and publishes no credentials',{skip:!kitRoot?'Set DSH_PLUGIN_KIT to the host SDK':false},async t=>{
  const {store}=await fixture(t);await grant(store)
  const controller=new Controller()
  await controller.connect({requestController:new AbortController()},store)
  const host=createTestHost({dir:resolve(import.meta.dirname,'..')})
  host.ctx.inject(['dshGo'],ctx=>wirePanel(ctx,controller))
  t.after(()=>controller.dispose())
  await controller.action('ask-remember')
  await controller.action('remember-confirm',{value:{confirmed:false}})
  assert.equal(store.remember,false)
  const direct=controller.action('remember-confirm',{value:{confirmed:true}})
  assert.equal(direct.pending,undefined)
  assert.equal(store.remember,false)
  controller.action('ask-remember')
  const result=controller.action('remember-confirm',{value:{confirmed:true}})
  await result.result(new AbortController().signal)
  assert.equal(store.remember,true)
  const view=await host.view(PANEL,{sessionId:'synthetic-session'})
  assert.equal(checkView(view.view,{budget:'panel'}).ok,true)
  const serialized=JSON.stringify(view)
  for(const token of Object.values(credentials).filter(v=>typeof v==='string'))assert(!serialized.includes(token))
})

test('a UI refresh failure cannot roll back a committed login',async t=>{
  const {store}=await fixture(t);const controller=new Controller()
  controller.subscribe(()=>{throw Error('UI closed')})
  await grant(store);await controller.connect({requestController:new AbortController()},store)
  assert.equal(controller.state.signedIn,true)
  controller.dispose()
})

test('first login opens the browser without an unsolicited view refresh invalidating its link effect',async t=>{
  const {store}=await fixture(t), controller=new Controller()
  const session=new SiwcSession({store,
    fetch:async()=>new Response(JSON.stringify({access_token:'SYNTHETIC_ACCESS',refresh_token:'SYNTHETIC_REFRESH',
      expires_in:3600,id_token:'SYNTHETIC_ID',scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'})),
    verifyIdentity:async()=>({sub:'subject',email:'test@example.invalid'})})
  await controller.connect(session,store)
  await controller.action('privacy-confirm',{value:{confirmed:true}}).result(new AbortController().signal)
  t.after(()=>controller.dispose())
  const refreshes=[];controller.subscribe(value=>refreshes.push(value))
  const effect=await controller.action('login')
  assert.equal(effect.refresh,true,'The requesting control owns its refresh effect')
  assert(refreshes.every(value=>value===false),'No concurrent view invalidation before the authorization link is delivered')
  const authorization=new URL(effect.link)
  assert.equal(authorization.origin,'https://auth.openai.com')
  const callback=new URL(authorization.searchParams.get('redirect_uri'))
  callback.search=new URLSearchParams({code:'synthetic-code',state:authorization.searchParams.get('state'),client_id:'oaiapp_test'})
  const done=controller.login.done
  assert.equal((await fetch(callback)).status,200)
  await done
  assert.equal(controller.state.signedIn,true)
  assert(refreshes.some(value=>value===true),'Browser completion refreshes the signed-in view')
  assert(!JSON.stringify(controller.state).includes('SYNTHETIC_'))
})
