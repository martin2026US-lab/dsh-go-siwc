// SPDX-License-Identifier: MIT
export const PANEL = 'chatgpt-account'
const isEnglish = locale => String(locale).startsWith('en')
const words = locale => isEnglish(locale) ? {
  title:'ChatGPT sign-in', signedIn:'Signed in', signedOut:'Signed out', waiting:'Complete sign-in in your browser', ready:'Preparing provider…',
  account:'Current account', models:'Models', storage:'Remember login', memory:'Off',
  remembered:'On', login:'Continue with ChatGPT', reopen:'Open browser', cancel:'Cancel',
  add:'Add account', refresh:'Refresh models', usage:'Usage settings', logout:'Sign out', remember:'Remember login', forget:'Stop remembering',
  rememberWarning:'Save login credentials in the DSH private directory? Tools and plugins with access to that directory can read them. This does not use Android Keystore.',
  logoutWarning:'Revoke this account’s renewable session and sign out?', yes:'Confirm', no:'Cancel',
  hint:'After signing in, choose a model under ChatGPT (SIWC) in the usual model picker. Usage draws from the account’s eligible ChatGPT plan.',
  privacy:'Before connecting: OpenAI receives your sign-in, model requests, conversation context, images and tool outputs selected by DSH. This plugin has no developer-operated server or analytics. DSH and other plugins have their own data practices.',
  privacyMore:'Account labels and client registrations stay on this host. Tokens stay in memory unless you explicitly remember login. Remembered tokens use AES-GCM with a key in the same private directory, accessible to trusted host tools/plugins. Only use your own account on your own runtime; no sharing, pooling, resale or general API proxy. Background tasks require separate consent.',
  ownership:'Use only your own account on your own runtime. No sharing, resale, quota bypass or general API proxy. Background tasks need separate consent.',
  accept:'I agree', privacyLink:'Privacy notice', withdraw:'Withdraw consent', settings:'More settings', back:'Back',
  background:'Allow background', disableBackground:'Disable background', backgroundLabel:'Background tasks', on:'Allowed', off:'Off',
  backgroundWarning:'Allow this DSH runtime’s schedules and goal continuations for your own tasks to use your ChatGPT plan while the app is in the background? They can consume quota until you cancel the tasks or disable this consent. This does not authorize anyone else’s requests.',
} : {
  title:'ChatGPT 登录', signedIn:'已登录', signedOut:'未登录', waiting:'请在系统浏览器中完成登录', ready:'正在准备登录渠道…',
  account:'当前账户', models:'可用模型', storage:'记住登录', memory:'未开启',
  remembered:'已开启', login:'Continue with ChatGPT', reopen:'打开浏览器', cancel:'取消登录',
  add:'添加账户', refresh:'刷新模型', usage:'用量设置', logout:'退出登录', remember:'记住登录', forget:'取消记住',
  rememberWarning:'将登录信息保存在 DSH 私有目录？允许访问此目录的工具和插件可以读取登录信息。此方式不使用 Android Keystore。',
  logoutWarning:'撤销此账户的可续期会话，并退出登录？', yes:'确认', no:'取消',
  hint:'在模型选择器中选择 ChatGPT (SIWC)，使用本人符合条件的套餐。',
  privacy:'OpenAI 会接收登录资料，以及 DSH 选入请求的对话、图片和工具结果。插件无中转或分析上报；宿主和其他插件另有数据处理方式。',
  privacyMore:'登记资料留在本机，凭据默认仅在内存。记住登录使用 AES-GCM，密钥也在同一私有目录；有权限的工具和插件可以读取，不使用 Android Keystore。',
  ownership:'仅在本人控制的运行环境使用本人账户，不共享、转售、绕过限额或提供通用 API 代理。后台任务默认关闭，需要另行授权。',
  accept:'同意并继续', privacyLink:'隐私说明', withdraw:'撤回同意', settings:'更多设置', back:'返回',
  background:'允许后台任务', disableBackground:'关闭后台任务', backgroundLabel:'后台任务', on:'已允许', off:'未开启',
  backgroundWarning:'允许此 DSH 运行环境的本人定时任务及目标继续执行，在应用切到后台后使用 ChatGPT 套餐？任务可能持续消耗额度，直到取消任务或关闭此授权。这不授权其他人的请求。',
}

