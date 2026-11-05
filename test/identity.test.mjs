// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { EncryptedStore, installSiwc } from '../lib/siwc.mjs'

const engine = process.env.DSH_TEST_ENGINE
test('production JOSE verifier checks signature, issuer, audience, expiry and nonce before committing credentials',{
  skip:!engine?'Set DSH_TEST_ENGINE to the extracted test engine':false,
},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'siwc-identity-')),previousFetch=globalThis.fetch
  t.after(async()=>{globalThis.fetch=previousFetch;await rm(directory,{recursive:true,force:true})})
  const require=createRequire(join(engine,'package.json'))
  const hostImport=async name=>{
    const filename=name.startsWith('@earendil-works/pi-ai/') ? join(engine,'node_modules/@earendil-works/pi-ai/dist',name.slice('@earendil-works/pi-ai/'.length)+'.js') : require.resolve(name)
    return import(pathToFileURL(filename))
  }
  const jose=await hostImport('jose')
  const {publicKey,privateKey}=await jose.generateKeyPair('RS256')
  const publicJwk={...await jose.exportJWK(publicKey),kid:'synthetic-key',alg:'RS256',use:'sig'}
  const store=new EncryptedStore(join(directory,'vault.json'),randomBytes(32))
  let authorization,scenario='valid'
  const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
  globalThis.fetch=async(url)=>{
    const target=String(url instanceof Request?url.url:url)
    if(target==='https://auth.openai.com/.well-known/openid-configuration')return json({issuer:'https://auth.openai.com',jwks_uri:'https://auth.openai.com/.well-known/jwks.json'})
    if(target==='https://auth.openai.com/.well-known/jwks.json')return json({keys:[publicJwk]})
    assert.equal(target,'https://auth.openai.com/api/accounts/oauth/token','No real network request is allowed')
    let jwt=await new jose.SignJWT({sub:'synthetic-subject',email:'synthetic@example.invalid',
      nonce:scenario==='nonce'?'wrong-nonce':authorization.searchParams.get('nonce')})
      .setProtectedHeader({alg:'RS256',kid:'synthetic-key'})
      .setIssuer(scenario==='issuer'?'https://untrusted.example.invalid':'https://auth.openai.com')
      .setAudience(scenario==='audience'?'another-client':'oaiapp_synthetic')
      .setIssuedAt().setExpirationTime(scenario==='expiry'?Math.floor(Date.now()/1000)-600:'5m').sign(privateKey)
    if(scenario==='signature')jwt=jwt.slice(0,jwt.lastIndexOf('.')+1)+'invalid'
    return json({access_token:'SYNTHETIC_ACCESS_'+scenario,refresh_token:'SYNTHETIC_REFRESH_'+scenario,
      id_token:jwt,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',expires_in:3600})
  }
  const session=await installSiwc({emit(){},get(){},llm:{registerAdapter(){}}},hostImport,undefined,{store})
  const interaction=()=>({signal:new AbortController().signal,notify:event=>{authorization=new URL(event.url)},prompt:async()=>{
    const callback=new URL(authorization.searchParams.get('redirect_uri'))
    callback.search=new URLSearchParams({state:authorization.searchParams.get('state'),code:'synthetic-code',client_id:'oaiapp_synthetic'})
    return callback.href
  }})
  await session.login(interaction())
  const before=await store.read(),key=before.active
  assert.equal(before.profiles[key].tokens.access,'SYNTHETIC_ACCESS_valid')
  for(scenario of ['signature','issuer','audience','expiry','nonce']) {
    await assert.rejects(session.login(interaction()),{code:'siwc/identity'})
    assert.equal((await store.read()).profiles[key].tokens.access,'SYNTHETIC_ACCESS_valid',scenario)
    assert.equal(authorization.searchParams.has('id_token_hint'),false,'ID tokens never enter native-plugin RPC effects')
  }
})
