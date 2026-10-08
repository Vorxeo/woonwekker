'use strict';
/* Woonwekker account — localStorage demo only */
const ACC_KEY='woonwekker-account';
const FAV_KEY='woonwekker-favourites';
const AVATAR_MAX=400*1024;
const DEFAULT_TEMPLATES={
  bezichtiging:'Beste {naam},\n\nIk heb met interesse uw woning bekeken en zou graag een bezichtiging inplannen. Wanneer past het u?\n\nMet vriendelijke groet',
  kennismaking:'Beste {naam},\n\nIk stel me graag kort voor: ik zoek een huurwoning en vind uw aanbod interessant. Mag ik meer informatie of een bezichtiging aanvragen?\n\nMet vriendelijke groet',
  student:'Beste {naam},\n\nAls student ben ik op zoek naar woonruimte en heb interesse in uw woning. Is deze nog beschikbaar voor studenten, en wanneer kan ik langskomen?\n\nMet vriendelijke groet'
};
const CHECK_KEYS=['checkId','checkIncome','checkEmployer','checkBank','checkKvK','checkDeposit','checkRefs'];
let accTab='profile';
let pipeTab='fav';
let serverAuthed=false; // true only after Google or email-confirm session

function defaultAccount(){
  return{
    profile:{name:'',email:'',phone:'',plan:'kijken',bellenPaid:false,avatar:'',income:'',bio:''},
    zoekprofielen:[],
    alerts:{email:true,whatsapp:false,phone:''},
    notifications:{emailConfirmed:false,city:'',maxPrice:'',type:''},
    templates:{...DEFAULT_TEMPLATES},
    zoekgenoot:{name:'',email:''},
    pipeline:{reacted:[],visited:[]},
    checklist:Object.fromEntries(CHECK_KEYS.map(k=>[k,false]))
  };
}

const INCOME_OK=new Set(['','lt2','2to3','3to4','4to5','5plus']);
const PLAN_OK=new Set(['kijken','bellen']);

function hasBellenAccess(a){
  // Authority = server-verified entitlement (window.wwIsBellen). localStorage plan/bellenPaid is display-only.
  if(typeof window.wwIsBellen==='function')return !!window.wwIsBellen();
  return false;
}
function coercePlan(p){
  if(typeof window.wwIsBellen==='function')return window.wwIsBellen()?'bellen':'kijken';
  return 'kijken';
}
function sanitizeAvatar(v){
  const s=String(v||'').trim();
  if(!s)return'';
  // Google profile pictures (https only, googleusercontent host)
  if(/^https:\/\/lh[0-9]\.googleusercontent\.com\/[\w.\/=?&%-]+$/i.test(s))return s.slice(0,500);
  if(!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(s))return'';
  // rough byte estimate from base64 length
  if(Math.floor(s.length*0.75)>AVATAR_MAX)return'';
  return s;
}
function sanitizeZoekEntry(z){
  if(typeof WWWekker!=='undefined'&&WWWekker.sanitizeZoekprofiel)return WWWekker.sanitizeZoekprofiel(z);
  const o=z&&typeof z==='object'?z:{};
  const TYPE_OK=new Set(['','Appartement','Huis','Studio','Kamer']);
  const type=TYPE_OK.has(String(o.type||''))?String(o.type||''):'';
  const dig=v=>String(v==null?'':v).replace(/[^\d]/g,'').slice(0,7);
  return{
    id:String(o.id||'').slice(0,40),
    name:String(o.name||'').trim().slice(0,60),
    city:String(o.city||'').trim().slice(0,80),
    maxPrice:dig(o.maxPrice),
    minBeds:(()=>{const s=dig(o.minBeds).slice(0,2);if(!s)return'';const n=Math.min(20,Math.max(0,Number(s)));return String(n)})(),
    type,
    active:!!o.active
  };
}
function sanitizeZoekprofielen(list){
  if(!Array.isArray(list))return[];
  return list.slice(0,4).map(sanitizeZoekEntry).filter(z=>z.id||z.name||z.city);
}

function sanitizeNotifications(raw){
  const o=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const TYPE_OK=new Set(['Appartement','Huis','Studio','Kamer']);
  const type=TYPE_OK.has(String(o.type||''))?String(o.type):'';
  const digits=String(o.maxPrice==null?'':o.maxPrice).replace(/[^\d]/g,'').slice(0,7);
  return {
    emailConfirmed:o.emailConfirmed===true,
    city:String(o.city||'').trim().slice(0,80),
    maxPrice:digits,
    type
  };
}
function sanitizeProfile(p){
  const o=p&&typeof p==='object'?p:{};
  // Display-only: mirror wwIsBellen if present; never trust a raw localStorage paid flag.
  const entitled=typeof window.wwIsBellen==='function'?!!window.wwIsBellen():false;
  const plan=entitled?'bellen':'kijken';
  const paid=entitled;
  return{
    name:String(o.name||'').trim().slice(0,80),
    email:String(o.email||'').trim().slice(0,120),
    phone:String(o.phone||'').trim().slice(0,40),
    plan,
    bellenPaid:paid,
    avatar:sanitizeAvatar(o.avatar),
    income:INCOME_OK.has(String(o.income||''))?String(o.income||''):'',
    bio:String(o.bio||'').trim().slice(0,600)
  };
}
function loadAccount(){
  const base=defaultAccount();
  try{
    const raw=JSON.parse(localStorage.getItem(ACC_KEY)||'null');
    if(!raw||typeof raw!=='object')return base;
    return{
      profile:sanitizeProfile({...base.profile,...(raw.profile||{})}),
      zoekprofielen:sanitizeZoekprofielen(raw.zoekprofielen),
      alerts:{...base.alerts,...(raw.alerts||{})},
      notifications:sanitizeNotifications(raw.notifications),
      templates:{...base.templates,...(raw.templates||{})},
      zoekgenoot:{...base.zoekgenoot,...(raw.zoekgenoot||{})},
      pipeline:{
        reacted:Array.isArray(raw.pipeline?.reacted)?raw.pipeline.reacted.filter(u=>typeof u==='string'):[],
        visited:Array.isArray(raw.pipeline?.visited)?raw.pipeline.visited.filter(u=>typeof u==='string'):[]
      },
      checklist:{...base.checklist,...(raw.checklist||{})}
    };
  }catch{return base}
}

function saveAccount(data){
  try{localStorage.setItem(ACC_KEY,JSON.stringify(data))}catch{}
}

function isLoggedIn(a){
  return !!serverAuthed && !!(a.profile&&a.profile.email&&a.profile.name);
}