export function panelView(state, locale = 'zh') {
  const w = words(locale)
  const text=(value,style={},muted=false)=>({type:'text',text:value,style:{size:'body',...style},...(muted?{tone:'muted'}:{})})
  const actions=items=>({type:'actions',items})
  const children = [
    text(state.phase==='initializing'?w.ready:state.phase==='waiting'?w.waiting:state.signedIn?w.signedIn:w.signedOut,
      {size:'subtitle',weight:'semibold',...(state.signedIn?{color:'green'}:{})}),
  ]
  if(state.account)children.push({type:'stack',style:{gap:'S'},children:[text(w.account,{size:'caption'},true),text({$:'data.account'})]})
  if (state.error) children.push(text(state.error,{},true))
  if (state.dialog) {
    children.push(text(state.dialog==='remember'?w.rememberWarning:state.dialog==='background'?w.backgroundWarning:w.logoutWarning),
      {type:'confirm',id:state.dialog+'-confirm',confirmLabel:w.yes,cancelLabel:w.no})
  } else if(state.phase==='ready' && !state.consent) {
    children.push(text(w.privacy),text(w.privacyMore),text(w.ownership),actions([{label:w.privacyLink,action:'privacy'}]),
      {type:'confirm',id:'privacy-confirm',confirmLabel:w.accept,cancelLabel:w.no})
    if(state.signedIn)children.push(actions([{label:w.logout,action:'ask-logout'}]))
  } else if (state.consent && state.phase !== 'initializing' && state.phase !== 'unavailable') {
    if(state.settings) {
      children.push({type:'keyValue',items:[{label:w.storage,value:state.remember?w.remembered:w.memory},
        {label:w.backgroundLabel,value:state.background?w.on:w.off}]})
      if(state.accounts?.length>1)children.push({type:'options',id:'select-account',
        options:state.accounts.map((a,i)=>({label:`${a.email??'ChatGPT'} · ${i+1}`,value:a.id})),selected:state.active})
      children.push(actions([{label:w.add,action:'add-account'},{label:w.logout,action:'ask-logout'}]),
        actions([{label:state.background?w.disableBackground:w.background,action:state.background?'disable-background':'ask-background'}]),
        actions([{label:w.privacyLink,action:'privacy'},{label:w.withdraw,action:'withdraw-consent'}]),
        actions([{label:w.back,action:'home',style:'primary'}]))
    } else {
    children.push({type:'keyValue',items:[{label:w.models,value:{$:'data.modelCount'}},
      {label:w.storage,value:state.remember?w.remembered:w.memory}]},text(w.hint,{size:'caption'},true))
    children.push({type:'actions',items:state.phase === 'waiting' ? [
      {label:w.reopen,action:'login',style:'primary'},{label:w.cancel,action:'cancel-login'},
    ] : state.signedIn ? [
      {label:w.refresh,action:'refresh-models',style:'primary'},
    ] : [{label:w.login,action:'login',style:'primary'}]})
    if(state.phase!=='waiting')children.push(actions([
      {label:state.remember?w.forget:w.remember,action:state.remember?'forget-login':'ask-remember'},
      {label:w.usage,action:'usage'}]),actions([{label:w.settings,action:'settings'}]))
    }
  }
  return {type:'stack',v:2,accent:'app',title:w.title,style:{gap:'M'},children}
}

export function wirePanel(ctx, controller) {
  const bridge = ctx.dshGo
  const refresh = needed => { if(needed)bridge.refresh(PANEL) }
  const remove = controller.subscribe(refresh)
  ctx.effect(() => remove)
  bridge.panel(PANEL, {
    view: (_scope,caps) => panelView(controller.state,caps?.locale),
    data: (_scope,emit) => {
      const update = () => emit({ account:controller.state.account ?? '—', modelCount:controller.state.modelCount ?? '—' })
      update(); return controller.subscribe(update)
    },
    actions: Object.fromEntries(['login','cancel-login','refresh-models','ask-logout','logout-confirm','ask-remember',
      'remember-confirm','forget-login','add-account','select-account','usage','privacy','privacy-confirm',
      'ask-background','background-confirm','disable-background','withdraw-consent','settings','home'].map(action=>[
        action,(_scope,event)=>controller.action(action,event),
      ])),
  })
}
