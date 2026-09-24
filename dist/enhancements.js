const extra={
nl:{all:'Alle advertenties',saved:'Favorieten',save:'Bewaren',unsave:'Verwijderen uit favorieten',compare:'Vergelijken',comparison:'Jouw vergelijking',choose:'Selecteer 2 of 3 woningen om te vergelijken.',limit:'Je kunt maximaal 3 advertenties vergelijken.',clear:'Wissen',type:'Woningtype',typesAll:'Alle types',types:['Alle types','Appartement','Huis','Studio','Kamer'],area:'Min. oppervlakte',any:'Geen minimum',minBudget:'Min. huur per maand',garden:'Met tuin',balcony:'Met balkon',energy:'Energielabel A of beter',filters:'Meer filters',reset:'Alles wissen',local:'Favorieten worden op dit apparaat bewaard.',monthly:'Maandhuur',perM:'Huur per m² / maand',open:'Bekijken',remove:'Uit vergelijking verwijderen',empty:'Je hebt nog geen favorieten.',hint:'Bewaar een advertentie met het hartje en vind deze hier terug.',active:'Actieve filters',about:'Favorieten en vergelijken',faq:'Gebruik het hartje om advertenties op dit apparaat te bewaren. Selecteer Vergelijken bij 2 of 3 advertenties voor een overzicht van prijs, oppervlakte en kenmerken. Er is geen account nodig.',data:'Niet alle kosten zijn bekend. Controleer servicekosten, energie en borg bij de aanbieder.',forget:'Wis alle opgeslagen voorkeuren',forgot:'Voorkeuren en favorieten gewist.'},
en:{all:'All listings',saved:'Favourites',save:'Save',unsave:'Remove from favourites',compare:'Compare',comparison:'Your comparison',choose:'Select 2 or 3 homes to compare.',limit:'You can compare up to 3 listings.',clear:'Clear',type:'Property type',typesAll:'All types',types:['All types','Apartment','House','Studio','Room'],area:'Minimum area',any:'No minimum',minBudget:'Min. monthly rent',garden:'With a garden',balcony:'With a balcony',energy:'Energy rating A or better',filters:'More filters',reset:'Clear all',local:'Favourites are saved on this device.',monthly:'Monthly rent',perM:'Rent per m² / month',open:'View home',remove:'Remove from comparison',empty:'No favourites yet.',hint:'Save a listing with the heart and find it here later.',active:'Active filters',about:'Favourites and comparison',faq:'Use the heart to save listings on this device. Select Compare on 2 or 3 listings to review price, area and features side by side. No account is needed.',data:'Not all costs are known. Check service charges, energy and deposits with the provider.',forget:'Clear all saved preferences',forgot:'Preferences and favourites cleared.'},
es:{all:'Todos los anuncios',saved:'Favoritos',save:'Guardar',unsave:'Quitar de favoritos',compare:'Comparar',comparison:'Tu comparación',choose:'Selecciona 2 o 3 viviendas para comparar.',limit:'Puedes comparar hasta 3 anuncios.',clear:'Borrar',type:'Tipo de inmueble',typesAll:'Todos los tipos',types:['Todos los tipos','Apartamento','Casa','Estudio','Habitación'],area:'Superficie mínima',any:'Sin mínimo',minBudget:'Alquiler mensual mínimo',garden:'Con jardín',balcony:'Con balcón',energy:'Clase energética A o superior',filters:'Más filtros',reset:'Borrar todo',local:'Los favoritos se guardan en este dispositivo.',monthly:'Alquiler mensual',perM:'Alquiler por m² / mes',open:'Ver vivienda',remove:'Quitar de la comparación',empty:'Todavía no tienes favoritos.',hint:'Guarda un anuncio con el corazón y encuéntralo aquí.',active:'Filtros activos',about:'Favoritos y comparación',faq:'Usa el corazón para guardar anuncios en este dispositivo. Selecciona Comparar en 2 o 3 anuncios para comparar precio, superficie y características. No necesitas una cuenta.',data:'No se conocen todos los gastos. Consulta los servicios, la energía y la fianza con el anunciante.',forget:'Borrar todas las preferencias guardadas',forgot:'Preferencias y favoritos eliminados.'},
pl:{all:'Wszystkie oferty',saved:'Ulubione',save:'Zapisz',unsave:'Usuń z ulubionych',compare:'Porównaj',comparison:'Twoje porównanie',choose:'Wybierz 2 lub 3 nieruchomości do porównania.',limit:'Możesz porównać maksymalnie 3 oferty.',clear:'Wyczyść',type:'Typ nieruchomości',typesAll:'Wszystkie typy',types:['Wszystkie typy','Mieszkanie','Dom','Kawalerka','Pokój'],area:'Minimalna powierzchnia',any:'Bez minimum',minBudget:'Minimalny czynsz miesięczny',garden:'Z ogrodem',balcony:'Z balkonem',energy:'Klasa energetyczna A lub lepsza',filters:'Więcej filtrów',reset:'Wyczyść wszystko',local:'Ulubione są zapisywane na tym urządzeniu.',monthly:'Czynsz miesięczny',perM:'Czynsz za m² / miesiąc',open:'Zobacz ofertę',remove:'Usuń z porównania',empty:'Nie masz jeszcze ulubionych.',hint:'Zapisz ofertę serduszkiem, aby znaleźć ją tutaj.',active:'Aktywne filtry',about:'Ulubione i porównanie',faq:'Zapisuj oferty serduszkiem na tym urządzeniu. Wybierz Porównaj przy 2 lub 3 ofertach, aby zestawić ceny, powierzchnię i cechy. Konto nie jest wymagane.',data:'Nie wszystkie koszty są znane. Sprawdź opłaty, energię i kaucję u ogłoszeniodawcy.',forget:'Usuń wszystkie zapisane preferencje',forgot:'Usunięto preferencje i ulubione.'}};
const x=k=>extra[lang][k];
function listingKey(p){if(!p)return'';const u=p.url!=null?String(p.url).trim():'';if(u)return u;return p.id!=null?String(p.id):''}
let favouriteIds=new Set();try{const a=JSON.parse(localStorage.getItem('woonwekker-favourites')||'[]');if(Array.isArray(a))favouriteIds=new Set(a.filter(v=>typeof v==='string'&&v))}catch{}
let compareIds=new Set(),savedOnly=false,favMigrated=false;
Object.assign(filters,{type:'',area:'',minBudget:'',garden:false,balcony:false,energy:false});
function migrateFavourites(){if(favMigrated||!listings.length)return;favMigrated=true;const next=new Set();for(const k of favouriteIds){if(!k)continue;const hit=listings.find(p=>(p.url&&String(p.url)===k)||String(p.id)===k);next.add(hit?listingKey(hit):k)}favouriteIds=next;try{localStorage.setItem('woonwekker-favourites',JSON.stringify([...favouriteIds]))}catch{}}
function typeValuesFor(kind){if(kind==='rooms')return['Kamer','Studio'];if(kind==='homes')return['Huis','Appartement'];return['Appartement','Huis','Studio','Kamer']}
function typeLabel(v){if(!v)return x('typesAll');if(v==='Appartement')return t('apartment');if(v==='Huis')return t('house');if(v==='Studio')return t('studio');if(v==='Kamer')return t('room');return v}
function sanitizeTypeForKind(kind){const allowed=typeValuesFor(kind);if(filters.type&&!allowed.includes(filters.type))filters.type=''}
function defaultPtype(kind){return kind==='rooms'?'rooms':kind==='homes'?'homes':''}
function syncFilterFields(){
  const map={city:'city',budget:'budget',beds:'beds',ptype:'ptype',sort:'sort'};
  Object.entries(map).forEach(([k,id])=>{const el=document.getElementById(id);if(!el)return;if(el.value!==String(filters[k]??''))el.value=filters[k]??''});
  const pt=document.getElementById('property-type');if(pt)pt.value=filters.type||'';
  const area=document.getElementById('min-area');if(area)area.value=filters.area||'';
  const minB=document.getElementById('min-budget');if(minB)minB.value=filters.minBudget||'';
  ['garden','balcony','energy'].forEach(k=>{const el=document.getElementById('filter-'+k);if(el)el.checked=!!filters[k]});
}
let cityDebounce=null;
function wireLivePrimary(){
  const city=document.getElementById('city');
  if(city){
    city.oninput=()=>{clearTimeout(cityDebounce);cityDebounce=setTimeout(()=>{filters.city=city.value;limit=12;applyFilters()},200)};
  }
  ['budget','beds','ptype'].forEach(k=>{
    const el=document.getElementById(k);
    if(!el)return;
    el.onchange=()=>{filters[k]=el.value;limit=12;applyFilters()};
  });
}
function injectDiscoveryTools(){
  const form=document.querySelector('#search');
  if(!form||document.querySelector('.discovery-tools'))return;
  const kind=typeof pageKind==='function'?pageKind():'all';
  sanitizeTypeForKind(kind);
  const typeOpts=['',...typeValuesFor(kind)];
  const advancedOpen=filters.type||filters.area||filters.minBudget||filters.garden||filters.balcony||filters.energy?'open':'';
  form.insertAdjacentHTML('afterend',`<div class="discovery-tools"><div class="view-tabs"><button type="button" id="all-listings" class="${!savedOnly?'selected':''}" aria-pressed="${!savedOnly}">${x('all')}</button><button type="button" id="saved-listings" class="${savedOnly?'selected':''}" aria-pressed="${savedOnly}">♡ ${x('saved')} <span>${favouriteIds.size}</span></button></div><details class="advanced" ${advancedOpen}><summary>${x('filters')} <span aria-hidden="true">＋</span></summary><div class="advanced-fields"><label>${x('type')}<select id="property-type">${typeOpts.map(v=>`<option value="${v}" ${v===filters.type?'selected':''}>${typeLabel(v)}</option>`).join('')}</select></label><label>${x('area')}<select id="min-area"><option value="">${x('any')}</option>${[25,50,75,100,150].map(v=>`<option value="${v}" ${filters.area==v?'selected':''}>${v} m²</option>`).join('')}</select></label><label>${x('minBudget')}<select id="min-budget"><option value="">${x('any')}</option>${[500,800,1000,1200,1500,2000].map(v=>`<option value="${v}" ${filters.minBudget==v?'selected':''}>${money(v)}</option>`).join('')}</select></label>${['garden','balcony','energy'].map(k=>`<label class="check-filter"><input type="checkbox" id="filter-${k}" ${filters[k]?'checked':''}>${x(k)}</label>`).join('')}</div></details></div><div class="active-filters" id="active-filters" aria-label="${x('active')}"></div><p class="local-note" id="saved-note" ${savedOnly?'':'hidden'}>${x('local')}</p><p id="interaction-status" class="interaction-status" role="status"></p>`);
  const setSaved=v=>{savedOnly=v;document.querySelector('#all-listings')?.classList.toggle('selected',!savedOnly);document.querySelector('#saved-listings')?.classList.toggle('selected',savedOnly);document.querySelector('#all-listings')?.setAttribute('aria-pressed',String(!savedOnly));document.querySelector('#saved-listings')?.setAttribute('aria-pressed',String(savedOnly));const note=document.querySelector('#saved-note');if(note)note.hidden=!savedOnly;limit=12;applyFilters()};
  document.querySelector('#all-listings').onclick=()=>setSaved(false);
  document.querySelector('#saved-listings').onclick=()=>setSaved(true);
  document.querySelector('#property-type').onchange=e=>{filters.type=e.target.value;limit=12;applyFilters()};
  document.querySelector('#min-area').onchange=e=>{filters.area=e.target.value;limit=12;applyFilters()};
  document.querySelector('#min-budget').onchange=e=>{filters.minBudget=e.target.value;limit=12;applyFilters()};
  ['garden','balcony','energy'].forEach(k=>document.querySelector('#filter-'+k).onchange=e=>{filters[k]=e.target.checked;limit=12;applyFilters()});
  wireLivePrimary();
  applyFilters();
}
const originalHomes=renderHomes,originalCategory=renderCategory,originalCards=drawCards,originalFaq=renderFaq,originalLegal=renderLegal;
renderHomes=function(){originalHomes();injectDiscoveryTools()};
renderCategory=function(ptype){originalCategory(ptype);injectDiscoveryTools()};
applyFilters=function(){
  migrateFavourites();
  const kind=typeof pageKind==='function'?pageKind():'all';
  if(kind==='rooms'&&filters.ptype!=='Kamer'&&filters.ptype!=='Studio')filters.ptype='rooms';
  if(kind==='homes'&&filters.ptype!=='Huis'&&filters.ptype!=='Appartement')filters.ptype='homes';
  sanitizeTypeForKind(kind);
  filtered=listings.filter(p=>{
    if(typeof typeAllowed==='function'&&!typeAllowed(p.propertyType,kind))return false;
    if(savedOnly&&!favouriteIds.has(listingKey(p)))return false;
    if(filters.city&&!norm([p.city,p.address,p.neighbourhood,p.postalCode].join(' ')).includes(norm(filters.city.trim())))return false;
    if(filters.budget&&!(p.price&&+p.price<=+filters.budget))return false;
    if(filters.minBudget&&!(p.price&&+p.price>=+filters.minBudget))return false;
    if(filters.beds&&!(p.bedrooms!==''&&p.bedrooms!=null&&+p.bedrooms>=+filters.beds))return false;
    if(filters.type&&p.propertyType!==filters.type)return false;
    if(filters.ptype&&filters.ptype!=='rooms'&&filters.ptype!=='homes'&&p.propertyType!==filters.ptype)return false;
    if(filters.area&&!(p.livingArea&&+p.livingArea>=+filters.area))return false;
    if(filters.garden&&p.garden!=='true')return false;
    if(filters.balcony&&p.balcony!=='true')return false;
    if(filters.energy&&!/^A\+*$/.test(p.energyLabel||''))return false;
    return true;
  });
  if(filters.sort==='priceAsc')filtered.sort((a,b)=>+a.price-+b.price);
  if(filters.sort==='priceDesc')filtered.sort((a,b)=>+b.price-+a.price);
  if(filters.sort==='area')filtered.sort((a,b)=>+b.livingArea-+a.livingArea);
  drawCards();drawChips();
};
function clearFilters(){
  const kind=typeof pageKind==='function'?pageKind():'all';
  Object.assign(filters,{city:'',budget:'',beds:'',type:'',area:'',minBudget:'',garden:false,balcony:false,energy:false,sort:'source'});
  filters.ptype=defaultPtype(kind);
  limit=12;
  syncFilterFields();
  const adv=document.querySelector('details.advanced');
  if(adv)adv.open=false;
  applyFilters();
}
function drawChips(){
  const node=document.querySelector('#active-filters');
  if(!node)return;
  const labels={
    city:filters.city,
    budget:filters.budget?`≤ ${money(filters.budget)}`:'',
    minBudget:filters.minBudget?`≥ ${money(filters.minBudget)}`:'',
    beds:filters.beds?`${filters.beds}+ ${t('beds')}`:'',
    type:filters.type?typeLabel(filters.type):'',
    area:filters.area?`≥ ${filters.area} m²`:'',
    garden:filters.garden?x('garden'):'',
    balcony:filters.balcony?x('balcony'):'',
    energy:filters.energy?x('energy'):''
  };
  node.innerHTML=Object.entries(labels).filter(([,v])=>v).map(([k,v])=>`<button type="button" data-clear-filter="${k}">${esc(v)} <span aria-hidden="true">×</span></button>`).join('');
  if(node.children.length)node.insertAdjacentHTML('beforeend',`<button type="button" id="clear-all" class="text-clear">${x('reset')}</button>`);
  node.querySelectorAll('[data-clear-filter]').forEach(b=>b.onclick=()=>{
    const key=b.dataset.clearFilter;
    filters[key]=['garden','balcony','energy'].includes(key)?false:'';
    const kind=typeof pageKind==='function'?pageKind():'all';
    if(!filters.ptype)filters.ptype=defaultPtype(kind);
    limit=12;
    syncFilterFields();
    applyFilters();
  });
  node.querySelector('#clear-all')?.addEventListener('click',clearFilters);
}
drawCards=function(){
  migrateFavourites();
  originalCards();
  document.querySelectorAll('.card').forEach(card=>{
    const idEl=card.querySelector('[data-id]');
    if(!idEl)return;
    const p=listings.find(p=>p.id===idEl.dataset.id);
    if(!p)return;
    const key=listingKey(p);
    const saved=favouriteIds.has(key),selected=compareIds.has(key);
    card.insertAdjacentHTML('beforeend',`<button class="save-home ${saved?'saved':''}" data-save="${p.id}" aria-label="${x(saved?'unsave':'save')}: ${esc(p.address)}" aria-pressed="${saved}">${saved?'♥':'♡'}</button><div class="card-actions"><button class="compare-home ${selected?'selected':''}" data-compare="${p.id}" aria-pressed="${selected}"><span aria-hidden="true">${selected?'✓':'＋'}</span> ${x('compare')}</button>${+p.livingArea>0&&+p.price>0?`<span>${money(+p.price/+p.livingArea)}/m²</span>`:''}</div>`);
  });
  document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>{
    const p=listings.find(p=>p.id===b.dataset.save);if(!p)return;
    const key=listingKey(p);if(!key)return;
    favouriteIds.has(key)?favouriteIds.delete(key):favouriteIds.add(key);
    try{localStorage.setItem('woonwekker-favourites',JSON.stringify([...favouriteIds]))}catch{}
    applyFilters();
    const n=document.querySelector('#saved-listings span');if(n)n.textContent=favouriteIds.size;
  });
  document.querySelectorAll('[data-compare]').forEach(b=>b.onclick=()=>{
    const p=listings.find(p=>p.id===b.dataset.compare);if(!p)return;
    const key=listingKey(p);if(!key)return;
    if(compareIds.has(key))compareIds.delete(key);
    else if(compareIds.size<3)compareIds.add(key);
    else{document.querySelector('#interaction-status').textContent=x('limit');return}
    document.querySelector('#interaction-status').textContent='';
    drawCards();
  });
  if(!filtered.length&&savedOnly&&favouriteIds.size===0){
    const eh=document.querySelector('.empty h3'),ep=document.querySelector('.empty p');
    if(eh)eh.textContent=x('empty');if(ep)ep.textContent=x('hint');
  }
  document.querySelector('#reset')?.addEventListener('click',clearFilters);
  drawCompareTray();
};
function drawCompareTray(){
  document.querySelector('#compare-tray')?.remove();
  if(!compareIds.size)return;
  main.insertAdjacentHTML('beforeend',`<aside id="compare-tray" class="compare-tray"><div><strong>${x('comparison')} · ${compareIds.size}/3</strong><small>${x('choose')}</small></div><button class="primary" id="open-comparison" ${compareIds.size<2?'disabled':''}>${x('compare')} →</button><button class="tray-clear" id="clear-comparison">${x('clear')}</button></aside>`);
  document.querySelector('#open-comparison').onclick=showComparison;
  document.querySelector('#clear-comparison').onclick=()=>{compareIds.clear();drawCards()};
}
const compareDialog=document.createElement('dialog');compareDialog.className='comparison-dialog';compareDialog.setAttribute('aria-labelledby','compare-title');document.body.append(compareDialog);
function showComparison(){
  const chosen=listings.filter(p=>compareIds.has(listingKey(p)));
  const value=(p,k)=>p[k]==='true'?t('yes'):p[k]==='false'?t('no'):p[k]||t('unknown');
  const rows=[[x('monthly'),p=>money(p.price)],[t('area'),p=>p.livingArea?p.livingArea+' m²':t('unknown')],[x('perM'),p=>+p.livingArea>0?money(+p.price/+p.livingArea):t('unknown')],[t('beds'),p=>value(p,'bedrooms')],[t('energy'),p=>value(p,'energyLabel')],[t('garden'),p=>value(p,'garden')],[t('balcony'),p=>value(p,'balcony')],[t('parking'),p=>value(p,'privateParking')]];
  compareDialog.innerHTML=`<div class="comparison-head"><div><h2 id="compare-title">${x('comparison')}</h2><p>${x('data')}</p></div><button id="close-comparison" aria-label="${t('close')}">×</button></div><div class="comparison-scroll"><table><thead><tr><th></th>${chosen.map(p=>`<th><img src="${esc(safePhoto(p.photo))}" alt="${esc(p.address)}"><strong>${esc(p.address)}</strong><small>${esc(p.city)}</small></th>`).join('')}</tr></thead><tbody>${rows.map(([name,get])=>`<tr><th scope="row">${name}</th>${chosen.map(p=>`<td>${esc(get(p))}</td>`).join('')}</tr>`).join('')}<tr><th></th>${chosen.map(p=>`<td><button class="primary" data-open-comp="${p.id}">${x('open')}</button></td>`).join('')}</tr></tbody></table></div>`;
  compareDialog.querySelector('#close-comparison').onclick=()=>compareDialog.close();
  compareDialog.querySelectorAll('[data-open-comp]').forEach(b=>b.onclick=()=>{compareDialog.close();openProperty(listings.find(p=>p.id===b.dataset.openComp))});
  compareDialog.showModal();document.body.style.overflow='hidden';imageFallbacks();
}
compareDialog.addEventListener('close',()=>{document.body.style.overflow=''});
renderFaq=function(){originalFaq();document.querySelector('.prose').insertAdjacentHTML('afterbegin',`<details><summary>${x('about')}</summary><p>${x('faq')}</p></details>`)};
renderLegal=function(){originalLegal();const btn=document.querySelector('#clear-language');btn.textContent=x('forget');btn.onclick=()=>{try{localStorage.removeItem('woonwekker-language');localStorage.removeItem('woonwekker-favourites')}catch{}favouriteIds.clear();compareIds.clear();document.querySelector('#clear-status').textContent=x('forgot')}};
if(listings.length)render();

