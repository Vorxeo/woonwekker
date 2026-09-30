'use strict';
let lang='nl';try{lang=localStorage.getItem('woonwekker-language')||'nl'}catch{}if(!copy[lang])lang='nl';
let listings=[],filtered=[],limit=12,active=null;const filters={city:'',budget:'',beds:'',ptype:'',sort:'source',isNew:false};const main=document.querySelector('main'),dialog=document.querySelector('dialog');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let wwEntitled=false;let wwEntitlementSource=null;
window.wwIsBellen=function(){return wwEntitled===true};
async function refreshEntitlement(){
  try{
    const r=await fetch('/api/entitlement',{credentials:'include',cache:'no-store'});
    if(!r.ok){wwEntitled=false;wwEntitlementSource=null;return false}
    const j=await r.json();
    wwEntitled=j&&j.plan==='bellen';
    wwEntitlementSource=(j&&j.source)||null;
    try{
      const raw=JSON.parse(localStorage.getItem('woonwekker-account')||'null')||{};
      raw.profile=raw.profile||{};
      // Display-only sync — authority remains server entitlement / wwIsBellen()
      raw.profile.plan=wwEntitled?'bellen':'kijken';
      raw.profile.bellenPaid=!!wwEntitled;
      localStorage.setItem('woonwekker-account',JSON.stringify(raw));
    }catch{}
    return wwEntitled;
  }catch{wwEntitled=false;wwEntitlementSource=null;return false}
}
window.refreshEntitlement=refreshEntitlement;
window.startBellenCheckout=async function(method){
  const ideal=method==='ideal';
  try{
    let email='',name='';
    try{
      const raw=JSON.parse(localStorage.getItem('woonwekker-account')||'null');
      email=(raw&&raw.profile&&raw.profile.email)||'';
      name=(raw&&raw.profile&&raw.profile.name)||'';
    }catch{}
    const r=await fetch('/api/checkout',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,name,...(ideal?{method:'ideal'}:{})})});
    const j=await r.json().catch(()=>({}));
    if(r.status===503&&ideal&&j&&j.error==='sepa_unavailable'){alert(t('idealUnavailable'));return}
    if(r.status===503){location.href='/prijzen/?checkout=unavailable';return}
    if(!r.ok||!j.url){alert((j&&j.message)||'Checkout unavailable');return}
    location.href=j.url;
  }catch(e){alert('Checkout unavailable')}
};

const t=k=>copy[lang][k];const money=n=>new Intl.NumberFormat({nl:'nl-NL',en:'en-IE',es:'es-ES',pl:'pl-PL',pt:'pt-BR'}[lang],{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n));
const safePhoto=u=>{const s=String(u||'');return /^https:\/\/(cloud\.funda\.nl\/|resources\.kamernet\.nl\/|media\.pararius\.nl\/|casco-media-prod\.global\.ssl\.fastly\.net\/)/.test(s)?s:''};
const fundaSize=(u,w,h)=>{const s=String(u||'');return s.includes('cloud.funda.nl')?s.replace(/_\d+x\d+\.jpg/i,'_'+w+'x'+h+'.jpg'):s};
const photoSrc=(u,role)=>{const base=safePhoto(u);if(!base)return'';if(base.includes('cloud.funda.nl')){if(role==='hero'||role==='detail')return fundaSize(base,1920,1280);if(role==='card')return fundaSize(base,1440,960);if(role==='thumb')return fundaSize(base,720,480);}return base;};
const photoSrcset=u=>{const base=safePhoto(u);if(!base||!base.includes('cloud.funda.nl'))return'';return `${fundaSize(base,720,480)} 720w, ${fundaSize(base,1440,960)} 1440w, ${fundaSize(base,1920,1280)} 1920w`;};

const photos=p=>Object.keys(p).filter(k=>/^photos\/\d+$/.test(k)).sort((a,b)=>Number(a.split('/')[1])-Number(b.split('/')[1])).map(k=>safePhoto(p[k])).filter(Boolean);
const type=p=>p.propertyType==='Appartement'?t('apartment'):p.propertyType==='Huis'?t('house'):p.propertyType==='Studio'?t('studio'):p.propertyType==='Kamer'?t('room'):p.propertyType==='Parkeergelegenheid'?({nl:'Parkeerplaats',en:'Parking space',es:'Plaza de aparcamiento',pl:'Miejsce parkingowe',pt:'Vaga de estacionamento'}[lang]):t('other');
const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function frame(){document.documentElement.lang=lang;document.querySelector('#language').value=lang;document.querySelectorAll('[data-t]').forEach(n=>n.textContent=t(n.dataset.t));document.querySelectorAll('header nav a[href]').forEach(a=>{const path=(location.pathname.replace(/\/$/,'')||'/');const href=((a.getAttribute('href')||'').replace(/\/$/,'')||'/');const on=href==='/'?path==='/':path.startsWith(href);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});document.querySelector('.close').ariaLabel=t('close');document.querySelector('.skip').textContent={nl:'Naar inhoud',en:'Skip to content',es:'Ir al contenido',pl:'Przejdź do treści',pt:'Ir para o conteúdo'}[lang];document.title=(location.pathname.startsWith('/kamers')?t('roomsPageTitle'):location.pathname.startsWith('/huizen')?t('housesPageTitle'):location.pathname.startsWith('/insights')?(insightPageTitle()||('Woonwekker — '+t('insights'))):('Woonwekker — '+(location.pathname.startsWith('/prijzen')||location.pathname.startsWith('/pricing')?t('pricing'):location.pathname.startsWith('/faq')?t('faq'):location.pathname.startsWith('/legal')?t('legal'):location.pathname.startsWith('/signup')?(t('signupTitle')||t('signUp')):location.pathname.startsWith('/login')?(t('loginTitle')||t('signIn')):location.pathname.startsWith('/account')?t('account'):location.pathname.startsWith('/plaats')?t('listHome'):t('homes'))));const meta=document.querySelector('meta[name="description"]');if(meta){if(location.pathname.startsWith('/kamers'))meta.content=t('roomsMeta');else if(location.pathname.startsWith('/huizen'))meta.content=t('housesMeta');else if(location.pathname.startsWith('/insights')){const s=(location.pathname.match(/^\/insights\/?([^/]*)\/?$/)||[])[1]||'';const i=['kamer-studio-or-house-netherlands','dutch-rental-search-without-refreshing','free-account-vs-bellen-woonwekker'].indexOf(s);meta.content=(i>=0?(t('insightsA'+(i+1)+'Intro')||t('insightsIntro')):t('insightsIntro'))||meta.content;}else if(location.pathname.startsWith('/signup'))meta.content=t('signupMeta')||t('signupIntro')||meta.content;else if(location.pathname.startsWith('/login'))meta.content=t('loginMeta')||t('loginIntro')||meta.content;}}
function render(){frame();syncLanguageMenu();const path=location.pathname;if(path.startsWith('/insights'))renderInsights();else if(path.startsWith('/faq'))renderFaq();else if(path.startsWith('/legal'))renderLegal();else if(path.startsWith('/prijzen')||path.startsWith('/pricing'))renderPricing();else if(path.startsWith('/signup'))renderSignup();else if(path.startsWith('/login'))renderLoginPage();else if(path.startsWith('/account'))renderAccount();else if(path.startsWith('/plaats'))renderPlaats();else if(path.startsWith('/kamers'))renderCategory('rooms');else if(path.startsWith('/huizen'))renderCategory('homes');else renderHomes();}

