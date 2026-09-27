const KEY='mfactu-v5-ui';

const baseState={
  clients:[],
  prospects:[],
  dossiers:[],
  dashboard:{activeClients:0,currentMonthFeeCents:0,contractsPending:0,dossiersTodo:0},
  orchestrator:{
    active:true,target:50,found:0,contacted:0,replies:0,hot:0,proposals:0,
    today:{searched:0,qualified:0,contacted:0,replies:0,hot:0,proposals:0,signed:0}
  },
  reporting:{daily:false,signedAlert:false,ownerAlert:false}
};

function cloneBase(){return JSON.parse(JSON.stringify(baseState))}
function load(){
  const fresh=cloneBase();
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
    fresh.reporting={...fresh.reporting,...(saved.reporting||{})};
  }catch{}
  return fresh;
}
let state=load();
function save(){localStorage.setItem(KEY,JSON.stringify({reporting:state.reporting}))}
function euro(n){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n)||0)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function contactInfo(p){
  const bits=[];
  if(p.email)bits.push(`✉ <a href="mailto:${encodeURIComponent(p.email)}">${esc(p.email)}</a>`);
  if(p.phone)bits.push(`☎ <a href="tel:${encodeURIComponent(p.phone)}">${esc(p.phone)}</a>`);
  return bits.length?`<small class="lead-contact">${bits.join(' · ')}</small>`:'<small class="lead-contact muted">Coordonnées à enrichir</small>';
}
function makeNavigable(el,href){
  if(!el||!href)return;
  el.dataset.href=href;
  el.classList.add('clickable-card');
  el.setAttribute('role','link');
  if(!el.hasAttribute('tabindex'))el.tabIndex=0;
}
function bindCardNavigation(){
  const map=[
    ['kClients','/admin#clients'],
    ['kFactu','/admin#billing'],
    ['kContracts','/orchestrateur#prospects'],
    ['kTodo','/admin#dossiers']
  ];
  map.forEach(([id,href])=>{
    const el=document.getElementById(id);
    makeNavigable(el&&el.closest('.kpi'),href);
  });

  const goal=document.querySelector('.goal-card');
  if(goal){goal.id='objectif-commercial';makeNavigable(goal,'/orchestrateur#prospects');}

  const activity=document.getElementById('todayFound')?.closest('.premium-card');
  makeNavigable(activity,'/orchestrateur');
  document.querySelectorAll('.activity-grid>div').forEach(el=>makeNavigable(el,'/orchestrateur'));

  const priority=document.getElementById('priorityList')?.closest('.premium-card');
  makeNavigable(priority,'/orchestrateur#prospects');

  const prospects=document.getElementById('prospectRows')?.closest('.premium-card');
  makeNavigable(prospects,'/orchestrateur#prospects');

  const report=document.getElementById('reportFound')?.closest('.premium-card');
  makeNavigable(report,'/orchestrateur#reports');
  document.querySelectorAll('.report-preview>div').forEach(el=>makeNavigable(el,'/orchestrateur#reports'));

  const reportSettings=document.getElementById('dailyReportToggle')?.closest('.premium-card');
  if(reportSettings)reportSettings.id='reports';

  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-href]');
    if(!target)return;
    if(e.target.closest('a,button,input,select,textarea,label'))return;
    const href=target.dataset.href;
    if(href)location.href=href;
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const target=e.target.closest('[data-href]');
    if(!target||e.target.closest('a,button,input,select,textarea,label'))return;
    e.preventDefault();
    const href=target.dataset.href;
    if(href)location.href=href;
  });
}

function toast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
function pill(s){let c='p-new';if(/Contact/.test(s))c='p-contact';if(/relancer|attente|traiter/i.test(s))c='p-wait';if(/Intéressé/.test(s))c='p-hot';if(/Proposition/.test(s))c='p-proposal';if(/Client|Actif|Payé|signé/i.test(s))c='p-client';if(/Rejet/.test(s))c='p-reject';if(/Télétransmis|transmettre/.test(s))c='p-transmit';return `<span class="pill ${c}">${s}</span>`}
function navMobile(){const b=document.querySelector('.mobile-nav');if(!b)return;b.onclick=()=>{const n=document.querySelector('.nav');n.style.display=n.style.display==='flex'?'none':'flex';n.style.position='absolute';n.style.top='72px';n.style.left='0';n.style.right='0';n.style.background='#fff';n.style.padding='12px 20px';n.style.flexDirection='column';n.style.alignItems='stretch'}}
function openModal(id){document.getElementById(id)?.classList.add('open')}
function closeModal(id){document.getElementById(id)?.classList.remove('open')}
window.openModal=openModal;window.closeModal=closeModal;