function favourites(){
  try{
    const a=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');
    return Array.isArray(a)?a.filter(v=>typeof v==='string'):[];
  }catch{return[]}
}

function setFavourites(urls){
  try{localStorage.setItem(FAV_KEY,JSON.stringify([...new Set(urls)]))}catch{}
}

function uid(){return 'z'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

function initials(name){
  const p=String(name||'').trim().split(/\s+/).filter(Boolean);
  if(!p.length)return'?';
  return((p[0][0]||'')+(p.length>1?p[p.length-1][0]:'')).toUpperCase();
}

function listingByUrl(url){
  if(typeof listings==='undefined'||!Array.isArray(listings))return null;
  return listings.find(p=>p.url===url)||null;
}

function statusEl(msg){
  const n=document.querySelector('#acc-status');
  if(n)n.textContent=msg||'';
}

function incomeKey(v){return({lt2:'incomeLt2','2to3':'income2to3','3to4':'income3to4','4to5':'income4to5','5plus':'income5plus'})[v]||''}
function avatarHtml(profile){
  if(profile.avatar)return`<img class="ww-avatar" src="${esc(profile.avatar)}" alt="">`;
  return`<div class="ww-avatar-fallback" aria-hidden="true">${esc(initials(profile.name))}</div>`;
}

function renderAccount(){
  const a=loadAccount();
  if(!isLoggedIn(a)){
    const q=new URLSearchParams(location.search);
    if(q.get('oauth')||q.get('confirmed')||q.get('confirm')||q.get('checkout')){
      main.innerHTML=`<p class="loading" role="status">Woonwekker…</p>`;
      Promise.resolve()
        .then(()=>handleOAuthQuery())
        .then(()=>handleConfirmQuery())
        .then(()=>handleCheckoutQuery())
        .then(()=>{
          if(isLoggedIn(loadAccount())) renderAccount();
          else location.replace('/login/?next='+encodeURIComponent('/account/'));
        });
      return;
    }
    location.replace('/login/?next='+encodeURIComponent('/account/'));
    return;
  }
  const plan=hasBellenAccess(a)?'bellen':'kijken';
  const tabs=[
    ['profile',t('profileTitle')],
    ['zoek',t('zoekprofielen')],
    ['notify',t('notifyTitle')],
    ['alerts',t('alertsTitle')],
    ['reactie',t('reactieTitle')],
    ['zoekgenoot',t('zoekgenootTitle')],
    ['pipeline',t('pipelineTitle')],
    ['checklist',t('checklistTitle')]
  ];
  if(!tabs.some(([k])=>k===accTab))accTab='profile';
  main.innerHTML=`<div class="ww-account">
    <div class="page-head compact">
      <div class="eyebrow">${esc(t('account'))}</div>
      <h1>${esc(t('accountTitle'))}</h1>
      <p class="lead">${esc(t('accountIntro'))}</p>
      <p class="ww-status">${esc(t('accountDemo'))}</p>
    </div>
    <div class="ww-avatar-row">
      ${avatarHtml(a.profile)}
      <div>
        <strong>${esc(a.profile.name)}</strong>
        <div style="color:var(--muted);font-size:14px">${esc(a.profile.email)}</div>
        ${a.profile.income?`<div class="ww-chip-soft">${esc(t('income'))}: ${esc(t(incomeKey(a.profile.income))||a.profile.income)}</div>`:''}
        ${a.profile.bio?`<p class="ww-bio-preview">${esc(a.profile.bio)}</p>`:''}
        <span class="ww-plan-badge ${plan==='bellen'?'bellen':''}">${esc(plan==='bellen'?t('planBellen'):t('planKijken'))}</span>
        <p class="ww-cancel-link"><a href="/opzeggen/">${esc(t('footerCancel'))}</a></p>
      </div>
    </div>
    <div class="ww-tabs" role="tablist">${tabs.map(([k,label])=>`<button type="button" role="tab" data-acc-tab="${k}" aria-selected="${accTab===k}">${esc(label)}</button>`).join('')}</div>
    <div id="acc-panel"></div>
    <p class="ww-status" id="acc-status" role="status"></p>
    <div class="ww-actions"><button type="button" class="ww-btn secondary" id="acc-logout">${esc(t('logout'))}</button></div>
  </div>`;
  document.querySelectorAll('[data-acc-tab]').forEach(b=>b.onclick=()=>{accTab=b.dataset.accTab;renderAccount()});
  document.querySelector('#acc-logout').onclick=async()=>{
    try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'})}catch{}
    serverAuthed=false;
    const fresh=defaultAccount();
    saveAccount(fresh);
    accTab='profile';
    syncNavAuth();
    renderAccount();
  };
  drawAccountPanel(a);
  bindWwCheckoutButtons(main);
  handleCheckoutQuery();
  handleOAuthQuery();
}

function authShell(opts){
  const title=opts.title, intro=opts.intro, eyebrow=opts.eyebrow||t('account');
  const pending=opts.pending;
  let mid='';
  if(pending){
    mid=`<div class="ww-check-inbox" role="status"><strong>${esc(t('checkInboxTitle')||t('checkInbox'))}</strong><p>${esc(t('checkInbox'))}</p></div>`;
  }else{
    mid=`<div class="ww-google-wrap">
        <a class="ww-btn ww-btn-google" id="acc-google" href="/api/auth/google">${esc(t('continueGoogle'))}</a>
        <p class="ww-status" id="acc-google-status" role="status"></p>
      </div>${opts.body||''}`;
  }
  return `<div class="ww-account ww-auth-page">
    <div class="page-head compact">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(title)}</h1>
      <p class="lead">${esc(intro)}</p>
    </div>
    <div class="ww-panel ww-gate ww-auth-card">
      <div class="ww-avatar-fallback" aria-hidden="true">W</div>
      ${mid}
      <p class="ww-status" id="acc-status" role="status"></p>
      <p class="ww-auth-legal">${esc(t('authLegalNote')||'')}<br><a href="/voorwaarden/">${esc(t('footerTerms'))}</a> · <a href="/privacy/">${esc(t('privacy')||'Privacy')}</a></p>
      ${opts.footer||''}
    </div>
  </div>`;
}

function showCheckInboxPanel(){
  const card=document.querySelector('.ww-auth-card');
  if(!card)return;
  const google=card.querySelector('.ww-google-wrap');
  const form=card.querySelector('#acc-signup-form, #acc-login-resend, .ww-or, .ww-auth-extra');
  [google, form].forEach(el=>{if(el)el.remove()});
  card.querySelectorAll('.ww-or, #acc-signup-form, .ww-auth-extra, .ww-auth-switch').forEach(el=>el.remove());
  if(!card.querySelector('.ww-check-inbox')){
    const note=document.createElement('div');
    note.className='ww-check-inbox';
    note.setAttribute('role','status');
    note.innerHTML=`<strong>${esc(t('checkInboxTitle')||'')}</strong><p>${esc(t('checkInbox'))}</p>`;
    const status=card.querySelector('#acc-status');
    if(status)card.insertBefore(note,status);
    else card.appendChild(note);
  }
}

async function submitEmailSignup({name,email,phone,btn}){
  if(btn)btn.disabled=true;
  statusEl(t('signupSending')||'…');
  try{
    const r=await fetch('/api/auth/signup',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,email,phone})
    });
    let j={};
    try{j=await r.json()}catch{}
    if(r.status===503||j.error==='resend_unavailable'){
      statusEl(t('resendNotConfigured'));
      return false;
    }
    if(r.status===429){
      statusEl(t('signupRateLimited'));
      return false;
    }
    if(!r.ok){
      statusEl(t('signupFailed'));
      return false;
    }
    try{sessionStorage.setItem('ww-pending-signup',JSON.stringify({name,email,phone}))}catch{}
    statusEl(t('checkInbox'));
    showCheckInboxPanel();
    return true;
  }catch{
    statusEl(t('signupFailed'));
    return false;
  }finally{
    if(btn)btn.disabled=false;
  }
}