/* --- 3D card tilt (pointer) --- */
function wwReducedMotion(){try{return matchMedia('(prefers-reduced-motion:reduce)').matches}catch{return true}}
function wwFinePointer(){try{return matchMedia('(hover:hover) and (pointer:fine)').matches}catch{return false}}
function wwBindCardTilt(root){
  if(wwReducedMotion()||!wwFinePointer())return;
  (root||document).querySelectorAll('.card').forEach(card=>{
    if(card.dataset.tiltBound)return;
    card.dataset.tiltBound='1';
    let raf=0;
    const onMove=e=>{
      const r=card.getBoundingClientRect();
      const px=(e.clientX-r.left)/r.width-.5;
      const py=(e.clientY-r.top)/r.height-.5;
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        card.classList.add('is-tilting');
        card.style.transform=`rotateY(${px*10}deg) rotateX(${-py*8}deg) translateY(-4px)`;
      });
    };
    const reset=()=>{cancelAnimationFrame(raf);card.classList.remove('is-tilting');card.style.transform=''};
    card.addEventListener('pointermove',onMove);
    card.addEventListener('pointerleave',reset);
    card.addEventListener('pointercancel',reset);
  });
}
const wwOriginalDrawCards=drawCards;
drawCards=function(){wwOriginalDrawCards();wwBindCardTilt(document.querySelector('#results')||document)};