function setText(id,value){const e=document.getElementById(id);if(e)e.textContent=value}
function contractsPending(){return state.prospects.filter(p=>p.status==='Proposition envoyée').length}
function clientsSignedToday(){return state.orchestrator.today.signed||0}
function hotProspects(){return [...state.prospects].filter(p=>['Intéressé','Proposition envoyée','À relancer'].includes(p.status)).sort((a,b)=>b.score-a.score)}

function renderAdmin(){
  const dash=state.dashboard||{};
  const signed=Number(dash.activeClients||0),target=state.orchestrator.target;
  const caFactu=Number(dash.currentMonthFeeCents||0)/100;
  const todo=Number(dash.dossiersTodo||0);
  const remaining=Math.max(0,target-signed);
  const pct=Math.min(100,Math.round(signed/target*100));

  setText('kClients',signed);
  setText('kFactu',euro(caFactu));
  setText('kContracts',Number(dash.contractsPending||0));
  setText('kTodo',todo);
  setText('clientGoalMini',`Objectif ${target}`);
  setText('targetLabel',`${signed} / ${target}`);
  setText('goalPercent',`${pct} %`);
  setText('clientsRemaining',remaining);
  setText('goalProjection',euro(target*10000*.035)+' HT/mois');
  const p=document.getElementById('targetProgress');if(p)p.style.width=`${pct}%`;

  const t=state.orchestrator.today;
  setText('todayFound',t.searched);
  setText('todayContacted',t.contacted);
  setText('todayReplies',t.replies);
  setText('todayHot',t.hot);
  setText('todayProposals',t.proposals);
  setText('todaySigned',t.signed);

  const priority=document.getElementById('priorityList');
  if(priority){
    const hot=state.prospects.filter(p=>p.status==='Intéressé').length;
    const contract=contractsPending();
    const relance=state.prospects.filter(p=>p.status==='À relancer').length;
    priority.innerHTML=[
      `<div class="priority-item priority-hot clickable-card" data-href="/orchestrateur#prospects" role="link" tabindex="0"><span class="priority-ico">★</span><div><b>Prospects chauds</b><span>Prêts à recevoir ou finaliser la proposition</span></div><strong>${hot}</strong></div>`,
      `<div class="priority-item priority-contract clickable-card" data-href="/orchestrateur#prospects" role="link" tabindex="0"><span class="priority-ico">✍</span><div><b>Contrats à finaliser</b><span>Propositions envoyées en attente</span></div><strong>${contract}</strong></div>`,
      `<div class="priority-item priority-relance clickable-card" data-href="/orchestrateur#prospects" role="link" tabindex="0"><span class="priority-ico">↻</span><div><b>Relances prévues</b><span>À traiter par l’orchestrateur</span></div><strong>${relance}</strong></div>`
    ].join('');
  }

  const tb=document.getElementById('prospectRows');
  if(tb)tb.innerHTML=state.prospects.slice(0,5).map(x=>`<tr class="clickable-row" data-href="/orchestrateur#prospects" role="link" tabindex="0"><td><b>${esc(x.company)}</b><br><small>${esc(x.city)}</small><br>${contactInfo(x)}</td><td>${pill(x.status)}</td><td><b>${Number(x.score||0)}%</b></td><td><a class="mini" href="/orchestrateur#prospects">Ouvrir</a></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Aucun prospect enregistré</td></tr>';

  const clients=document.getElementById('clientRows');
  if(clients)clients.innerHTML=state.clients.slice(0,10).map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.city||'')}</td><td>${pill(c.status==='active'?'Actif':c.status)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">Aucun client réel enregistré</td></tr>';

  const db=document.getElementById('dossierRows');
  if(db)db.innerHTML=state.dossiers.slice(0,10).map(d=>`<tr class="clickable-row" data-href="/dossier?id=${encodeURIComponent(d.id)}" role="link" tabindex="0"><td><b>${esc(d.reference||d.id)}</b></td><td>${esc(d.client)}</td><td>${pill(d.status)}</td><td>${euro(d.amount)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Aucun dossier réel enregistré</td></tr>';

  setText('billingMonth',euro(caFactu));

  setText('reportFound',t.searched);
  setText('reportProposals',t.proposals);
  setText('reportSigned',t.signed);
  setText('reportClients',t.signed);
}

const laneOrder=['Nouveau','Contacté','À relancer','Intéressé','Proposition envoyée','Client'];
function renderOrchestrator(){
  const wrap=document.getElementById('pipeline');
  if(wrap){
    wrap.innerHTML=laneOrder.map(status=>{
      const list=status==='Client'
        ? state.clients.slice(0,4).map(c=>({id:c.id,company:c.name,city:c.city,score:100,notes:'Contrat signé • Client actif',status:'Client'}))
        : state.prospects.filter(p=>p.status===status);
      return `<section class="lane"><h4>${status}<span>${list.length}</span></h4>${list.map(p=>`<article class="lead"><b>${esc(p.company)}</b><small>${esc(p.city)} • Score ${Number(p.score||0)}%</small>${contactInfo(p)}<small>${esc(p.notes)}</small><div class="lead-actions">${leadButtons(p)}</div></article>`).join('')||'<div class="empty">Aucun</div>'}</section>`;
    }).join('');
  }
  setText('orc-found',state.orchestrator.found);
  setText('orc-contacted',state.orchestrator.contacted);
  setText('orc-hot',state.orchestrator.hot);
  setText('orc-signed',Number(state.dashboard?.activeClients||0));

  const t=state.orchestrator.today;
  setText('funnelSearched',t.searched);
  setText('funnelQualified',t.qualified);
  setText('funnelContacted',t.contacted);
  setText('funnelReplies',t.replies);
  setText('funnelProposals',t.proposals);
  setText('funnelSigned',t.signed);

  const daily=document.getElementById('dailyReportToggle');
  const signed=document.getElementById('signedAlertToggle');
  const owner=document.getElementById('ownerAlertToggle');
  if(daily)daily.checked=state.reporting.daily;
  if(signed)signed.checked=state.reporting.signedAlert;
  if(owner)owner.checked=state.reporting.ownerAlert;
}

function leadButtons(p){
  if(p.status==='Client')return '<span class="pill p-client">Actif</span>';
  if(p.status==='Nouveau')return p.email
    ? `<button class="mini primary" onclick="contactProspect('${p.id}')">Contacter</button>`
    : `<button class="mini gold" onclick="enrichProspect('${p.id}',this)">Trouver l’email</button>`;
  if(p.status==='Contacté')return `<button class="mini gold" onclick="advanceProspect('${p.id}','Intéressé')">Réponse +</button><button class="mini" onclick="advanceProspect('${p.id}','À relancer')">Relancer</button>`;
  if(p.status==='À relancer')return `<button class="mini primary" onclick="advanceProspect('${p.id}','Intéressé')">Intéressé</button>`;
  if(p.status==='Intéressé')return `<button class="mini primary" onclick="sendProposal('${p.id}')">Envoyer proposition</button>`;
  if(p.status==='Proposition envoyée')return `<button class="mini gold" onclick="validateProposal('${p.id}')">Simuler signature</button>`;
  return '';
}


window.enrichProspect=async(id,button)=>{
  const p=state.prospects.find(x=>x.id===id);if(!p)return;
  const original=button&&button.textContent;
  if(button){button.disabled=true;button.textContent='Recherche…';}
  toast('Recherche de l’adresse email professionnelle…');
  try{
    const r=await fetch('/api/prospects-discover',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({action:'enrich_one',prospectId:id})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'ENRICH_FAILED');
    await refreshRealProspects();
    if(data.found) toast('Email professionnel trouvé et enregistré');
    else toast('Aucun email public fiable trouvé pour ce prospect');
  }catch(e){
    toast('Recherche email impossible : '+e.message);
  }finally{
    if(button){button.disabled=false;button.textContent=original||'Trouver l’email';}
  }
};

window.contactProspect=async(id)=>{
  const p=state.prospects.find(x=>x.id===id);if(!p)return;
  if(!p.email){toast('Adresse professionnelle à enrichir avant envoi');return}
  try{
    const r=await fetch('/api/prospect-contact',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({prospectId:id})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'CONTACT_FAILED');
    p.status='Contacté';
    p.notes='Email M FactU envoyé • désinscription disponible';
    state.orchestrator.contacted++;
    state.orchestrator.today.contacted++;
    save();renderOrchestrator();renderAdmin();toast('Email envoyé au prospect');
  }catch(e){
    toast(e.message==='EMAIL_MISSING'?'Adresse email manquante':'Envoi impossible : '+e.message);
  }
};

window.advanceProspect=async(id,status)=>{
  const apiStatus=status==='Intéressé'?'interested':status==='À relancer'?'followup':null;
  if(!apiStatus)return;
  try{
    const r=await fetch('/api/prospects-discover',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action:'set_status',prospectId:id,status:apiStatus})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'UPDATE_FAILED');
    await refreshRealProspects();
    toast('Prospect mis à jour dans la base');
  }catch(e){toast('Mise à jour impossible : '+e.message)}
};