function renderSignup(){
  const a=loadAccount();
  if(isLoggedIn(a)){location.replace('/account/');return}
  const q=new URLSearchParams(location.search);
  const pending=q.get('pending')==='1';
  main.innerHTML=authShell({
    title:t('signupTitle')||t('signUp'),
    intro:t('signupIntro')||t('accountDemo'),
    eyebrow:t('signUp'),
    pending,
    body:`<div class="ww-or"><span>${esc(t('orEmail')||t('orLocal'))}</span></div>
      <form id="acc-signup-form" class="ww-grid2 ww-auth-form" style="text-align:left;margin-top:8px">
        <div class="ww-field"><label for="signup-name">${esc(t('name'))}</label><input id="signup-name" name="name" required autocomplete="name" value="${esc(a.profile.name||'')}"></div>
        <div class="ww-field"><label for="signup-email">${esc(t('email'))}</label><input id="signup-email" name="email" type="email" required autocomplete="email" value="${esc(a.profile.email||'')}"></div>
        <div class="ww-field" style="grid-column:1/-1"><label for="signup-phone">${esc(t('phoneOptional')||t('phone'))}</label><input id="signup-phone" name="phone" type="tel" autocomplete="tel" value="${esc(a.profile.phone||'')}"></div>
        <p class="ww-status ww-auth-extra" style="grid-column:1/-1">${esc(t('passwordNote')||'')}</p>
        <div class="ww-actions" style="grid-column:1/-1"><button class="ww-btn" type="submit" id="acc-signup-btn">${esc(t('signupEmail'))}</button></div>
      </form>`,
    footer:`<p class="ww-auth-switch">${esc(t('hasAccount'))} <a href="/login/">${esc(t('goLogin')||t('signIn'))}</a></p>`
  });
  const form=document.querySelector('#acc-signup-form');
  if(form)form.onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(form);
    const name=String(fd.get('name')||'').trim();
    const email=String(fd.get('email')||'').trim();
    const phone=String(fd.get('phone')||'').trim();
    if(!name||!email)return;
    await submitEmailSignup({name,email,phone,btn:document.querySelector('#acc-signup-btn')});
  };
  refreshGoogleButtonState();
  handleOAuthQuery();
  handleConfirmQuery();
}

function renderLoginPage(){
  const a=loadAccount();
  if(isLoggedIn(a)){
    const next=new URLSearchParams(location.search).get('next');
    const dest=(next&&next.startsWith('/')&&!next.startsWith('//'))?next:'/account/';
    location.replace(dest);
    return;
  }
  main.innerHTML=authShell({
    title:t('loginTitle'),
    intro:t('loginIntro')||t('accountDemo'),
    eyebrow:t('signIn'),
    body:`<div class="ww-auth-extra">
        <p class="ww-status" style="text-align:left;margin-top:18px">${esc(t('emailLoginHint'))}</p>
        <form id="acc-login-resend" class="ww-grid2 ww-auth-form" style="text-align:left;margin-top:8px">
          <div class="ww-field"><label for="login-name">${esc(t('name'))}</label><input id="login-name" name="name" required autocomplete="name" value="${esc(a.profile.name||'')}"></div>
          <div class="ww-field"><label for="login-email">${esc(t('email'))}</label><input id="login-email" name="email" type="email" required autocomplete="email" value="${esc(a.profile.email||'')}"></div>
          <div class="ww-actions" style="grid-column:1/-1"><button class="ww-btn secondary" type="submit" id="acc-resend-btn">${esc(t('resendConfirm'))}</button></div>
        </form>
      </div>`,
    footer:`<p class="ww-auth-switch">${esc(t('needAccount'))} <a href="/signup/">${esc(t('goSignup')||t('signUp'))}</a></p>`
  });
  const form=document.querySelector('#acc-login-resend');
  if(form)form.onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(form);
    const name=String(fd.get('name')||'').trim();
    const email=String(fd.get('email')||'').trim();
    if(!name||!email)return;
    await submitEmailSignup({name,email,phone:'',btn:document.querySelector('#acc-resend-btn')});
  };
  refreshGoogleButtonState();
  handleOAuthQuery();
  handleConfirmQuery();
}

function renderLogin(a){
  // Legacy alias — route to dedicated signup when mode=signup, else login page
  const mode=new URLSearchParams(location.search).get('mode');
  if(mode==='signup'){location.replace('/signup/'+(location.search.replace(/[?&]mode=signup/,'').replace(/^&/,'?')||''));return}
  location.replace('/login/'+(location.search||''));
}

function drawAccountPanel(a){
  const panel=document.querySelector('#acc-panel');
  if(!panel)return;
  if(accTab==='profile')panel.innerHTML=profilePanel(a);
  else if(accTab==='zoek')panel.innerHTML=zoekPanel(a);
  else if(accTab==='notify')panel.innerHTML=notificationsPanel(a);
  else if(accTab==='alerts')panel.innerHTML=alertsPanel(a);
  else if(accTab==='reactie')panel.innerHTML=reactiePanel(a);
  else if(accTab==='zoekgenoot')panel.innerHTML=zoekgenootPanel(a);
  else if(accTab==='pipeline')panel.innerHTML=pipelinePanel(a);
  else if(accTab==='checklist')panel.innerHTML=checklistPanel(a);
  bindAccountPanel(a);
}

