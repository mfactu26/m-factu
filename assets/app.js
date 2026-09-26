const KEY='mfactu-v2-state';

const baseState={
  clients:[
    {id:'CL-001',name:'Taxi du Luberon',city:'Cavaillon',status:'Actif',ca:9800,joined:'2026-09-05'},
    {id:'CL-002',name:'Avenir Taxi',city:'Avignon',status:'Actif',ca:12700,joined:'2026-09-10'},
    {id:'CL-003',name:'Taxi Provence',city:'Salon-de-Provence',status:'Actif',ca:8600,joined:'2026-09-18'}
  ],
  prospects:[
    {id:'P-101',company:'Taxi Santé Orange',city:'Orange',email:'contact@taxisanteorange.fr',status:'Nouveau',score:92,notes:'Taxi conventionné potentiel'},
    {id:'P-102',company:'Taxi Rhône Médical',city:'Avignon',email:'contact@rhonemedical.fr',status:'Contacté',score:88,notes:'Réponse attendue'},
    {id:'P-103',company:'Taxi du Ventoux',city:'Carpentras',email:'contact@taxiduventoux.fr',status:'Intéressé',score:95,notes:'Demande la proposition'},
    {id:'P-104',company:'Taxi Soleil',city:'Bollène',email:'contact@taxisoleil.fr',status:'Proposition envoyée',score:90,notes:'Proposition 3,5 % envoyée'},
    {id:'P-105',company:'Taxi Alpilles',city:'Saint-Rémy-de-Provence',email:'contact@taxialpilles.fr',status:'À relancer',score:84,notes:'Relance prévue aujourd’hui'}
  ],
  dossiers:[
    {id:'MF-2026-0142',client:'Taxi du Luberon',patient:'J. D.',date:'2026-09-24',amount:86.4,status:'À traiter'},
    {id:'MF-2026-0141',client:'Avenir Taxi',patient:'M. R.',date:'2026-09-24',amount:124.8,status:'À télétransmettre'},
    {id:'MF-2026-0140',client:'Taxi Provence',patient:'L. A.',date:'2026-09-23',amount:72.2,status:'Télétransmis via Lomaco'},
    {id:'MF-2026-0139',client:'Taxi du Luberon',patient:'C. B.',date:'2026-09-23',amount:94.5,status:'Rejet à corriger'},
    {id:'MF-2026-0138',client:'Avenir Taxi',patient:'P. N.',date:'2026-09-22',amount:63.1,status:'Payé'}
  ],
  orchestrator:{
    active:true,target:50,found:312,contacted:150,replies:28,hot:12,proposals:8,
    today:{searched:42,qualified:31,contacted:24,replies:7,hot:3,proposals:2,signed:1}
  },
  reporting:{daily:false,signedAlert:false,ownerAlert:false}
};