window.sendProposal=()=>{
  toast('Aucune proposition envoyée : la signature électronique doit encore être connectée.');
};

window.validateProposal=()=>{
  toast('Aucune signature simulée : la signature électronique réelle doit encore être connectée.');
};

function renderClient(){
  const tb=document.getElementById('clientDossiers');
  if(tb)tb.innerHTML=state.dossiers.map(d=>`<tr><td><b>${d.id}</b><br><small>${d.client}</small></td><td>${d.patient}</td><td>${d.date}</td><td>${euro(d.amount)}</td><td>${pill(d.status)}</td><td><a class="mini" href="/dossier?id=${encodeURIComponent(d.id)}">Voir</a></td></tr>`).join('');
  setText('cTodo',state.dossiers.filter(d=>d.status==='À traiter').length);
  setText('cTrans',state.dossiers.filter(d=>/Télétransmis/.test(d.status)).length);
  setText('cReject',state.dossiers.filter(d=>/Rejet/.test(d.status)).length);
  setText('cPaid',state.dossiers.filter(d=>d.status==='Payé').length);
}

function renderDossier(){
  const id=new URLSearchParams(location.search).get('id')||state.dossiers[0]?.id;
  const d=state.dossiers.find(x=>x.id===id)||state.dossiers[0];
  if(!d){
    document.querySelectorAll('[data-dossier-id],[data-client],[data-date],[data-amount],[data-patient]').forEach(e=>e.textContent='—');
    const emptyStatus=document.getElementById('dossierStatus');if(emptyStatus)emptyStatus.textContent='Aucun dossier';
    return;
  }
  document.querySelectorAll('[data-dossier-id]').forEach(e=>e.textContent=d.id);
  document.querySelectorAll('[data-client]').forEach(e=>e.textContent=d.client);
  document.querySelectorAll('[data-patient]').forEach(e=>e.textContent=d.patient);
  document.querySelectorAll('[data-date]').forEach(e=>e.textContent=d.date);
  document.querySelectorAll('[data-amount]').forEach(e=>e.textContent=euro(d.amount));
  const st=document.getElementById('dossierStatus');if(st)st.innerHTML=pill(d.status);
}