function profilePanel(a){
  const p=a.profile;
  return`<div class="ww-panel">
    <h2>${esc(t('profileTitle'))}</h2>
    <div class="ww-avatar-row">
      ${avatarHtml(p)}
      <div class="ww-field" style="flex:1">
        <label for="prof-avatar">${esc(t('avatar'))}</label>
        <input id="prof-avatar" type="file" accept="image/*">
        <p class="ww-status">${esc(t('avatarHint'))}</p>
        ${p.avatar?`<button type="button" class="ww-btn secondary" id="prof-avatar-clear" style="margin-top:8px">×</button>`:''}
      </div>
    </div>
    <form id="prof-form" class="ww-grid2">
      <div class="ww-field"><label for="prof-name">${esc(t('name'))}</label><input id="prof-name" name="name" required value="${esc(p.name)}"></div>
      <div class="ww-field"><label for="prof-email">${esc(t('email'))}</label><input id="prof-email" name="email" type="email" required value="${esc(p.email)}"></div>
      <div class="ww-field"><label for="prof-phone">${esc(t('phone'))}</label><input id="prof-phone" name="phone" type="tel" value="${esc(p.phone||'')}"></div>
      <div class="ww-field"><label>${esc(t('plan'))}</label>
        <p class="ww-status">${esc(hasBellenAccess(a)?t('planBellen'):t('planKijken'))}</p>
        ${hasBellenAccess(a)?`<p><a href="/opzeggen/">${esc(t('footerCancel'))}</a></p>`:`<p><a class="ww-btn secondary" href="/prijzen/">${esc(t('upgradeBellen'))}</a></p>`}
      </div>
      <div class="ww-field"><label for="prof-income">${esc(t('income'))}</label>
        <select id="prof-income" name="income">
          <option value="">${esc(t('incomeUnset'))}</option>
          ${[['lt2','incomeLt2'],['2to3','income2to3'],['3to4','income3to4'],['4to5','income4to5'],['5plus','income5plus']].map(([v,k])=>`<option value="${v}" ${p.income===v?'selected':''}>${esc(t(k))}</option>`).join('')}
        </select>
        <p class="ww-status">${esc(t('incomeHint'))}</p>
      </div>
      <div class="ww-field" style="grid-column:1/-1"><label for="prof-bio">${esc(t('bio'))}</label>
        <textarea id="prof-bio" name="bio" rows="4" maxlength="600" placeholder="${esc(t('bioPlaceholder'))}">${esc(p.bio||'')}</textarea>
        <p class="ww-status">${esc(t('bioHint'))}</p>
      </div>
      <div class="ww-actions" style="grid-column:1/-1"><button class="ww-btn" type="submit">${esc(t('saveProfile'))}</button></div>
    </form>
  </div>`;
}

function notificationsPanel(a){
  const n=sanitizeNotifications(a&&a.notifications);
  const email=a&&a.profile&&a.profile.email?a.profile.email:'';
  return`<div class="ww-panel" id="notify-section">
    <h2>${esc(t('notifyTitle'))}</h2>
    <p class="ww-status">${esc(t('notifyHint'))}</p>
    <p class="ww-status">${esc(email)}</p>
    <form id="notify-form">
      <label class="ww-check"><input type="checkbox" name="emailConfirmed" ${n.emailConfirmed===true?'checked':''}> ${esc(t('notifyConfirm'))}</label>
      <div class="ww-field"><label for="notify-city">${esc(t('notifyCity'))}</label><input id="notify-city" name="city" maxlength="80" value="${esc(n.city||'')}"></div>
      <div class="ww-field"><label for="notify-price">${esc(t('notifyMaxPrice'))}</label><input id="notify-price" name="maxPrice" inputmode="numeric" value="${esc(n.maxPrice||'')}"></div>
      <div class="ww-field"><label for="notify-type">${esc(t('notifyType'))}</label>
        <select id="notify-type" name="type">
          <option value="">—</option>
          ${['Appartement','Huis','Studio','Kamer'].map(v=>`<option value="${v}" ${n.type===v?'selected':''}>${esc(v)}</option>`).join('')}
        </select>
      </div>
      <p class="ww-status">${esc(t('notifyMatchNote'))}</p>
      <div class="ww-actions"><button class="ww-btn" type="submit">${esc(t('saveProfile'))}</button></div>
    </form>
  </div>`;
}

function zoekPanel(a){
  const cards=a.zoekprofielen.map(z=>`<article class="ww-zcard" data-zid="${esc(z.id)}">
    <h3>${esc(z.name||'—')}</h3>
    <p>${esc(t('accCity'))}: ${esc(z.city||'—')}</p>
    <p>${esc(t('maxPrice'))}: ${z.maxPrice?esc(String(z.maxPrice)):'—'}</p>
    <p>${esc(t('minBeds'))}: ${z.minBeds!=null&&z.minBeds!==''?esc(String(z.minBeds)):'—'}</p>
    <p>${esc(t('propertyTypes')||t('ptype')||'Type')}: ${esc(z.type||'—')}</p>
    <label class="ww-check"><input type="checkbox" data-z-active="${esc(z.id)}" ${z.active?'checked':''}> ${esc(t('activeProfile'))}</label>
    <div class="row"><button type="button" class="ww-btn secondary" data-z-apply="${esc(z.id)}">${esc(t('wekkerApply')||'Apply')}</button><button type="button" class="ww-btn danger" data-z-del="${esc(z.id)}">${esc(t('deleteProfile'))}</button></div>
  </article>`).join('');
  return`<div class="ww-panel">
    <h2>${esc(t('zoekprofielen'))}</h2>
    <p class="ww-status">${esc(t('zoekprofielenHint'))}</p>
    <div class="ww-meter" aria-hidden="true"><span style="width:${(a.zoekprofielen.length/4)*100}%"></span></div>
    <div class="ww-cards" id="zoek-cards">${cards||`<p class="ww-status">${esc(t('pipelineEmpty'))}</p>`}</div>
    ${a.zoekprofielen.length<4?`<form id="zoek-add" class="ww-grid2" style="margin-top:18px">
      <div class="ww-field"><label for="z-name">${esc(t('profileName'))}</label><input id="z-name" name="name" required maxlength="60"></div>
      <div class="ww-field"><label for="z-city">${esc(t('accCity'))}</label><input id="z-city" name="city" maxlength="80"></div>
      <div class="ww-field"><label for="z-price">${esc(t('maxPrice'))}</label><input id="z-price" name="maxPrice" type="number" min="0" step="50"></div>
      <div class="ww-field"><label for="z-beds">${esc(t('minBeds'))}</label><input id="z-beds" name="minBeds" type="number" min="0" max="10"></div>
      <div class="ww-field"><label for="z-type">${esc(t('propertyTypes')||'Type')}</label>
        <select id="z-type" name="type">
          <option value="">—</option>
          ${['Appartement','Huis','Studio','Kamer'].map(v=>`<option value="${v}">${esc(v)}</option>`).join('')}
        </select>
      </div>
      <div class="ww-actions" style="grid-column:1/-1"><button class="ww-btn" type="submit">${esc(t('addProfile'))}</button></div>
    </form>`:''}
  </div>`;
}