function isNewListing(p){if(!p)return false;if(p.isNew===true||p.isNew==='true'||p.isNew===1||p.isNew==='1')return true;return String(p.status||'').trim().toLowerCase()==='nieuw'}
function newBadge(p){return isNewListing(p)?`<span class="tag tag-new">${esc(t('tagNew'))}</span>`:''}
function newListingsStripHtml(pool){const items=(Array.isArray(pool)?pool:listings).filter(isNewListing);if(!items.length)return'';const cards=items.slice(0,8).map(p=>`<article class="card card-new-mini"><button type="button" class="card-hit" data-new-id="${p.id}" aria-label="${esc(t('view')+': '+p.address)}"><div class="card-image"><img src="${esc(photoSrc(p.photo,'card'))}" alt="${esc(p.address+', '+p.city)}" loading="lazy" width="640" height="420" decoding="async"><span class="tag tag-new">${esc(t('tagNew'))}</span></div><div class="card-body"><p class="location">${esc(p.city)}</p><h3>${esc(p.address)}</h3><p class="price">${p.price?money(p.price):t('unknown')} <small>${t('month')}</small></p></div></button></article>`).join('');return `<section class="new-listings" aria-labelledby="new-listings-title"><div class="new-listings-head"><div><div class="eyebrow">${esc(t('tagNew'))}</div><h2 id="new-listings-title">${esc(t('newSectionTitle'))}</h2><p>${esc(String(t('newSectionSub')||'').replace('{n}',String(items.length)))}</p></div><button type="button" class="primary outline" id="filter-new-cta">${esc(t('newSectionCta'))}</button></div><div class="new-listings-grid">${cards}</div></section>`}
function wireNewListingsStrip(){document.querySelectorAll('[data-new-id]').forEach(el=>{el.onclick=()=>{const p=listings.find(x=>String(x.id)===String(el.dataset.newId));if(p)openProperty(p)}});const newBtn=document.querySelector('#filter-new-cta');if(newBtn)newBtn.onclick=()=>{filters.isNew=true;applyFilters();const el=document.querySelector('#results')||document.querySelector('#result-title');if(el)el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}}
function pricingStripHtml(){return `<section class="ww-pricing-strip" aria-label="${esc(t('pricing'))}"><div class="ww-strip-plans"><span class="ww-strip-plan">${esc(t('stripKijken'))}</span><span class="ww-strip-plan featured">${esc(t('stripBellen'))}</span></div><p class="ww-strip-anti">${esc(t('pricingAntiTrial'))}</p><p class="ww-risk-badge">${esc(t('riskBadge'))}</p><a class="primary outline" href="/prijzen/">${esc(t('stripCta'))}</a></section>`}
function zoekStripHtml(){let slots=[];try{const raw=JSON.parse(localStorage.getItem('woonwekker-account')||'null');const list=(raw&&raw.zoekprofielen)||[];slots=list.slice(0,4)}catch{}while(slots.length<4)slots.push(null);const cards=slots.map((z,i)=>{if(!z)return `<article class="ww-zoek-slot empty"><span class="n">${i+1}</span><p>${esc(i===0?t('zoekSlotExample'):t('zoekSlotEmpty'))}</p></article>`;const label=[z.city||z.cities||z.name,z.maxPrice?('max €'+z.maxPrice):'',z.minBeds? (z.minBeds+'+'):''].filter(Boolean).join(' · ');return `<article class="ww-zoek-slot filled"><span class="n">${i+1}</span><p>${esc(label||t('zoekSlotExample'))}</p></article>`}).join('');return `<section class="ww-zoek-strip" aria-label="${esc(t('zoekStripTitle'))}"><div class="ww-zoek-head"><h2>${esc(t('zoekStripTitle'))}</h2><p>${esc(t('zoekStripHint'))}</p><a href="/account/">${esc(t('account'))}</a></div><div class="ww-zoek-slots">${cards}</div></section>`}