function renderProposal(){
  const id=new URLSearchParams(location.search).get('prospect');
  const p=state.prospects.find(x=>x.id===id)||state.prospects.find(x=>x.status==='Proposition envoyée')||state.prospects[0];if(!p)return;
  document.querySelectorAll('[data-prospect-company]').forEach(e=>e.textContent=p.company);
  document.querySelectorAll('[data-prospect-city]').forEach(e=>e.textContent=p.city);
  const input=document.getElementById('proposalProspectId');if(input)input.value=p.id;
}

function bindForms(){
  const lead=document.getElementById('leadForm');
  if(lead)lead.onsubmit=async e=>{
    e.preventDefault();const f=new FormData(lead);
    try{
      const r=await fetch('/api/prospects-discover',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'add_manual',company:f.get('company'),city:f.get('city'),email:f.get('email')})
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.error||'ADD_FAILED');
      lead.reset();closeModal('leadModal');await refreshRealProspects();toast('Prospect enregistré dans la base');
    }catch(err){toast('Ajout impossible : '+err.message)}
  };

  const dossier=document.getElementById('dossierForm');
  if(dossier)dossier.onsubmit=e=>{
    e.preventDefault();
    toast('Aucun faux dossier créé : le dépôt réel sera activé avec le stockage santé dédié.');
  };

  const sign=document.getElementById('signForm');
  if(sign)sign.onsubmit=e=>{
    e.preventDefault();
    toast('Signature réelle non activée : aucune création de client simulée.');
  };

  const onboarding=document.getElementById('onboardingForm');
  if(onboarding)onboarding.onsubmit=e=>{
    e.preventDefault();
    toast('Onboarding réel à connecter : aucune activation client simulée.');
  };
}

function bindReporting(){
  const map=[['dailyReportToggle','daily'],['signedAlertToggle','signedAlert'],['ownerAlertToggle','ownerAlert']];
  map.forEach(([id,key])=>{const el=document.getElementById(id);if(el)el.onchange=()=>{state.reporting[key]=el.checked;save();toast('Préférence de rapport enregistrée')}});
}