function alertsPanel(a){
  const bellen=hasBellenAccess(a);
  return`<div class="ww-panel">
    <h2>${esc(t('alertsTitle'))}</h2>
    <p class="ww-status">${esc(bellen?t('alertFreqBellen'):t('alertFreqKijken'))}</p>
    <form id="alerts-form">
      <label class="ww-check"><input type="checkbox" name="email" ${a.alerts.email?'checked':''}> ${esc(t('alertEmail'))}</label>
      <div class="ww-actions"><button class="ww-btn" type="submit">${esc(t('saveProfile'))}</button></div>
    </form>
  </div>`;
}

function reactiePanel(a){
  const keys=[['bezichtiging','tplBezichtiging'],['kennismaking','tplKennismaking'],['student','tplStudent']];
  return`<div class="ww-panel ww-templates">
    <h2>${esc(t('reactieTitle'))}</h2>
    <p class="ww-status">${esc(t('reactieHint'))}</p>
    <form id="tpl-form">${keys.map(([k,titleKey])=>`<div class="ww-field" style="margin-bottom:16px">
      <label for="tpl-${k}">${esc(t(titleKey))}</label>
      <textarea id="tpl-${k}" name="${k}" rows="5">${esc(a.templates[k]||DEFAULT_TEMPLATES[k])}</textarea>
      <div class="ww-actions"><button type="button" class="ww-btn secondary" data-copy-tpl="${k}">${esc(t('copyTpl'))}</button></div>
    </div>`).join('')}
    <div class="ww-actions"><button class="ww-btn" type="submit">${esc(t('saveProfile'))}</button></div>
    </form>
  </div>`;
}

function zoekgenootPanel(a){
  const bellen=hasBellenAccess(a);
  if(!bellen){
    return`<div class="ww-panel">
      <h2>${esc(t('zoekgenootTitle'))}</h2>
      <p class="ww-status">${esc(t('zoekgenootHint'))}</p>
      <p class="ww-locked">${esc(t('zoekgenootUpsell'))}</p>
      <div class="ww-actions"><a class="ww-btn" href="/prijzen/">${esc(t('upgradeBellen'))}</a></div>
    </div>`;
  }
  return`<div class="ww-panel">
    <h2>${esc(t('zoekgenootTitle'))}</h2>
    <p class="ww-status">${esc(t('zoekgenootHint'))}</p>
    <form id="buddy-form" class="ww-grid2">
      <div class="ww-field"><label for="buddy-name">${esc(t('zoekgenootName'))}</label><input id="buddy-name" name="name" value="${esc(a.zoekgenoot.name||'')}"></div>
      <div class="ww-field"><label for="buddy-email">${esc(t('zoekgenootEmail'))}</label><input id="buddy-email" name="email" type="email" value="${esc(a.zoekgenoot.email||'')}"></div>
      <div class="ww-actions" style="grid-column:1/-1"><button class="ww-btn" type="submit">${esc(t('saveProfile'))}</button></div>
    </form>
  </div>`;
}

function pipelineCard(url,tab){
  const p=listingByUrl(url);
  const title=p?p.address:(url||'—');
  const city=p?p.city:'';
  const price=p&&p.price&&typeof money==='function'?money(p.price):'';
  const photo=p&&typeof safePhoto==='function'?safePhoto(p.photo):(p&&p.photo?p.photo:'');
  const img=photo?`<img src="${esc(photo)}" alt="" loading="lazy">`:`<div class="ww-pipe-ph" aria-hidden="true">⌂</div>`;
  let actions='';
  if(tab==='fav'){
    actions=`<button type="button" class="ww-btn secondary" data-pipe-to="reacted" data-url="${esc(url)}">${esc(t('markReacted'))}</button>
      <button type="button" class="ww-btn secondary" data-pipe-to="visited" data-url="${esc(url)}">${esc(t('markVisited'))}</button>
      <button type="button" class="ww-btn danger" data-pipe-rm-fav data-url="${esc(url)}">${esc(t('removeFromPipeline'))}</button>`;
  }else if(tab==='reacted'){
    actions=`<button type="button" class="ww-btn secondary" data-pipe-to="visited" data-url="${esc(url)}">${esc(t('markVisited'))}</button>
      <button type="button" class="ww-btn danger" data-pipe-rm="reacted" data-url="${esc(url)}">${esc(t('removeFromPipeline'))}</button>`;
  }else{
    actions=`<button type="button" class="ww-btn secondary" data-pipe-to="reacted" data-url="${esc(url)}">${esc(t('markReacted'))}</button>
      <button type="button" class="ww-btn danger" data-pipe-rm="visited" data-url="${esc(url)}">${esc(t('removeFromPipeline'))}</button>`;
  }
  return`<article class="ww-pipe-card">
    <div class="ww-pipe-img">${img}</div>
    <div class="ww-pipe-body">
      <h3>${esc(title)}</h3>
      <p>${esc([city,price].filter(Boolean).join(' · '))}</p>
      <div class="row">${actions}</div>
    </div>
  </article>`;
}