function cloneBase(){return JSON.parse(JSON.stringify(baseState))}
function load(){
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
    return {
      ...cloneBase(),...saved,
      orchestrator:{...cloneBase().orchestrator,...(saved.orchestrator||{}),today:{...cloneBase().orchestrator.today,...(saved.orchestrator?.today||{})}},
      reporting:{...cloneBase().reporting,...(saved.reporting||{})}
    };
  }catch{return cloneBase()}
}
let state=load();
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function euro(n){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n)||0)}
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
  const signed=state.clients.length,target=state.orchestrator.target;
  const caClients=state.clients.reduce((a,c)=>a+(Number(c.ca)||0),0);
  const todo=state.dossiers.filter(d=>/traiter|transmettre|Rejet/i.test(d.status)).length;
  const remaining=Math.max(0,target-signed);
  const pct=Math.min(100,Math.round(signed/target*100));

  setText('kClients',signed);
  setText('kFactu',euro(caClients*.035));
  setText('kContracts',contractsPending());
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
      `<div class="priority-item priority-hot"><span class="priority-ico">★</span><div><b>Prospects chauds</b><span>Prêts à recevoir ou finaliser la proposition</span></div><strong>${hot}</strong></div>`,
      `<div class="priority-item priority-contract"><span class="priority-ico">✍</span><div><b>Contrats à finaliser</b><span>Propositions envoyées en attente</span></div><strong>${contract}</strong></div>`,
      `<div class="priority-item priority-relance"><span class="priority-ico">↻</span><div><b>Relances prévues</b><span>À traiter par l’orchestrateur</span></div><strong>${relance}</strong></div>`
    ].join('');
  }

  const tb=document.getElementById('prospectRows');
  if(tb)tb.innerHTML=hotProspects().slice(0,5).map(x=>`<tr><td><b>${x.company}</b><br><small>${x.city}</small></td><td>${pill(x.status)}</td><td><b>${x.score}%</b></td><td><a class="mini" href="/orchestrateur#prospects">Ouvrir</a></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Aucun prospect prioritaire</td></tr>';

  const db=document.getElementById('dossierRows');
  if(db)db.innerHTML=state.dossiers.slice(0,5).map(d=>`<tr><td><b>${d.id}</b></td><td>${d.client}</td><td>${pill(d.status)}</td><td>${euro(d.amount)}</td></tr>`).join('');

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
      return `<section class="lane"><h4>${status}<span>${list.length}</span></h4>${list.map(p=>`<article class="lead"><b>${p.company}</b><small>${p.city} • Score ${p.score}%</small><small>${p.notes}</small><div class="lead-actions">${leadButtons(p)}</div></article>`).join('')||'<div class="empty">Aucun</div>'}</section>`;
    }).join('');
  }
  setText('orc-found',state.orchestrator.found);
  setText('orc-contacted',state.orchestrator.contacted);
  setText('orc-hot',state.orchestrator.hot);
  setText('orc-signed',state.clients.length);

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
  if(p.status==='Nouveau')return `<button class="mini primary" onclick="advanceProspect('${p.id}','Contacté')">Contacter</button>`;
  if(p.status==='Contacté')return `<button class="mini gold" onclick="advanceProspect('${p.id}','Intéressé')">Réponse +</button><button class="mini" onclick="advanceProspect('${p.id}','À relancer')">Relancer</button>`;
  if(p.status==='À relancer')return `<button class="mini primary" onclick="advanceProspect('${p.id}','Intéressé')">Intéressé</button>`;
  if(p.status==='Intéressé')return `<button class="mini primary" onclick="sendProposal('${p.id}')">Envoyer proposition</button>`;
  if(p.status==='Proposition envoyée')return `<button class="mini gold" onclick="validateProposal('${p.id}')">Simuler signature</button>`;
  return '';
}

window.advanceProspect=(id,status)=>{
  const p=state.prospects.find(x=>x.id===id);if(!p)return;
  p.status=status;
  p.notes=status==='Intéressé'?'Prospect chaud : proposition à envoyer':status==='À relancer'?'Relance automatique programmée':'Mis à jour par l’orchestrateur';
  if(status==='Intéressé')state.orchestrator.today.hot++;
  save();renderOrchestrator();renderAdmin();toast('Prospect mis à jour');
};

window.sendProposal=(id)=>{
  const p=state.prospects.find(x=>x.id===id);if(!p)return;
  p.status='Proposition envoyée';p.notes='Proposition 3,5 % envoyée • contrat en attente';
  state.orchestrator.proposals++;state.orchestrator.today.proposals++;
  save();renderOrchestrator();renderAdmin();toast('Proposition 3,5 % envoyée');
};

window.validateProposal=(id)=>{
  const p=state.prospects.find(x=>x.id===id);if(!p)return;
  state.prospects=state.prospects.filter(x=>x.id!==id);
  state.clients.unshift({id:'CL-'+String(Date.now()).slice(-5),name:p.company,city:p.city,status:'Actif',ca:0,joined:new Date().toISOString().slice(0,10)});
  state.orchestrator.today.signed++;
  save();renderOrchestrator();renderAdmin();toast(`${p.company} : contrat signé, client créé`);
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
  const d=state.dossiers.find(x=>x.id===id)||state.dossiers[0];if(!d)return;
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
  if(lead)lead.onsubmit=e=>{
    e.preventDefault();const f=new FormData(lead);
    state.prospects.unshift({id:'P-'+Date.now(),company:f.get('company'),city:f.get('city'),email:f.get('email'),status:'Nouveau',score:85,notes:'Ajout manuel'});
    state.orchestrator.found++;state.orchestrator.today.searched++;
    save();lead.reset();closeModal('leadModal');renderOrchestrator();renderAdmin();toast('Prospect ajouté');
  };

  const dossier=document.getElementById('dossierForm');
  if(dossier)dossier.onsubmit=e=>{
    e.preventDefault();const f=new FormData(dossier);
    state.dossiers.unshift({id:'MF-2026-'+String(Date.now()).slice(-4),client:f.get('client'),patient:f.get('patient'),date:f.get('date'),amount:Number(f.get('amount')),status:'À traiter'});
    save();dossier.reset();closeModal('dossierModal');renderClient();renderAdmin();toast('Dossier reçu par M FactU');
  };

  const sign=document.getElementById('signForm');
  if(sign)sign.onsubmit=e=>{
    e.preventDefault();const f=new FormData(sign);
    if(!f.get('accept')){toast('Cochez l’acceptation de la proposition');return}
    const id=f.get('prospect');const p=state.prospects.find(x=>x.id===id);
    if(p){state.prospects=state.prospects.filter(x=>x.id!==id);state.clients.unshift({id:'CL-'+String(Date.now()).slice(-5),name:p.company,city:p.city,status:'Actif',ca:0,joined:new Date().toISOString().slice(0,10)});state.orchestrator.today.signed++;save()}
    document.getElementById('proposalBody').innerHTML=`<div class="success"><h2>Proposition validée ✅</h2><p>Le contrat est accepté et le client peut poursuivre son onboarding.</p><div class="actions"><a class="btn btn-blue" href="/onboarding">Commencer l’onboarding</a><a class="btn btn-secondary" href="/espace-client">Ouvrir l’espace client</a></div></div>`;
    toast('Contrat accepté, client créé');
  };

  const onboarding=document.getElementById('onboardingForm');
  if(onboarding)onboarding.onsubmit=e=>{
    e.preventDefault();document.getElementById('onboardingWrap').innerHTML=`<div class="success"><h2>Onboarding terminé ✅</h2><p>Le client peut désormais déposer ses dossiers. Les nouveaux dossiers apparaîtront directement dans votre file « À traiter ».</p><a href="/espace-client" class="btn btn-blue">Accéder à l’espace client</a></div>`;toast('Client opérationnel');
  };
}

function bindReporting(){
  const map=[['dailyReportToggle','daily'],['signedAlertToggle','signedAlert'],['ownerAlertToggle','ownerAlert']];
  map.forEach(([id,key])=>{const el=document.getElementById(id);if(el)el.onchange=()=>{state.reporting[key]=el.checked;save();toast('Préférence de rapport enregistrée')}});
}

function simulateCampaign(){
  state.orchestrator.active=true;
  state.orchestrator.found+=25;state.orchestrator.contacted+=12;
  state.orchestrator.today.searched+=25;state.orchestrator.today.qualified+=18;state.orchestrator.today.contacted+=12;state.orchestrator.today.replies+=3;
  const names=['Taxi Médical Provence','Taxi Rhône Assistance','Taxi Santé Vaucluse'];
  names.forEach((name,i)=>state.prospects.unshift({id:'P-'+Date.now()+'-'+i,company:name,city:['Orange','Avignon','Carpentras'][i],email:'contact@'+name.toLowerCase().replace(/[^a-z]/g,'')+'.fr',status:'Nouveau',score:82+i*4,notes:'Trouvé par l’orchestrateur'}));
  save();renderOrchestrator();renderAdmin();toast('Campagne test : nouveaux prospects qualifiés ajoutés');
}
window.simulateCampaign=simulateCampaign;

function markNextDossier(){
  let d=state.dossiers.find(x=>x.status==='À traiter');if(!d)d=state.dossiers.find(x=>x.status==='À télétransmettre');
  if(!d){toast('Aucun dossier en attente');return}
  d.status=d.status==='À traiter'?'À télétransmettre':'Télétransmis via Lomaco';
  save();renderAdmin();renderClient();toast('Dossier avancé dans le flux Lomaco');
}
window.markNextDossier=markNextDossier;

function previewDailyReport(){
  const t=state.orchestrator.today;
  const body=document.getElementById('reportModalBody');if(!body)return;
  body.innerHTML=`<div class="report-email-preview"><div class="report-email-head"><b>M FactU — Rapport commercial quotidien</b><br><small>Résumé automatique de l’orchestrateur</small></div><div class="report-email-body"><p>Voici l’activité commerciale du jour :</p><div class="report-email-grid"><div><span>Recherchés</span><b>${t.searched}</b></div><div><span>Qualifiés</span><b>${t.qualified}</b></div><div><span>Contactés</span><b>${t.contacted}</b></div><div><span>Réponses</span><b>${t.replies}</b></div><div><span>Propositions</span><b>${t.proposals}</b></div><div><span>Contrats signés</span><b>${t.signed}</b></div></div><p><b>${state.clients.length}</b> clients actifs sur un objectif de <b>${state.orchestrator.target}</b>.</p><p style="color:#76869a;font-size:12px">Une alerte séparée pourra être envoyée immédiatement lorsqu’un contrat est signé ou lorsqu’un prospect nécessite votre intervention.</p></div></div>`;
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

document.addEventListener('DOMContentLoaded',()=>{
  navMobile();renderAdmin();renderOrchestrator();renderClient();renderDossier();renderProposal();bindForms();bindReporting();refreshIntegrationStatus();
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
});