function pickHero(ptype){if(ptype==='rooms'||ptype==='Kamer'){return listings.find(p=>p.city==='Amsterdam'&&p.address==='Van Ostadestraat 70')||listings.find(p=>p.city==='Amstelveen'&&p.address==='Patrijspoort 52')||listings.find(p=>p.propertyType==='Kamer'&&photos(p).length>=4)||listings.find(p=>p.propertyType==='Kamer'&&p.photo)}if(ptype==='homes'||ptype==='Huis'){return listings.find(p=>p.city==='Den Haag'&&p.address==='Haagoord 4')||listings.find(p=>p.city==='Haarlem'&&p.address==='Salieristraat 1')||listings.find(p=>p.propertyType==='Huis'&&photos(p).length>=4)||listings.find(p=>p.propertyType==='Huis'&&p.photo)}const cities=new Set(['Amsterdam','Utrecht','Rotterdam','Haarlem','Den Haag','Leiden','Delft','Eindhoven']);const pool=listings.filter(p=>p.propertyType===ptype&&p.photo);const preferred=pool.filter(p=>cities.has(p.city));const list=preferred.length?preferred:pool;return list.slice().sort((a,b)=>photos(b).length-photos(a).length)[0]||listings[0]}
function wireSearch(){const form=document.querySelector('#search');if(!form)return;form.onsubmit=e=>{e.preventDefault();['city','budget','beds','ptype'].forEach(k=>{const el=document.getElementById(k);if(el)filters[k]=el.value});limit=12;applyFilters();const title=document.querySelector('#result-title');if(title)title.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})};const sort=document.querySelector('#sort');if(sort)sort.onchange=e=>{filters.sort=e.target.value;applyFilters()};const more=document.querySelector('#more');if(more)more.onclick=()=>{limit+=12;drawCards()};applyFilters();imageFallbacks()}
function renderCategory(ptype){filters.ptype=ptype;const isRoom=ptype==='rooms'||ptype==='Kamer';const isHomes=ptype==='homes'||ptype==='Huis'||ptype==='Appartement';const hero=pickHero(ptype);const heroPics=hero?photos(hero):[];const heroSrc=hero?photoSrc(heroPics[1]||heroPics[0]||hero.photo,'hero'):'';main.innerHTML=`<section class="hero category-hero"><div><div class="eyebrow">${t(isRoom?'roomsEyebrow':'housesEyebrow')}</div><h1>${t(isRoom?'roomsHeadline':'housesHeadline')}</h1><p>${t(isRoom?'roomsIntro':'housesIntro')}</p><p class="category-seo">${t('categorySeoLine')}</p><a class="primary" href="#search">${t('categoryCta')} <span aria-hidden="true">↓</span></a></div><div class="hero-art">${heroSrc?`<img class="hero-photo" src="${esc(heroSrc)}" alt="${esc((hero&&hero.address||'')+', '+(hero&&hero.city||''))}" fetchpriority="high">`:''}<div class="photo-note"><span class="note-icon" aria-hidden="true">⌂</span><div><strong>${t(isRoom?'roomsNote':'housesNote')}</strong><small>${t(isRoom?'roomsNoteSub':'housesNoteSub')}</small></div></div></div></section>${newListingsStripHtml(listings.filter(p=>typeAllowed(p.propertyType,isRoom?'rooms':'homes')))}${pricingStripHtml()}<form class="search-panel" id="search"><div class="field"><label for="city">${t('city')}</label><input id="city" type="search" list="cities" placeholder="${t('cityPlaceholder')}" value="${esc(filters.city)}"><datalist id="cities">${[...new Set(listings.map(p=>p.city))].sort().map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div><div class="field"><label for="budget">${t('budget')}</label><select id="budget"><option value="">${t('anyPrice')}</option>${[800,1000,1200,1500,2000,2500,3000,4000,5000].map(n=>`<option value="${n}" ${filters.budget==n?'selected':''}>${money(n)}</option>`).join('')}</select></div><div class="field"><label for="ptype">${t('ptype')}</label>${isRoom?`<select id="ptype"><option value="rooms" ${filters.ptype==='rooms'?'selected':''}>${t('roomsAndStudios')}</option><option value="Kamer" ${filters.ptype==='Kamer'?'selected':''}>${t('room')}</option><option value="Studio" ${filters.ptype==='Studio'?'selected':''}>${t('studio')}</option></select>`:isHomes?`<select id="ptype"><option value="homes" ${filters.ptype==='homes'?'selected':''}>${t('housesAndApartments')}</option><option value="Huis" ${filters.ptype==='Huis'?'selected':''}>${t('house')}</option><option value="Appartement" ${filters.ptype==='Appartement'?'selected':''}>${t('apartment')}</option></select>`:`<select id="ptype" disabled><option value="Huis" selected>${t('house')}</option></select>`}</div><div class="field"><label for="beds">${t('beds')}</label><select id="beds"><option value="">${t('anyBeds')}</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${filters.beds==n?'selected':''}>${n}+</option>`).join('')}</select></div><button class="primary">${t('search')} <span aria-hidden="true">↗</span></button></form>${zoekStripHtml()}<section aria-labelledby="result-title"><div class="results-head"><div><h2 id="result-title" aria-live="polite"></h2><p>${t('updated')}</p></div><label class="sort">${t('sort')}<select id="sort">${[['source','newest'],['priceAsc','cheap'],['priceDesc','expensive'],['area','large']].map(([v,k])=>`<option value="${v}" ${filters.sort===v?'selected':''}>${t(k)}</option>`).join('')}</select></label></div><div class="grid" id="results"></div><button class="more" id="more">${t('more')}</button></section>${insightsPromoHtml()}`;limit=12;wireSearch();wireNewListingsStrip()}

function renderHomes(){filters.ptype='';const hero=listings.find(p=>p.city==='Den Haag'&&p.address==='Haagoord 4')||listings.find(p=>p.city==='Amsterdam'&&p.address==='Keizersgracht 403-3')||listings.find(p=>p.propertyType==='Huis'&&photos(p).length>2)||listings.find(p=>photos(p).length&&(p.propertyType==='Appartement'||p.propertyType==='Huis'))||listings[0];const heroPics=hero?photos(hero):[];const heroSrc=hero?photoSrc(heroPics[1]||heroPics[0]||hero.photo,'hero'):'';main.innerHTML=`<section class="hero"><div><div class="eyebrow">${t('eyebrow')}</div><h1>${t('headline')}</h1><p>${t('intro')}</p><p class="hero-promise">${t('heroPromise')}</p></div><div class="hero-art">${heroSrc?`<img class="hero-photo" src="${esc(heroSrc)}" alt="${esc(hero.address+', '+hero.city)}" fetchpriority="high">`:''}<div class="photo-note"><span class="note-icon" aria-hidden="true">⌂</span><div><strong>${t('note')}</strong><small>${t('noteSub')}</small></div></div></div></section>${newListingsStripHtml()}${pricingStripHtml()}<form class="search-panel" id="search"><div class="field"><label for="city">${t('city')}</label><input id="city" type="search" list="cities" placeholder="${t('cityPlaceholder')}" value="${esc(filters.city)}"><datalist id="cities">${[...new Set(listings.map(p=>p.city))].sort().map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div><div class="field"><label for="budget">${t('budget')}</label><select id="budget"><option value="">${t('anyPrice')}</option>${[800,1000,1200,1500,2000,2500,3000,4000,5000].map(n=>`<option value="${n}" ${filters.budget==n?'selected':''}>${money(n)}</option>`).join('')}</select></div><div class="field"><label for="ptype">${t('ptype')}</label><select id="ptype"><option value="">${t('anyType')}</option><option value="Appartement" ${filters.ptype==='Appartement'?'selected':''}>${t('apartment')}</option><option value="Huis" ${filters.ptype==='Huis'?'selected':''}>${t('house')}</option><option value="Studio" ${filters.ptype==='Studio'?'selected':''}>${t('studio')}</option><option value="Kamer" ${filters.ptype==='Kamer'?'selected':''}>${t('room')}</option></select></div><div class="field"><label for="beds">${t('beds')}</label><select id="beds"><option value="">${t('anyBeds')}</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${filters.beds==n?'selected':''}>${n}+</option>`).join('')}</select></div><button class="primary">${t('search')} <span aria-hidden="true">↗</span></button></form>${zoekStripHtml()}<section aria-labelledby="result-title"><div class="results-head"><div><h2 id="result-title" aria-live="polite"></h2><p>${t('updated')}</p></div><label class="sort">${t('sort')}<select id="sort">${[['source','newest'],['priceAsc','cheap'],['priceDesc','expensive'],['area','large']].map(([v,k])=>`<option value="${v}" ${filters.sort===v?'selected':''}>${t(k)}</option>`).join('')}</select></label></div><div class="grid" id="results"></div><button class="more" id="more">${t('more')}</button></section><section class="pricing-teaser" id="pricing" aria-labelledby="pricing-title"><div class="page-head compact"><div class="eyebrow">${t('pricing')}</div><h2 id="pricing-title">${t('pricingTitle')}</h2><p>${t('pricingIntro')}</p></div><div class="pricing-grid"><article class="price-card"><h3>${t('kijkenTitle')}</h3><div class="price-amount">${t('kijkenPrice')}<small>${t('kijkenPeriod')}</small></div><ul><li>${t('kijkenFeat1')}</li><li>${t('kijkenFeat2')}</li><li>${t('kijkenFeat3')}</li><li>${t('kijkenFeat4')}</li><li>${t('kijkenFeat5')}</li><li>${t('kijkenFeat6')}</li></ul><a class="primary outline" href="/prijzen/">${t('kijkenCta')}</a></article><article class="price-card featured"><h3>${t('bellenTitle')}</h3><div class="price-amount">${t('bellenPrice')}<small>${t('bellenPeriod')}</small></div><ul><li>${t('bellenFeat1')}</li><li>${t('bellenFeat2')}</li><li>${t('bellenFeat3')}</li><li>${t('bellenFeat4')}</li><li>${t('bellenFeat5')}</li><li>${t('bellenFeat6')}</li></ul><button type="button" class="primary" data-ww-checkout="1">${t('bellenCta')}</button><button type="button" class="ghost" data-ww-checkout="ideal">${t('bellenIdealCta')}</button></article></div><p class="ww-strip-anti">${t('pricingAntiTrial')}</p><p class="ww-risk-badge">${t('riskBadge')}</p><p class="ww-bellen-note">${t('bellenAlertNote')}</p><p class="pricing-note">${t('pricingNote')}</p></section><aside class="editorial"><div><h2>${t('helpTitle')}</h2><p>${t('helpText')}</p></div><a href="/faq/">${t('helpLink')}</a></aside>${insightsPromoHtml()}`;wireSearch();wireNewListingsStrip();document.querySelectorAll("[data-ww-checkout]").forEach(b=>b.onclick=()=>window.startBellenCheckout&&window.startBellenCheckout(b.getAttribute('data-ww-checkout')==='ideal'?'ideal':undefined))}
function pageKind(){const path=(location.pathname||'/').replace(/\/+$/,'')||'/';if(path==='/kamers'||path.endsWith('/kamers')||path.includes('/kamers/'))return 'rooms';if(path==='/huizen'||path.endsWith('/huizen')||path.includes('/huizen/'))return 'homes';return 'all'}
function typeAllowed(pt,kind){if(kind==='rooms')return pt==='Kamer'||pt==='Studio';if(kind==='homes')return pt==='Huis'||pt==='Appartement';return true}
function applyFilters(){const kind=pageKind();if(kind==='rooms'&&filters.ptype!=='Kamer'&&filters.ptype!=='Studio')filters.ptype='rooms';if(kind==='homes'&&filters.ptype!=='Huis'&&filters.ptype!=='Appartement')filters.ptype='homes';filtered=listings.filter(p=>{if(!typeAllowed(p.propertyType,kind))return false;if(filters.city&&!norm([p.city,p.address,p.neighbourhood,p.postalCode].join(' ')).includes(norm(filters.city.trim())))return false;if(filters.budget&&!(p.price&&Number(p.price)<=Number(filters.budget)))return false;if(filters.beds&&!(p.bedrooms!==''&&p.bedrooms!=null&&Number(p.bedrooms)>=Number(filters.beds)))return false;if(filters.isNew&&!isNewListing(p))return false;if(!filters.ptype||filters.ptype==='rooms'||filters.ptype==='homes')return true;return p.propertyType===filters.ptype});if(filters.sort==='priceAsc')filtered.sort((a,b)=>+a.price-+b.price);else if(filters.sort==='priceDesc')filtered.sort((a,b)=>+b.price-+a.price);else if(filters.sort==='area')filtered.sort((a,b)=>+b.livingArea-+a.livingArea);else filtered.sort((a,b)=>Number(isNewListing(b))-Number(isNewListing(a)));drawCards()}
function drawCards(){document.querySelector('#result-title').textContent=`${filtered.length} ${t('results')}`;document.querySelector('#results').innerHTML=filtered.length?filtered.slice(0,limit).map(p=>`<article class="card"><button class="card-hit" data-id="${p.id}" aria-label="${esc(t('view')+': '+p.address)}"><div class="card-image"><img src="${esc(photoSrc(p.photo,'card'))}" srcset="${esc(photoSrcset(p.photo))}" sizes="(max-width:640px) 100vw, (max-width:1100px) 50vw, 360px" decoding="async" alt="${esc(p.address+', '+p.city)}" loading="lazy" width="640" height="420"><span class="tag">${type(p)}</span>${newBadge(p)}<span class="count">▧ ${photos(p).length} ${t('photos')}</span></div><div class="card-body"><p class="location">${esc(p.city)} · ${esc(p.postalCode)}</p><h3>${esc(p.address)}</h3><div class="specs"><span>▱ ${esc(p.livingArea||'—')} m²</span><span>⌑ ${esc(p.bedrooms||'—')} ${t('bed')}</span>${p.energyLabel?`<span>${t('energy')} ${esc(p.energyLabel)}</span>`:''}</div><div class="price-row"><span class="price">${p.price?money(p.price):t('unknown')} <small>${t('month')}</small></span><span class="view" aria-hidden="true"><span class="view-stage"><span class="view-plate"><span class="view-shine"></span><span class="view-arrow"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M5 12h11.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12.2 6.5 18.5 12l-6.3 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span><span class="view-shadow"></span></span></span></div></div></button></article>`).join(''):`<div class="empty"><h3>${t('empty')}</h3><p>${t('emptyText')}</p><button class="primary" id="reset">${t('reset')}</button></div>`;document.querySelector('#more').hidden=limit>=filtered.length;document.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openProperty(listings.find(p=>p.id===el.dataset.id)));const reset=document.querySelector('#reset');if(reset)reset.onclick=()=>{const kind=typeof pageKind==='function'?pageKind():'all';Object.assign(filters,{city:'',budget:'',beds:'',ptype:kind==='rooms'?'rooms':kind==='homes'?'homes':'',sort:'source',isNew:false});limit=12;render()};imageFallbacks()}
function imageFallbacks(){document.querySelectorAll('img:not(.brand img)').forEach(im=>im.onerror=()=>{im.removeAttribute('src');im.alt=t('photoUnavailable');im.style.objectFit='contain';im.onerror=null})}

