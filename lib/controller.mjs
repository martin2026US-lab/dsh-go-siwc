// SPDX-License-Identifier: MIT
import { SiwcError } from './siwc.mjs'
import { NOTICE_VERSION, PRIVACY_URL } from './policy.mjs'

/** UI owns no tokens: it receives account labels, counts and short safe errors. */
export class Controller {
  constructor() {
    this.state = {phase:'initializing',signedIn:false,accounts:[],remember:false}
    this.listeners = new Set(); this.disposed = false
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  notify(refreshView = true) { if (!this.disposed) for (const listener of this.listeners) { try { listener(refreshView) } catch {} } }
  async connect(session, store) { this.session = session; this.store = store; await this.update() }
  async update() {
    if (!this.store || this.disposed) return
    const shape=state=>JSON.stringify([state.phase,state.signedIn,state.active,state.remember,state.consent,state.background,state.accounts?.map(a=>a.id)])
    const before=shape(this.state)
    const saved = await this.store.read(), profile = saved.profiles[saved.active]
    this.state = { ...this.state, phase:this.login ? 'waiting' : 'ready', signedIn:!!profile?.tokens,
      account:profile?.email, active:saved.active, remember:this.store.remember,
      consent:saved.consent?.version===NOTICE_VERSION && saved.consent?.ownerOnly===true,
      background:saved.consent?.background===true,
      accounts:Object.entries(saved.profiles).map(([id,p])=>({id,email:p.email})),
    }
    this.notify(before!==shape(this.state))
  }
  unavailable() { this.state.phase='unavailable';this.state.error='此引擎版本暂不兼容，请查看插件说明';this.notify() }
  fail(error) { this.state.error = error instanceof SiwcError ? error.message : '操作未完成，请重试';this.notify() }
  defer(label, operation) {
    return {pending:{label,timeoutMs:60000},result:async signal=>{
      try { signal.throwIfAborted(); const value=await operation(signal);await this.update();return value ?? {patch:{account:this.state.account??'—',modelCount:this.state.modelCount??'—'}} }
      catch(error) { this.fail(error);return {toast:this.state.error.slice(0,40)} }
    }}
  }
  async begin(options = {}) {
    if(!this.state.consent)return {toast:'请先阅读并同意隐私及本人使用说明'}
    if (this.login?.url && !options.newAccount && !options.profileKey) return {link:this.login.url}
    this.cancel()
    this.state.settings=false
    this.state.error=undefined
    const controller=new AbortController(), attempt={controller}
    this.login=attempt;this.state.phase='waiting';this.notify(false)
    let notify,reject
    const authorization=new Promise((a,b)=>{notify=a;reject=b})
    const timer=setTimeout(()=>controller.abort(new Error('Login timeout')),5*60000);timer.unref?.()
    attempt.done=this.session.login({signal:controller.signal,notify:event=>{attempt.url=event.url;notify(event.url)},
      prompt:({signal})=>new Promise((_resolve,fail)=>{
        if(signal.aborted)return fail(signal.reason)
        signal.addEventListener('abort',()=>fail(signal.reason),{once:true})
      }),
    },options).then(async()=>{this.state.error=undefined;this.state.modelCount=undefined;await this.update()})
      .catch(error=>{if(!controller.signal.aborted)this.fail(error);reject(error)})
      .finally(async()=>{clearTimeout(timer);if(this.login===attempt){this.login=undefined;await this.update()}})
    try { return {link:await authorization,refresh:true} } catch(error) { this.fail(error);return {toast:this.state.error.slice(0,40)} }
  }
  cancel() { this.login?.controller.abort(new Error('Login cancelled'));this.login=undefined }
  action(action,event={}) {
    if (this.disposed) return {toast:'插件已停用'}
    if (!this.session) return {toast:'登录渠道尚未就绪'}
    switch(action) {
      case 'settings':this.state.settings=true;this.notify(false);return {refresh:true}
      case 'home':this.state.settings=false;this.notify(false);return {refresh:true}
      case 'usage':return {link:'https://chatgpt.com/settings/usage'}
      case 'privacy':return {link:PRIVACY_URL}
      case 'privacy-confirm':
        if(this.state.consent || event.value?.confirmed!==true)return {refresh:true}
        return this.defer('保存授权选择',async()=>{
          await this.store.modify(s=>{s.consent={version:NOTICE_VERSION,ownerOnly:true,background:false,acceptedAt:new Date().toISOString()}})
          this.session.onChange?.();return {toast:'已同意，仅限本人使用；后台任务默认关闭'}
        })
      case 'ask-background':
        if(!this.state.consent)return {toast:'请先同意隐私说明'}
        this.state.dialog='background';this.notify(false);return {refresh:true}
      case 'background-confirm':
        if(this.state.dialog!=='background' || !this.state.consent)return {toast:'请先查看后台使用说明'}
        this.state.dialog=undefined;this.notify(false)
        if(event.value?.confirmed!==true)return {refresh:true}
        return this.defer('保存后台授权',async()=>{await this.store.modify(s=>{s.consent.background=true});return {toast:'已允许本人定时任务及目标继续执行'}})
      case 'disable-background':return this.defer('停止后台授权',async()=>{
        this.session.requestController.abort();this.session.requestController=new AbortController()
        await this.store.modify(s=>{if(s.consent)s.consent.background=false});return {toast:'已关闭后台任务授权'}
      })
      case 'withdraw-consent':return this.defer('停止使用登录渠道',async()=>{
        this.cancel();this.session.requestController.abort();this.session.requestController=new AbortController()
        await this.store.modify(s=>{delete s.consent});this.session.onChange?.();return {toast:'已停止使用；可退出登录撤销会话'}
      })
      case 'login':return this.begin()
      case 'add-account':return this.begin({newAccount:true})
      case 'cancel-login':this.cancel();this.state.phase='ready';this.notify(false);return {refresh:true}
      case 'ask-remember':this.state.dialog='remember';this.notify(false);return {refresh:true}
      case 'ask-logout':this.state.dialog='logout';this.notify(false);return {refresh:true}
      case 'remember-confirm':
        if(this.state.dialog!=='remember')return {toast:'请先选择记住登录并确认保存方式'}
        this.state.dialog=undefined;this.notify(false)
        if(event.value?.confirmed!==true)return {refresh:true}
        return this.defer('保存登录',async()=>{await this.store.setRemember(true);return {toast:'已保存登录，请仅安装可信插件'}})
      case 'forget-login':return this.defer('清除持久登录',async()=>{await this.store.setRemember(false);return {toast:'已改为仅本次运行保留登录'}})
      case 'logout-confirm':
        if(this.state.dialog!=='logout')return {toast:'请先选择退出登录'}
        this.state.dialog=undefined;this.notify(false)
        if(event.value?.confirmed!==true)return {refresh:true}
        return this.defer('正在退出',async()=>{
          this.cancel();const result=await this.session.logout();this.state.modelCount=undefined
          this.state.error=result.revocationConfirmed?undefined:'本机已退出，请到 ChatGPT 设置确认断开'
          return {toast:result.revocationConfirmed?'已退出登录':'本机已退出，请到 ChatGPT 设置确认断开'}
        })
      case 'refresh-models':return this.defer('读取可用模型',async signal=>{
        this.session.catalog=undefined;const models=await this.session.models(signal);this.state.modelCount=models.length
        this.session.onChange();return {toast:`已读取 ${models.length} 个可用模型`}
      })
      case 'select-account':return this.defer('切换账户',async()=>{
        const id=event.value?.value, saved=await this.store.read()
        if(typeof id!=='string'||!saved.profiles[id])throw new SiwcError('identity')
        this.cancel()
        if(!saved.profiles[id].tokens) {
          // A subsequent click on Continue reauthorizes the selected registration.
          await this.session.switchAccount(id,{allowSignedOut:true});this.state.modelCount=undefined
          return {toast:'已选择账户，请点击 Continue with ChatGPT'}
        }
        await this.session.switchAccount(id);this.state.modelCount=undefined;return {toast:'已切换账户'}
      })
      default:return {toast:'不支持此操作'}
    }
  }
  dispose() { this.disposed=true;this.cancel();this.session?.requestController.abort();this.listeners.clear() }
}