function pipelinePanel(a){
  const favs=favourites();
  const tabs=[['fav',t('tabFav')],['reacted',t('tabReacted')],['visited',t('tabVisited')]];
  if(!tabs.some(([k])=>k===pipeTab))pipeTab='fav';
  const urls=pipeTab==='fav'?favs:pipeTab==='reacted'?a.pipeline.reacted:a.pipeline.visited;
  const cards=urls.length?urls.map(u=>pipelineCard(u,pipeTab)).join(''):`<p class="ww-status">${esc(t('pipelineEmpty'))}</p>`;
  return`<div class="ww-panel">
    <h2>${esc(t('pipelineTitle'))}</h2>
    <div class="ww-tabs" role="tablist">${tabs.map(([k,label])=>`<button type="button" role="tab" data-pipe-tab="${k}" aria-selected="${pipeTab===k}">${esc(label)}</button>`).join('')}</div>
    <div class="ww-pipe-list">${cards}</div>
  </div>`;
}

function checklistPanel(a){
  return`<div class="ww-panel">
    <h2>${esc(t('checklistTitle'))}</h2>
    <form id="check-form">${CHECK_KEYS.map(k=>`<label class="ww-check"><input type="checkbox" name="${k}" ${a.checklist[k]?'checked':''}> ${esc(t(k))}</label>`).join('')}
      <div class="ww-actions"><button class="ww-btn" type="submit">${esc(t('saveProfile'))}</button></div>
    </form>
  </div>`;
}

function bindAccountPanel(a){
  const prof=document.querySelector('#prof-form');
  if(prof){
    prof.onsubmit=e=>{
      e.preventDefault();
      const fd=new FormData(prof);
      const next=loadAccount();
      const income=String(fd.get('income')||'').trim();
      const allowed=new Set(['','lt2','2to3','3to4','4to5','5plus']);
      const entitled=typeof window.wwIsBellen==='function'?!!window.wwIsBellen():false;
      next.profile={
        ...next.profile,
        name:String(fd.get('name')||'').trim(),
        email:String(fd.get('email')||'').trim(),
        phone:String(fd.get('phone')||'').trim(),
        plan:entitled?'bellen':'kijken',
        bellenPaid:entitled,
        income:INCOME_OK.has(income)?income:'',
        bio:String(fd.get('bio')||'').trim().slice(0,600)
      };
      next.alerts.whatsapp=false;
      saveAccount(next);
      statusEl(t('savedOk'));
      renderAccount();
    };
    const file=document.querySelector('#prof-avatar');
    if(file)file.onchange=()=>{
      const f=file.files&&file.files[0];
      if(!f)return;
      if(f.size>AVATAR_MAX){statusEl(t('avatarTooBig'));file.value='';return}
      const reader=new FileReader();
      reader.onload=()=>{
        const next=loadAccount();
        next.profile.avatar=String(reader.result||'');
        saveAccount(next);
        statusEl(t('savedOk'));
        renderAccount();
      };
      reader.readAsDataURL(f);
    };
    document.querySelector('#prof-avatar-clear')?.addEventListener('click',()=>{
      const next=loadAccount();
      next.profile.avatar='';
      saveAccount(next);
      renderAccount();
    });
  }

  const zoekAdd=document.querySelector('#zoek-add');
  if(zoekAdd)zoekAdd.onsubmit=e=>{
    e.preventDefault();
    const next=loadAccount();
    if(next.zoekprofielen.length>=4)return;
    const fd=new FormData(zoekAdd);
    next.zoekprofielen.push(sanitizeZoekEntry({
      id:uid(),
      name:String(fd.get('name')||'').trim(),
      city:String(fd.get('city')||'').trim(),
      maxPrice:fd.get('maxPrice')?Number(fd.get('maxPrice')):'',
      minBeds:fd.get('minBeds')!==''&&fd.get('minBeds')!=null?Number(fd.get('minBeds')):'',
      type:String(fd.get('type')||'').trim(),
      active:true
    }));
    saveAccount(next);
    statusEl(t('savedOk'));
    renderAccount();
  };
  document.querySelectorAll('[data-z-del]').forEach(b=>b.onclick=()=>{
    const next=loadAccount();
    next.zoekprofielen=next.zoekprofielen.filter(z=>z.id!==b.dataset.zDel);
    saveAccount(next);
    renderAccount();
  });
  document.querySelectorAll('[data-z-active]').forEach(b=>b.onchange=()=>{
    const next=loadAccount();
    const z=next.zoekprofielen.find(x=>x.id===b.dataset.zActive);
    if(z){z.active=b.checked;saveAccount(next)}
  });
  document.querySelectorAll('[data-z-apply]').forEach(b=>b.onclick=()=>{
    const next=loadAccount();
    const z=next.zoekprofielen.find(x=>x.id===b.dataset.zApply);
    if(!z||typeof WWWekker==='undefined')return;
    const prof=WWWekker.profileFromZoekprofiel(z);
    WWWekker.saveWekkerProfile(prof);
    if(typeof filters!=='undefined'){
      WWWekker.applyProfileToFilters(prof, filters);
      if(typeof limit!=='undefined')limit=12;
      if(typeof syncFilterFields==='function')syncFilterFields();
      if(typeof applyFilters==='function')applyFilters();
    }
    statusEl(t('savedOk'));
  });

  const notify=document.querySelector('#notify-form');
  if(notify)notify.onsubmit=e=>{
    e.preventDefault();
    const next=loadAccount();
    const box=notify.querySelector('[name="emailConfirmed"]');
    next.notifications=sanitizeNotifications({
      emailConfirmed:!!(box&&box.checked),
      city:notify.city.value,
      maxPrice:notify.maxPrice.value,
      type:notify.type.value
    });
    saveAccount(next);
    statusEl(t('savedOk'));
    renderAccount();
  };

  const alerts=document.querySelector('#alerts-form');
  if(alerts)alerts.onsubmit=e=>{
    e.preventDefault();
    const next=loadAccount();
    next.alerts.email=!!alerts.email.checked;
    next.alerts.whatsapp=false;
    saveAccount(next);
    statusEl(t('savedOk'));
  };

  const tpl=document.querySelector('#tpl-form');
  if(tpl){
    tpl.onsubmit=e=>{
      e.preventDefault();
      const next=loadAccount();
      next.templates.bezichtiging=String(tpl.bezichtiging.value||'');
      next.templates.kennismaking=String(tpl.kennismaking.value||'');
      next.templates.student=String(tpl.student.value||'');
      saveAccount(next);
      statusEl(t('savedOk'));
    };
    document.querySelectorAll('[data-copy-tpl]').forEach(b=>b.onclick=async()=>{
      const key=b.dataset.copyTpl;
      const ta=document.querySelector('#tpl-'+key);
      const text=ta?ta.value:'';
      try{await navigator.clipboard.writeText(text);statusEl(t('copied'))}
      catch{
        if(ta){ta.select();document.execCommand('copy');statusEl(t('copied'))}
      }
    });
  }

  const buddy=document.querySelector('#buddy-form');
  if(buddy)buddy.onsubmit=e=>{
    e.preventDefault();
    const next=loadAccount();
    if(!hasBellenAccess(next))return;
    next.zoekgenoot={name:String(buddy.name.value||'').trim(),email:String(buddy.email.value||'').trim()};
    saveAccount(next);
    statusEl(t('savedOk'));
  };

  document.querySelectorAll('[data-pipe-tab]').forEach(b=>b.onclick=()=>{pipeTab=b.dataset.pipeTab;renderAccount()});
  document.querySelectorAll('[data-pipe-to]').forEach(b=>b.onclick=()=>{
    const url=b.dataset.url;
    const dest=b.dataset.pipeTo;
    const next=loadAccount();
    if(dest==='reacted'){
      next.pipeline.reacted=[...new Set([...next.pipeline.reacted,url])];
      next.pipeline.visited=next.pipeline.visited.filter(u=>u!==url);
    }else if(dest==='visited'){
      next.pipeline.visited=[...new Set([...next.pipeline.visited,url])];
      next.pipeline.reacted=next.pipeline.reacted.filter(u=>u!==url);
    }
    saveAccount(next);
    statusEl(t('savedOk'));
    renderAccount();
  });
  document.querySelectorAll('[data-pipe-rm]').forEach(b=>b.onclick=()=>{
    const next=loadAccount();
    const bucket=b.dataset.pipeRm;
    next.pipeline[bucket]=next.pipeline[bucket].filter(u=>u!==b.dataset.url);
    saveAccount(next);
    renderAccount();
  });
  document.querySelectorAll('[data-pipe-rm-fav]').forEach(b=>b.onclick=()=>{
    setFavourites(favourites().filter(u=>u!==b.dataset.url));
    renderAccount();
  });

  const check=document.querySelector('#check-form');
  if(check)check.onsubmit=e=>{
    e.preventDefault();
    const next=loadAccount();
    CHECK_KEYS.forEach(k=>{next.checklist[k]=!!check.elements[k]?.checked});
    saveAccount(next);
    statusEl(t('savedOk'));
  };
}

