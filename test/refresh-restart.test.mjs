// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp,rm,readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginStore } from '../lib/store.mjs'
import { SiwcSession } from '../lib/siwc.mjs'
import { AccessPolicy,NOTICE_VERSION } from '../lib/policy.mjs'

test('remembered expired grant refreshes once after restart; rotated replacement survives another restart and offline recovery',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'siwc-refresh-restart-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  let store=await new PluginStore(directory).init()
  await store.modify(s=>{s.active='a';s.consent={version:NOTICE_VERSION,ownerOnly:true,background:false};s.profiles.a={clientId:'oaiapp_synthetic',subject:'synthetic',
    tokens:{access:'SYNTHETIC_OLD_ACCESS',refresh:'SYNTHETIC_OLD_REFRESH',expiresAt:0,scopes:['chatgpt.tokens.use.direct']}}})
  await store.setRemember(true)
  store=await new PluginStore(directory).init();let calls=0
  const policy=new AccessPolicy(store,()=>undefined)
  const session=new SiwcSession({store,beforeAccess:()=>policy.consent(),fetch:async(url,init)=>{
    calls++;assert.equal(url,'https://auth.openai.com/api/accounts/oauth/token')
    const params=new URLSearchParams(init.body)
    assert.equal(params.get('refresh_token'),'SYNTHETIC_OLD_REFRESH');assert.equal(params.get('client_id'),'oaiapp_synthetic')
    assert.equal(params.get('scope'),null);assert.equal(params.get('resource'),'https://api.openai.com/v1')
    return new Response(JSON.stringify({access_token:'SYNTHETIC_NEW_ACCESS',refresh_token:'SYNTHETIC_NEW_REFRESH',expires_in:3600}))
  }})
  assert.deepEqual(await Promise.all(Array.from({length:12},()=>session.accessToken())),Array(12).fill('SYNTHETIC_NEW_ACCESS'))
  assert.equal(calls,1)
  for(const file of [store.metadataFile,store.vaultFile])assert(!(await readFile(file,'utf8')).includes('SYNTHETIC_'))
  store=await new PluginStore(directory).init()
  assert.equal((await store.read()).profiles.a.tokens.refresh,'SYNTHETIC_NEW_REFRESH')
  await store.modify(s=>{s.profiles.a.tokens.expiresAt=0})
  const offline=new SiwcSession({store,fetch:async()=>{throw Error('disconnected')}})
  await assert.rejects(offline.accessToken(),{code:'siwc/request'})
  store=await new PluginStore(directory).init()
  assert.equal((await store.read()).profiles.a.tokens.refresh,'SYNTHETIC_NEW_REFRESH')
  const revoked=new SiwcSession({store,fetch:async()=>new Response(JSON.stringify({error:'invalid_grant'}),{status:400})})
  await assert.rejects(revoked.accessToken(),{code:'siwc/token'})
  assert.equal((await new PluginStore(directory).init().then(s=>s.read())).profiles.a.tokens,undefined)
})