async function simulateCampaign(){
  state.orchestrator.active=true;
  toast('Recherche réelle de taxis en cours…');
  try{
    const r=await fetch('/api/prospects-discover',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({target:50})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'PROSPECT_SEARCH_FAILED');
    await refreshRealProspects();
    const emails=Number(data.enrichment?.emailFound||0);
    toast(`${data.searched||0} taxis recherchés • ${data.created||0} nouveaux • ${emails} email(s) trouvé(s)`);
  }catch(e){
    toast('Recherche impossible : '+e.message);
  }
}
window.simulateCampaign=simulateCampaign;

async function refreshRealProspects(){
  try{
    const r=await fetch('/api/prospects-discover?limit=100',{cache:'no-store'});
    if(!r.ok)return;
    const data=await r.json();
    if(Array.isArray(data.prospects)){
      state.prospects=data.prospects;
      state.clients=Array.isArray(data.clients)?data.clients:[];
      state.dossiers=Array.isArray(data.dossiers)?data.dossiers:[];
      state.dashboard={...cloneBase().dashboard,...(data.summary||{})};
      state.orchestrator.found=Number(data.summary?.prospects||data.prospects.length||0);
      state.orchestrator.contacted=Number(data.summary?.contactedTotal||0);
      state.orchestrator.hot=Number(data.summary?.interestedTotal||0);
      state.orchestrator.today={...cloneBase().orchestrator.today,...(data.activity||{})};
      renderOrchestrator();renderAdmin();renderClient();renderDossier();
    }
  }catch{}
}

function markNextDossier(){
  let d=state.dossiers.find(x=>x.status==='À traiter'||x.status==='À télétransmettre'||/Rejet/i.test(x.status));
  if(!d){toast('Aucun dossier réel en attente');return}
  location.href='/dossier?id='+encodeURIComponent(d.id);
}
window.markNextDossier=markNextDossier;

function previewDailyReport(){
  const t=state.orchestrator.today;
  const body=document.getElementById('reportModalBody');if(!body)return;
  body.innerHTML=`<div class="report-email-preview"><div class="report-email-head"><b>M FactU — Rapport commercial quotidien</b><br><small>Résumé automatique de l’orchestrateur</small></div><div class="report-email-body"><p>Voici l’activité commerciale du jour :</p><div class="report-email-grid"><div><span>Recherchés</span><b>${t.searched}</b></div><div><span>Qualifiés</span><b>${t.qualified}</b></div><div><span>Contactés</span><b>${t.contacted}</b></div><div><span>Réponses</span><b>${t.replies}</b></div><div><span>Propositions</span><b>${t.proposals}</b></div><div><span>Contrats signés</span><b>${t.signed}</b></div></div><p><b>${Number(state.dashboard?.activeClients||0)}</b> clients actifs sur un objectif de <b>${state.orchestrator.target}</b>.</p><p style="color:#76869a;font-size:12px">Une alerte séparée pourra être envoyée immédiatement lorsqu’un contrat est signé ou lorsqu’un prospect nécessite votre intervention.</p></div></div>`;
  openModal('reportModal');
}
window.previewDailyReport=previewDailyReport;

async function refreshIntegrationStatus(){
  try{
    const r=await fetch('/api/health',{cache:'no-store'});if(!r.ok)return;
    const data=await r.json();
    const badge=document.getElementById('emailAutomationBadge');
    const report=document.getElementById('reportStatus');
    const ready=Boolean(data.emailConfigured);
    [badge,report].forEach(el=>{if(el){el.textContent=ready?'Connecté':'À connecter';el.classList.toggle('ready',ready)}});
  }catch{}
}

if('serviceWorker' in navigator){
  let reloadedForSw=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloadedForSw||sessionStorage.getItem('mfactu-sw-v5'))return;
    reloadedForSw=true;
    sessionStorage.setItem('mfactu-sw-v5','1');
    location.reload();
  });
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('/sw.js?v=20260927-5',{scope:'/'});
      await reg.update();
    }catch{}
  });
}

// Dashboard card navigation initialized on load.
document.addEventListener('DOMContentLoaded',()=>{
  navMobile();renderAdmin();renderOrchestrator();renderClient();renderDossier();renderProposal();bindForms();bindReporting();bindCardNavigation();refreshIntegrationStatus();refreshRealProspects();
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
});
