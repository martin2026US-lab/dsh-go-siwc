// SPDX-License-Identifier: MIT
import { join } from 'node:path'
import { hostImport } from './host-import.mjs'
import { installSiwc } from './siwc.mjs'
import { PluginStore } from './store.mjs'
import { Controller } from './controller.mjs'
import { wirePanel } from './panel.mjs'
import { AccessPolicy } from './policy.mjs'

export const name = 'local-openai-siwc'

export function apply(ctx) {
  const controller = new Controller()
  ctx.effect(() => () => controller.dispose())
  ctx.inject(['dshGo'], nativeCtx => wirePanel(nativeCtx,controller))
  ctx.inject(['llm'], engineCtx => {
    const ready = (async () => {
      // Validate host imports before opening storage; SDK load-only checks have no host services.
      await hostImport('@deepseek-ai/dsh-llm-pi-ai')
      const home = process.env.DSH_HOME ?? join(process.env.HOME,'.dsh')
      const store = await new PluginStore(join(home,'dsh-go/data/local-openai-siwc')).init()
      const policy=new AccessPolicy(store,()=>engineCtx.get('agents'))
      const session = await installSiwc(engineCtx,hostImport,undefined,{store,beforeAccess:()=>policy.consent(),
        authorizeRequest:options=>policy.authorize(options),onChange:()=>{
        controller.update().catch(error=>controller.fail(error))
      }})
      if(controller.disposed){session.requestController.abort();return}
      await controller.connect(session,store)
    })()
    ready.catch(error=>{
      controller.unavailable()
      engineCtx.logger?.warn(`ChatGPT SIWC plugin unavailable (${error?.code ?? error?.name ?? 'error'}); check supported engine version and private storage`)
    })
  })
}