function loadZoekprofielen(){try{const raw=JSON.parse(localStorage.getItem('woonwekker-account')||'null');return Array.isArray(raw&&raw.zoekprofielen)?raw.zoekprofielen.slice(0,4):[]}catch{return[]}}
function activeFilterChips(){
  const chips=[];
  if(filters.city)chips.push({k:'city',label:filters.city});
  if(filters.budget)chips.push({k:'budget',label:'≤ '+money(filters.budget)});
  if(filters.minBudget)chips.push({k:'minBudget',label:'≥ '+money(filters.minBudget)});
  if(filters.beds)chips.push({k:'beds',label:filters.beds+'+'});
  if(filters.ptype&&filters.ptype!=='rooms'&&filters.ptype!=='homes')chips.push({k:'ptype',label:type({propertyType:filters.ptype})});
  else if(filters.type)chips.push({k:'type',label:type({propertyType:filters.type})});
  if(filters.area)chips.push({k:'area',label:'≥ '+filters.area+' m²'});
  if(filters.garden)chips.push({k:'garden',label:t('garden')});
  if(filters.balcony)chips.push({k:'balcony',label:t('balcony')});
  if(filters.energy)chips.push({k:'energy',label:t('energy')+' A+'});
  if(filters.isNew)chips.push({k:'isNew',label:t('tagNew')||'Nieuw'});
  return chips;
}
function listingMatchesChip(p,chip){
  const k=chip.k;
  if(k==='city')return norm([p.city,p.address,p.neighbourhood,p.postalCode].join(' ')).includes(norm(filters.city.trim()));
  if(k==='budget')return !!(p.price&&Number(p.price)<=Number(filters.budget));
  if(k==='minBudget')return !!(p.price&&Number(p.price)>=Number(filters.minBudget));
  if(k==='beds')return p.bedrooms!==''&&p.bedrooms!=null&&Number(p.bedrooms)>=Number(filters.beds);
  if(k==='ptype'||k==='type'){const want=filters.type||filters.ptype;return p.propertyType===want}
  if(k==='area')return !!(p.livingArea&&Number(p.livingArea)>=Number(filters.area));
  if(k==='garden')return p.garden==='true'||p.garden===true;
  if(k==='balcony')return p.balcony==='true'||p.balcony===true;
  if(k==='energy')return /^A\+*$/.test(String(p.energyLabel||''));
  if(k==='isNew')return typeof isNewListing==='function'?isNewListing(p):(p.isNew===true||p.isNew==='true'||String(p.status||'').toLowerCase()==='nieuw');
  return true;
}
function zoekLabel(z){return [z.name||z.city||z.cities,z.maxPrice?('max €'+z.maxPrice):'',z.minBeds?(z.minBeds+'+'):'',z.type||''].filter(Boolean).join(' · ')||t('zoekSlotExample')}
function listingMatchesZoek(p,z){
  if(z.city&&!norm([p.city,p.address,p.neighbourhood,p.postalCode].join(' ')).includes(norm(String(z.city))))return false;
  if(z.maxPrice&&!(p.price&&Number(p.price)<=Number(z.maxPrice)))return false;
  if(z.minBeds&&!(p.bedrooms!==''&&p.bedrooms!=null&&Number(p.bedrooms)>=Number(z.minBeds)))return false;
  if(z.type&&p.propertyType!==z.type)return false;
  return true;
}
function detailSearchProfileHtml(p){
  const chips=activeFilterChips();
  const zoeks=loadZoekprofielen();
  const has=chips.length||zoeks.length;
  const panelId='ww-detail-profile-panel';
  const btnId='ww-detail-profile-toggle';
  let body='';
  if(!has){
    body=`<p class="ww-detail-profile-empty">${esc(t('detailProfileNone'))}</p>`;
  }else{
    if(chips.length){
      const items=chips.map(c=>{
        const ok=listingMatchesChip(p,c);
        return `<li class="${ok?'ww-detail-profile-pass':'ww-detail-profile-fail'}"><span class="ww-detail-profile-mark" aria-hidden="true">${ok?'✓':'✗'}</span> ${esc(c.label)} <small>${esc(ok?t('detailProfileMatch'):t('detailProfileMiss'))}</small></li>`;
      }).join('');
      body+=`<div class="ww-detail-profile-block"><h3>${esc(t('detailProfileFilters'))}</h3><ul class="ww-detail-profile-list">${items}</ul></div>`;
    }else{
      body+=`<div class="ww-detail-profile-block"><h3>${esc(t('detailProfileFilters'))}</h3><p class="ww-detail-profile-empty">${esc(t('detailProfileEmptyFilters'))}</p></div>`;
    }
    if(zoeks.length){
      const items=zoeks.map(z=>{
        const ok=listingMatchesZoek(p,z);
        const lab=zoekLabel(z)+(z.active?' · ✓':'');
        return `<li class="${ok?'ww-detail-profile-pass':'ww-detail-profile-fail'}"><span class="ww-detail-profile-mark" aria-hidden="true">${ok?'✓':'✗'}</span> ${esc(lab)} <small>${esc(ok?t('detailProfileMatch'):t('detailProfileMiss'))}</small></li>`;
      }).join('');
      body+=`<div class="ww-detail-profile-block"><h3>${esc(t('detailProfileSaved'))}</h3><ul class="ww-detail-profile-list">${items}</ul><p class="ww-detail-profile-hint"><a href="/account/">${esc(t('account'))}</a></p></div>`;
    }else{
      body+=`<div class="ww-detail-profile-block"><h3>${esc(t('detailProfileSaved'))}</h3><p class="ww-detail-profile-empty">${esc(t('detailProfileEmptySaved'))} — <a href="/account/">${esc(t('account'))}</a></p></div>`;
    }
  }
  return `<section class="ww-detail-profile" data-ww-detail-profile>
    <button type="button" class="ww-detail-profile-toggle" id="${btnId}" aria-expanded="false" aria-controls="${panelId}">
      <span class="ww-detail-profile-title">${esc(t('detailProfileTitle'))}</span>
      <span class="ww-detail-profile-action" data-ww-profile-action>${esc(t('detailProfileExpand'))}</span>
      <span class="ww-detail-profile-chevron" aria-hidden="true">▾</span>
    </button>
    <div class="ww-detail-profile-panel" id="${panelId}" hidden>${body}</div>
  </section>`;
}
function wireDetailSearchProfile(){
  const btn=document.getElementById('ww-detail-profile-toggle');
  const panel=document.getElementById('ww-detail-profile-panel');
  if(!btn||!panel)return;
  btn.onclick=()=>{
    const open=btn.getAttribute('aria-expanded')==='true';
    const next=!open;
    btn.setAttribute('aria-expanded',String(next));
    panel.hidden=!next;
    const action=btn.querySelector('[data-ww-profile-action]');
    if(action)action.textContent=next?t('detailProfileCollapse'):t('detailProfileExpand');
    btn.classList.toggle('is-open',next);
  };
}

