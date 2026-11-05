// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AccessPolicy, NOTICE_VERSION } from '../lib/policy.mjs'
import { Controller } from '../lib/controller.mjs'

const owner={kind:'user',principal:{kind:'owner'},rpcId:'synthetic'}
const event=source=>({type:'user/message',data:{role:'user',source,content:[]}})
function fixture(consent={version:NOTICE_VERSION,ownerOnly:true,background:false}) {
  const state={profiles:{},consent}, store={async read(){return structuredClone(state)},async modify(fn){return fn(state)}}
  const root={id:'root',session:{log:[event(owner)]}}, child={id:'child',session:{log:[event({kind:'agent-message',senderSessionId:'root'})]}}
  const agents={get:id=>[root,child].find(a=>a.id===id),list:()=>[root,child],isOwnedBy:(id,parent)=>id==='child'&&parent===root}
  return {state,store,root,child,policy:new AccessPolicy(store,()=>agents)}
}
test('privacy and ownership consent must precede login and any token access',async()=>{
  const {store,policy,state}=fixture(undefined);delete state.consent
  await assert.rejects(policy.consent(),{code:'siwc/consent'})
  let calls=0
  const controller=new Controller();await controller.connect({login(){calls++},requestController:new AbortController()},store)
  assert((await controller.action('login')).toast);assert.equal(calls,0)
  await controller.action('privacy-confirm',{value:{confirmed:false}})
  assert.equal(state.consent,undefined)
  await controller.action('privacy-confirm',{value:{confirmed:true}}).result(new AbortController().signal)
  assert.equal(state.consent.version,NOTICE_VERSION);assert.equal(state.consent.background,false)
  assert((await policy.consent()).ownerOnly)
  await controller.action('withdraw-consent').result(new AbortController().signal)
  await assert.rejects(policy.consent(),{code:'siwc/consent'})
  controller.dispose()
})
test('owner tool loop and owned subagent retain access; external and unattributed requests fail closed',async()=>{
  const {root,child,policy}=fixture()
  await policy.authorize({sessionId:'root'});await policy.authorize({sessionId:'child'})
  await assert.rejects(policy.authorize({}),{code:'siwc/origin'})
  await assert.rejects(policy.authorize({sessionId:'missing'}),{code:'siwc/origin'})
  root.session.log.push(event({kind:'user',principal:{kind:'channel-user'}}))
  await assert.rejects(policy.authorize({sessionId:'root'}),{code:'siwc/origin'})
  await assert.rejects(policy.authorize({sessionId:'child'}),{code:'siwc/origin'})
  root.session.log=[event(owner)];child.session.log.push(event({kind:'user'}))
  await assert.rejects(policy.authorize({sessionId:'child'}),{code:'siwc/origin'})
})
test('schedules and goal continuation require separate consent; consent never enables external requests',async()=>{
  const {root,child,policy,state}=fixture()
  for(const kind of ['schedule','goal']) {
    root.session.log=[event(owner),event({kind})]
    await assert.rejects(policy.authorize({sessionId:'root'}),{code:'siwc/background'})
    state.consent.background=true
    await policy.authorize({sessionId:'root'});await policy.authorize({sessionId:'child'})
    state.consent.background=false
  }
  state.consent.background=true
  for(const source of [{kind:'webhook'},{kind:'team-message'},{kind:'agent-message',senderSessionId:'foreign'},
    {kind:'user',principal:{kind:'bot'}},{kind:'user'}]) {
    root.session.log=[event(owner),event(source)]
    await assert.rejects(policy.authorize({sessionId:'root'}),{code:'siwc/origin'})
  }
})
test('background confirmation cannot be forged without opening the disclosure first',async()=>{
  const {store,state}=fixture(),controller=new Controller()
  await controller.connect({requestController:new AbortController()},store)
  assert.equal(controller.action('background-confirm',{value:{confirmed:true}}).pending,undefined)
  assert.equal(state.consent.background,false)
  controller.action('ask-background')
  await controller.action('background-confirm',{value:{confirmed:true}}).result(new AbortController().signal)
  assert.equal(state.consent.background,true)
  await controller.action('disable-background').result(new AbortController().signal)
  assert.equal(state.consent.background,false);controller.dispose()
})