function bindWwCheckoutButtons(root){
  (root||document).querySelectorAll('[data-ww-checkout]').forEach(b=>{
    if(b.dataset.wwCheckoutBound)return;
    b.dataset.wwCheckoutBound='1';
    // Checkout always goes through the pricing page, where both consent boxes must be ticked.
    b.addEventListener('click',e=>{e.preventDefault();location.href='/prijzen/#checkout'});
  });
}
async function handleCheckoutQuery(){
  const q=new URLSearchParams(location.search);
  const c=q.get('checkout');
  if(!c)return;
  if(typeof window.refreshEntitlement==='function')await window.refreshEntitlement();
  if(c==='success'&&typeof window.wwIsBellen==='function'&&window.wwIsBellen()){
    statusEl(t('planBellen')+' ✓');
  }else if(c==='unavailable'){
    statusEl(t('checkoutUnavailable'));
  }else if(c==='pending'||c==='open'||c==='authorized'){
    // Return-before-paid race: poll return?format=json a few times, then refresh entitlement.
    statusEl('Betaling wordt verwerkt…');
    const paymentId=q.get('payment_id');
    const customerId=q.get('customer_id');
    if(paymentId||customerId){
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      for(let i=0;i<6;i++){
        await sleep(i===0?1200:2000);
        try{
          const params=new URLSearchParams({format:'json'});
          if(paymentId)params.set('payment_id',paymentId);
          if(customerId)params.set('customer_id',customerId);
          const r=await fetch('/api/checkout/return?'+params.toString(),{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
          const j=await r.json().catch(()=>({}));
          if(j&&j.status==='paid'){
            if(typeof window.refreshEntitlement==='function')await window.refreshEntitlement();
            if(typeof window.wwIsBellen==='function'&&window.wwIsBellen()){
              statusEl(t('planBellen')+' ✓');
              try{history.replaceState({},'', '/account/?checkout=success')}catch{}
              renderAccount();
              return;
            }
          }
          if(j&&j.status&&!['open','pending','authorized'].includes(j.status))break;
        }catch{}
      }
      if(typeof window.refreshEntitlement==='function')await window.refreshEntitlement();
      if(typeof window.wwIsBellen==='function'&&window.wwIsBellen()){
        statusEl(t('planBellen')+' ✓');
        try{history.replaceState({},'', '/account/?checkout=success')}catch{}
        renderAccount();
      }else{
        statusEl('Betaling nog niet bevestigd — vernieuw over enkele seconden of check je bank.');
      }
    }
  }
}

window.renderAccount=renderAccount;
window.renderSignup=renderSignup;
window.renderLoginPage=renderLoginPage;
window.hasBellenAccess=hasBellenAccess;


/* ===== WW_UX_HOOKS: how/trust strips ===== */
(function(){
  function howTrustHtml(){
    return `<section class="ww-how" aria-label="${esc(t('howTitle'))}">
      <article><div class="n">1</div><h3>${esc(t('how1Title'))}</h3><p>${esc(t('how1Text'))}</p></article>
      <article><div class="n">2</div><h3>${esc(t('how2Title'))}</h3><p>${esc(t('how2Text'))}</p></article>
      <article><div class="n">3</div><h3>${esc(t('how3Title'))}</h3><p>${esc(t('how3Text'))}</p></article>
    </section>
    <div class="ww-trust"><span>${esc(t('trust1'))}</span><span>${esc(t('trust2'))}</span><span>${esc(t('trust3'))}</span></div>`;
  }

  function injectHowTrust(){
    if(document.querySelector('.ww-how'))return;
    const teaser=document.querySelector('.pricing-teaser, .pricing-grid, #pricing');
    if(teaser){
      teaser.insertAdjacentHTML('beforebegin', howTrustHtml());
      return;
    }
    const head=document.querySelector('.page-head');
    if(head && (location.pathname.includes('prijzen')||location.pathname.includes('pricing'))){
      head.insertAdjacentHTML('afterend', howTrustHtml());
    }
  }

  function patch(){
    if(typeof render==='function'){
      const orig=render;
      window.render=render=function(){
        orig.apply(this,arguments);
        try{
          injectHowTrust();
        }catch(e){console.warn('ww ux',e)}
      };
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(patch,0));
  else setTimeout(patch,0);
})();


function syncNavAuth(){
  const el=document.getElementById('nav-auth');
  if(!el) return;
  let logged=!!serverAuthed;
  let label='';
  try{
    const raw=JSON.parse(localStorage.getItem(ACC_KEY)||'null');
    if(logged&&raw&&raw.profile) label=String(raw.profile.name||raw.profile.email||'').trim();
  }catch{}
  if(logged){
    el.innerHTML=`<a class="nav-signin" href="/account/">${esc(label||t('account'))}</a>`;
  }else{
    el.innerHTML=`<a class="nav-signin" href="/login/" data-t="signIn"></a><a class="nav-signup" href="/signup/" data-t="signUp"></a>`;
    el.querySelectorAll('[data-t]').forEach(n=>{ try{ n.textContent=t(n.dataset.t) }catch{} });
  }
}

async function fetchAuthStatus(){
  try{
    const r=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)return{googleConfigured:false,loggedIn:false};
    return await r.json();
  }catch{return{googleConfigured:false,loggedIn:false}}
}
async function fetchAuthMe(){
  try{
    const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
    if(r.status===401)return null;
    if(!r.ok)return null;
    const j=await r.json();
    return j&&j.user?j.user:null;
  }catch{return null}
}
function mergeServerUser(user){
  if(!user||!user.email)return false;
  const next=loadAccount();
  const avatar=sanitizeAvatar(user.picture||'');
  let pending={};
  try{pending=JSON.parse(sessionStorage.getItem('ww-pending-signup')||'{}')||{}}catch{}
  next.profile=sanitizeProfile({
    ...next.profile,
    name:String(user.name||pending.name||next.profile.name||'').trim()||String(user.email).split('@')[0],
    email:String(user.email).trim(),
    phone:String(pending.phone||next.profile.phone||'').trim(),
    ...(avatar?{avatar}:{})
  });
  next.alerts.whatsapp=false;
  saveAccount(next);
  serverAuthed=true;
  try{sessionStorage.removeItem('ww-pending-signup')}catch{}
  return true;
}
const mergeGoogleUser=mergeServerUser;
async function refreshGoogleButtonState(){
  const btn=document.querySelector('#acc-google');
  const st=document.querySelector('#acc-google-status');
  if(!btn)return;
  const status=await fetchAuthStatus();
  if(!status.googleConfigured){
    btn.setAttribute('aria-disabled','true');
    btn.classList.add('is-disabled');
    btn.addEventListener('click',e=>e.preventDefault(),{once:false});
    btn.onclick=e=>{e.preventDefault()};
    if(st)st.textContent=t('googleNotConfigured');
  }else{
    btn.removeAttribute('aria-disabled');
    btn.classList.remove('is-disabled');
    btn.onclick=null;
    if(st)st.textContent='';
  }
}
async function handleOAuthQuery(){
  const q=new URLSearchParams(location.search);
  const oauth=q.get('oauth');
  if(oauth==='ok'){
    const user=await fetchAuthMe();
    if(user){
      mergeGoogleUser(user);
      statusEl(t('googleLoginOk'));
      syncNavAuth();
      // clean query without reload loop
      try{
        const u=new URL(location.href);
        u.searchParams.delete('oauth');
        u.searchParams.delete('reason');
        history.replaceState({},'',u.pathname+(u.search||'')+(u.hash||''));
      }catch{}
      if(!isLoggedIn(loadAccount())){/* keep */}
      else if(document.querySelector('#acc-signup-form')||document.querySelector('#acc-login-resend')||document.querySelector('.ww-auth-page')||document.querySelector('.ww-gate')){
        if(location.pathname.indexOf('/signup')>=0||location.pathname.indexOf('/login')>=0)location.replace('/account/');
        else renderAccount();
      }
    }else{
      statusEl(t('googleLoginErr'));
    }
    return;
  }
  if(oauth==='err'){
    statusEl(t('googleLoginErr'));
    try{
      const u=new URL(location.href);
      u.searchParams.delete('oauth');
      u.searchParams.delete('reason');
      history.replaceState({},'',u.pathname+(u.search||'')+(u.hash||''));
    }catch{}
  }
}

async function handleConfirmQuery(){
  const q=new URLSearchParams(location.search);
  const confirmed=q.get('confirmed')||q.get('confirm');
  if(!confirmed)return;
  const ok=confirmed==='1'||confirmed==='ok'||confirmed==='true';
  if(ok){
    const user=await fetchAuthMe();
    if(user){
      mergeServerUser(user);
      statusEl(t('confirmOk')||t('emailConfirmed'));
      syncNavAuth();
      try{
        const u=new URL(location.href);
        u.searchParams.delete('confirmed');
        u.searchParams.delete('confirm');
        history.replaceState({},'',u.pathname+(u.search||'')+(u.hash||''));
      }catch{}
      if(location.pathname.indexOf('/signup')>=0||location.pathname.indexOf('/login')>=0){
        location.replace('/account/?confirm=ok');
        return;
      }
      if(isLoggedIn(loadAccount()))renderAccount();
    }else{
      statusEl(t('confirmErr')||t('confirmFailed'));
    }
  }else{
    statusEl(t('confirmErr')||t('confirmFailed'));
    try{
      const u=new URL(location.href);
      u.searchParams.delete('confirmed');
      u.searchParams.delete('confirm');
      history.replaceState({},'',u.pathname+(u.search||'')+(u.hash||''));
    }catch{}
  }
}

async function bootstrapGoogleSession(){
  try{
    const status=await fetchAuthStatus();
    if(status&&status.loggedIn&&status.user){
      mergeServerUser(status.user);
      syncNavAuth();
      if(typeof main!=='undefined'&&main){
        const p=location.pathname;
        if(p.indexOf('/account')>=0 && (document.querySelector('.ww-auth-page')||document.querySelector('.ww-gate')))renderAccount();
        else if((p.indexOf('/signup')>=0||p.indexOf('/login')>=0) && isLoggedIn(loadAccount()))location.replace('/account/');
      }
    }else{
      serverAuthed=false;
      syncNavAuth();
    }
  }catch{serverAuthed=false}
  const path=location.pathname;
  if(path.indexOf('/account')>=0||path.indexOf('/signup')>=0||path.indexOf('/login')>=0){
    await handleOAuthQuery();
    await handleConfirmQuery();
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>bootstrapGoogleSession());
else bootstrapGoogleSession();

(function wrapFrameForAuth(){
  if(typeof frame!=='function'){ document.addEventListener('DOMContentLoaded', syncNavAuth); return; }
  const prev=frame;
  window.frame=function(){ prev.apply(this,arguments); syncNavAuth(); };
})();
