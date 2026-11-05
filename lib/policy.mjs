// SPDX-License-Identifier: MIT
import { SiwcError } from './siwc.mjs'

export const NOTICE_VERSION = '2026-11-05'
export const PRIVACY_URL = 'https://github.com/martin2026US-lab/dsh-go-siwc/blob/main/PRIVACY.md'

/** This is a consent boundary within a trusted, single-owner DSH runtime,
 * not a sandbox against other plugins or the owner's shell. */
export class AccessPolicy {
  constructor(store, agents) { this.store=store;this.agents=agents }
  async consent() {
    const policy=(await this.store.read()).consent
    if(policy?.version!==NOTICE_VERSION || policy.ownerOnly!==true)throw new SiwcError('consent')
    return policy
  }
  async authorize(options) {
    const consent=await this.consent(), agents=this.agents()
    const agent=typeof options.sessionId==='string' ? agents?.get(options.sessionId) : undefined
    if(!agent)throw new SiwcError('origin')
    const visited=new Set()
    const inspect=current=>{
      if(visited.has(current.id))throw new SiwcError('origin')
      visited.add(current.id)
      // Runtime ownership is checked through the public registry, not a model-supplied parent ID.
      const parent=agents.list().find(candidate=>agents.isOwnedBy(current.id,candidate))
      const events=current.session?.log
      if(!Array.isArray(events))throw new SiwcError('origin')
      const contextKinds=new Set(['runtime-context','model-selection','user-approval','tool-registry','skill-invocation',
        'plan-mode','session-reference','subagent-settled','user-question-reply','working-directory','ptc-mode','compact-checkpoint'])
      const trigger=[...events].reverse().find(e=>e.type==='user/message' && !contextKinds.has(e.data?.source?.kind))?.data?.source
      if(trigger?.principal && trigger.principal.kind!=='owner')throw new SiwcError('origin')
      if(trigger?.kind==='webhook' || trigger?.kind==='team-message')throw new SiwcError('origin')
      if(parent) {
        if(!['user','schedule','goal','agent-message'].includes(trigger?.kind))throw new SiwcError('origin')
        if(trigger.kind==='agent-message' && trigger.senderSessionId!==parent.id)throw new SiwcError('origin')
        if(trigger?.kind==='user' && trigger.principal?.kind!=='owner')throw new SiwcError('origin')
        if(['schedule','goal'].includes(trigger?.kind) && !consent.background)throw new SiwcError('background')
        return inspect(parent)
      }
      if(trigger?.kind==='user') {
        if(trigger.principal?.kind!=='owner')throw new SiwcError('origin')
        return
      }
      if(['schedule','goal'].includes(trigger?.kind)) {
        if(!consent.background)throw new SiwcError('background')
        const owner=[...events].reverse().find(e=>e.type==='user/message' && e.data?.source?.kind==='user')?.data?.source
        if(owner?.principal?.kind==='owner')return
      }
      throw new SiwcError('origin')
    }
    inspect(agent)
  }
}