function openProperty(p){active=p;const pics=photos(p);const entitled=typeof window.wwIsBellen==='function'&&window.wwIsBellen();
if(entitled&&!p.url&&p.id!=null&&!p._wwUrlFetch){p._wwUrlFetch=1;fetch('/api/listing/'+encodeURIComponent(p.id),{credentials:'include'}).then(r=>r.ok?r.json():null).then(j=>{if(j&&j.url){p.url=j.url;openProperty(p)}}).catch(()=>{});}const specs=[[t('area'),p.livingArea?p.livingArea+' m²':t('unknown')],[t('beds'),p.bedrooms||t('unknown')],[t('rooms'),p.rooms||t('unknown')],[t('energy'),p.energyLabel||t('unknown')],[t('built'),p.yearBuilt||t('unknown')],[t('garden'),p.garden==='true'?t('yes'):p.garden==='false'?t('no'):t('unknown')],[t('balcony'),p.balcony==='true'?t('yes'):p.balcony==='false'?t('no'):t('unknown')],[t('parking'),p.privateParking==='true'?t('yes'):p.privateParking==='false'?t('no'):t('unknown')]];
const desc=(!entitled && p.description)?String(p.description).slice(0,140)+(String(p.description).length>140?'…':''): (entitled && p.description?String(p.description):'');
const sourceBlock=entitled
  ? `<p>${t('sourceText')}</p><a class="primary" href="${esc(p.url||'')}" target="_blank" rel="noopener noreferrer">${t('source')}</a>`
  : `<div class="ww-detail-locked ww-paywall" data-ww-lock="source" data-ww-locked="1"><p>${esc(t('sourceLocked'))}</p><button type="button" class="primary" data-ww-checkout="1">${esc(t('unlockSource'))}</button><p class="ww-locked"><a href="/prijzen/">${esc(t('upgradeBellen'))}</a></p></div>`;
const FREE_PHOTO_LIMIT=3;const visiblePics=entitled?pics:pics.slice(0,FREE_PHOTO_LIMIT);const lockedExtra=entitled?0:Math.max(0,pics.length-FREE_PHOTO_LIMIT);
const galleryBtns=visiblePics.map((u,i)=>`<button type="button" class="${i===0?'active':''}" data-photo="${i}" aria-label="${esc(t('photos')+' '+(i+1))}" aria-pressed="${i===0}"><img src="${esc(photoSrc(u,'thumb'))}" loading="lazy" decoding="async" alt=""></button>`).join('')+(lockedExtra?`<button type="button" class="ww-photo-locked" data-photo-locked="1" aria-label="${esc(t('unlockPhotos'))}"><span class="ww-photo-lock-thumb" aria-hidden="true"></span><span class="ww-photo-lock-more">+${lockedExtra}</span></button>`:'');
const photosUnlockBlock=(!entitled&&lockedExtra)?`<div class="ww-photos-locked ww-paywall" data-ww-lock="photos" data-ww-locked="1"><p>${esc(t('photosLocked'))}</p><button type="button" class="primary" data-ww-checkout="1">${esc(t('unlockPhotos'))}</button><p class="ww-locked"><a href="/prijzen/">${esc(t('upgradeBellen'))}</a></p></div>`:'';
document.querySelector('#detail').innerHTML=`<div class="ww-detail-photos"><img class="detail-photo" id="large-photo" src="${esc(photoSrc(visiblePics[0]||p.photo,'detail'))}" decoding="async" alt="${esc(p.address)}"><div class="gallery">${galleryBtns}</div>${photosUnlockBlock}</div><div class="detail-body"><p class="location">${esc(p.city)} · ${esc(p.postalCode)}</p><h2>${esc(p.address)}</h2><div class="price">${money(p.price)} <small>${t('month')}</small></div><div class="detail-specs">${specs.map(([k,v])=>`<div><small>${k}</small><strong>${esc(v)}</strong></div>`).join('')}</div>${desc?`<p class="ww-detail-desc">${esc(desc)}</p>`:''}${detailSearchProfileHtml(p)}${sourceBlock}<p>${t('detailNote')}</p></div>`;
document.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>{const idx=+b.dataset.photo;if(!entitled&&idx>=FREE_PHOTO_LIMIT)return;const im=document.querySelector('#large-photo');im.src=photoSrc(visiblePics[idx],'detail');im.alt=p.address+' · '+(idx+1);document.querySelectorAll('[data-photo]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});imageFallbacks()});
document.querySelectorAll('[data-photo-locked]').forEach(b=>b.onclick=()=>{const el=document.querySelector('[data-ww-lock="photos"]');if(el)el.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
document.querySelectorAll('[data-ww-checkout]').forEach(b=>b.onclick=()=>{if(typeof window.startBellenCheckout==='function')window.startBellenCheckout(b.getAttribute('data-ww-checkout')==='ideal'?'ideal':undefined);else location.href='/prijzen/'});
wireDetailSearchProfile();
imageFallbacks();if(!dialog.open){dialog.showModal();document.body.style.overflow='hidden'}dialog.scrollTop=0;}
document.querySelector('.close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{document.body.style.overflow='';active=null});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});


const INSIGHT_SLUGS=['kamer-studio-or-house-netherlands','dutch-rental-search-without-refreshing','free-account-vs-bellen-woonwekker'];
function insightSlug(){const m=(location.pathname||'').match(/^\/insights\/?([^/]*)\/?$/);return m&&m[1]?m[1]:''}
function insightMeta(i){return{slug:INSIGHT_SLUGS[i],titleKey:'insightsA'+(i+1)+'Title',introKey:'insightsA'+(i+1)+'Intro'}}
function insightPageTitle(){const s=insightSlug();if(!s)return t('insightsTitle')+' | Woonwekker';const i=INSIGHT_SLUGS.indexOf(s);if(i<0)return t('insightsTitle')+' | Woonwekker';return t(insightMeta(i).titleKey)+' | Woonwekker'}
function insightsPromoHtml(extraHref){const href=extraHref||'/insights/';return `<aside class="editorial insights-promo" aria-label="${esc(t('insights'))}"><div><h2>${esc(t('insightsPromoTitle'))}</h2><p>${esc(t('insightsPromoText'))}</p></div><a href="${esc(href)}">${esc(t('insightsPromoLink'))}</a></aside>`}
function insightBodyKey(i){return 'insightsA'+(i+1)+'Body'}
function insightBodyHtml(slug){
  const i=INSIGHT_SLUGS.indexOf(slug);
  if(i<0)return '';
  const key=insightBodyKey(i);
  const local=copy[lang]&&copy[lang][key];
  if(local)return local;
  return (copy.en&&copy.en[key])||'';
}
function insightBodyIsEnFallback(slug){
  if(lang==='en')return false;
  const i=INSIGHT_SLUGS.indexOf(slug);
  if(i<0)return false;
  const key=insightBodyKey(i);
  const local=copy[lang]&&copy[lang][key];
  return !local && !!(copy.en&&copy.en[key]);
}
function renderInsights(){
  const slug=insightSlug();
  if(slug){
    const i=INSIGHT_SLUGS.indexOf(slug);
    if(i<0){main.innerHTML=`<div class="page-head"><h1>${esc(t('insightsTitle'))}</h1><p><a href="/insights/">${esc(t('insightsBack'))}</a></p></div>`;return}
    const meta=insightMeta(i);
    const enNote=insightBodyIsEnFallback(slug)?`<p class="notice">${esc(t('insightsEnNote'))}</p>`:'';
    main.innerHTML=`<div class="page-head"><div class="eyebrow">${esc(t('insights'))}</div><p class="insights-back"><a href="/insights/">${esc(t('insightsBack'))}</a></p><h1>${esc(t(meta.titleKey))}</h1>${enNote}</div><article class="prose insights-article">${insightBodyHtml(slug)}</article><aside class="insights-more"><h2>${esc(t('insights'))}</h2><ul>${INSIGHT_SLUGS.map((s,j)=>j===i?'':`<li><a href="/insights/${s}/">${esc(t(insightMeta(j).titleKey))}</a></li>`).join('')}</ul></aside>`;
    return;
  }
  const cards=INSIGHT_SLUGS.map((s,i)=>{const m=insightMeta(i);return `<article class="insight-card"><h2><a href="/insights/${s}/">${esc(t(m.titleKey))}</a></h2><p>${esc(t(m.introKey))}</p><a class="insight-read" href="/insights/${s}/">${esc(t('insightsReadMore'))}</a></article>`}).join('');
  main.innerHTML=`<div class="page-head"><div class="eyebrow">${esc(t('insights'))}</div><h1>${esc(t('insightsTitle'))}</h1><p>${esc(t('insightsIntro'))}</p></div><div class="insights-grid">${cards}</div>`;
}

function renderPricing(){main.innerHTML=`<div class="page-head"><div class="eyebrow">${t('pricing')}</div><h1>${t('pricingTitle')}</h1><p>${t('pricingIntro')}</p></div><div class="pricing-grid"><article class="price-card"><h2>${t('kijkenTitle')}</h2><div class="price-amount">${t('kijkenPrice')}<small>${t('kijkenPeriod')}</small></div><ul><li>${t('kijkenFeat1')}</li><li>${t('kijkenFeat2')}</li><li>${t('kijkenFeat3')}</li><li>${t('kijkenFeat4')}</li><li>${t('kijkenFeat5')}</li><li>${t('kijkenFeat6')}</li></ul><a class="primary outline" href="/">${t('kijkenCta')}</a></article><article class="price-card featured"><h2>${t('bellenTitle')}</h2><div class="price-amount">${t('bellenPrice')}<small>${t('bellenPeriod')}</small></div><ul><li>${t('bellenFeat1')}</li><li>${t('bellenFeat2')}</li><li>${t('bellenFeat3')}</li><li>${t('bellenFeat4')}</li><li>${t('bellenFeat5')}</li><li>${t('bellenFeat6')}</li></ul><button type="button" class="primary" data-ww-checkout="1">${t('bellenCta')}</button><button type="button" class="ghost" data-ww-checkout="ideal">${t('bellenIdealCta')}</button></article></div><p class="ww-strip-anti">${t('pricingAntiTrial')}</p><p class="ww-risk-badge">${t('riskBadge')}</p><p class="ww-bellen-note">${t('bellenAlertNote')}</p><p class="pricing-note">${t('pricingNote')}</p>${insightsPromoHtml()}`;document.querySelectorAll('[data-ww-checkout]').forEach(b=>b.onclick=()=>window.startBellenCheckout&&window.startBellenCheckout(b.getAttribute('data-ww-checkout')==='ideal'?'ideal':undefined));}
function renderFaq(){main.innerHTML=`<div class="page-head"><div class="eyebrow">${t('faq')}</div><h1>${t('faqTitle')}</h1><p>${t('faqIntro')}</p></div><div class="prose">${t('faqItems').map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>${insightsPromoHtml()}`}
function renderLegal(){main.innerHTML=`<div class="page-head"><div class="eyebrow">${t('legal')}</div><h1>${t('legalTitle')}</h1><p>${t('legalIntro')}</p></div><nav class="legal-nav">${['about','terms','privacy','cookies'].map((id,i)=>`<a href="#${id}">${t('legalNav')[i]}</a>`).join('')}</nav><div class="prose"><p class="notice">${t('draft')}</p>${t('legalSections').map(([id,title,...paras])=>`<section id="${id}"><h2>${title}</h2>${paras.map(p=>`<p>${p}</p>`).join('')}${id==='cookies'?`<button class="more" id="clear-language">${t('clear')}</button><p id="clear-status" role="status"></p>`:''}</section>`).join('')}<section><h2>${t('references')}</h2><p><a href="https://autoriteitpersoonsgegevens.nl/" target="_blank" rel="noopener noreferrer">Autoriteit Persoonsgegevens ↗</a><br><a href="https://business.gov.nl/regulations/cookies/" target="_blank" rel="noopener noreferrer">Business.gov.nl — Cookies ↗</a><br><a href="https://business.gov.nl/regulations/protection-personal-data/" target="_blank" rel="noopener noreferrer">Business.gov.nl — GDPR ↗</a></p></section></div>`;document.querySelector('#clear-language').onclick=()=>{try{localStorage.removeItem('woonwekker-language')}catch{}document.querySelector('#clear-status').textContent=t('cleared')};if(location.hash)requestAnimationFrame(()=>document.getElementById(location.hash.slice(1))?.scrollIntoView())}
function changeLanguage(value){lang=value;try{localStorage.setItem('woonwekker-language',lang)}catch{}render();if(active)openProperty(active)}
document.querySelector('#language').onchange=e=>changeLanguage(e.target.value);
const languageCodes=['nl','en','es','pl','pt'].filter(code=>copy[code]);
const languageName=code=>{const map=t('languageOf');return (map&&map[code])||code};
const languageWrap=document.querySelector('.language');
languageWrap.classList.add('custom-language');
const languageSelect=document.querySelector('#language');languageSelect.hidden=true;languageSelect.tabIndex=-1;
languageWrap.querySelector('span').remove();
languageWrap.insertAdjacentHTML('beforeend',`<button type="button" class="language-trigger" id="language-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="language-menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg><span id="language-name"></span><svg class="chevron" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></button><div class="language-menu" id="language-menu" role="menu" aria-label="Language" hidden><div class="language-heading" id="language-heading"></div>${languageCodes.map(code=>`<button type="button" role="menuitemradio" aria-checked="false" data-language="${code}"><span class="language-code">${code.toUpperCase()}</span><span class="language-native"></span><span class="language-check" aria-hidden="true">✓</span></button>`).join('')}</div>`);
const languageTrigger=document.querySelector('#language-trigger'),languageMenu=document.querySelector('#language-menu');
function closeLanguage(focus=false){languageMenu.hidden=true;languageTrigger.setAttribute('aria-expanded','false');if(focus)languageTrigger.focus()}
function syncLanguageMenu(){const heading=t('languageHeading')||'Language';document.querySelector('#language-heading').textContent=heading;languageMenu.setAttribute('aria-label',heading);document.querySelector('#language-name').textContent=languageName(lang);document.querySelectorAll('[data-language]').forEach(b=>{b.setAttribute('aria-checked',String(b.dataset.language===lang));const label=b.querySelector('.language-native');if(label)label.textContent=languageName(b.dataset.language)});languageSelect.querySelectorAll('option').forEach(o=>{o.textContent=languageName(o.value)})}
languageTrigger.onclick=e=>{e.preventDefault();const open=languageMenu.hidden;languageMenu.hidden=!open;languageTrigger.setAttribute('aria-expanded',String(open));if(open)languageMenu.querySelector('[aria-checked="true"]').focus()};
languageMenu.querySelectorAll('button').forEach(b=>b.onclick=e=>{e.preventDefault();changeLanguage(b.dataset.language);closeLanguage(true)});
languageMenu.onkeydown=e=>{const buttons=[...languageMenu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus()}if(e.key==='Escape'){e.preventDefault();closeLanguage(true)}if(e.key==='Tab')closeLanguage()};
document.addEventListener('click',e=>{if(!languageWrap.contains(e.target))closeLanguage()});
languageWrap.addEventListener('focusout',()=>setTimeout(()=>{if(!languageWrap.contains(document.activeElement))closeLanguage()},0));
syncLanguageMenu();
async function init(){frame();main.innerHTML=`<p class="loading" role="status">Woonwekker…</p>`;try{await refreshEntitlement();const response=await fetch('/listings.json',{credentials:'include',cache:'no-store'});if(!response.ok)throw Error('Data unavailable');listings=(await response.json()).filter(p=>{
    const src=String(p.source||'').toLowerCase();
    if(src==='funda'||src==='pararius'||src==='kamernet')return true;
    const u=String(p.url||'');
    return /^https:\/\/www\.funda\.nl\/(detail\/)?huur\//.test(u)||/^https:\/\/www\.funda\.nl\/detail\//.test(u)||/^https:\/\/www\.pararius\.nl\/(appartement|huis|studio|kamer)-te-huur\//.test(u)||/^https:\/\/(www\.)?kamernet\.nl\/(en\/)?for-rent\/(room|studio)-/.test(u);
  }).map((p,i)=>({...p,id:String(i)}));render()}catch{main.innerHTML=`<div class="empty"><h1>${t('loadError')}</h1><button class="primary" id="retry">${t('retry')}</button></div>`;document.querySelector('#retry').onclick=init}}
init();

