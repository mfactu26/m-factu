const KEY='mfactu-v1-state';
const baseState={
  clients:[
    {id:'CL-001',name:'Taxi du Luberon',city:'Cavaillon',status:'Actif',ca:9800,joined:'2026-09-05'},
    {id:'CL-002',name:'Avenir Taxi',city:'Avignon',status:'Actif',ca:12700,joined:'2026-09-10'},
    {id:'CL-003',name:'Taxi Provence',city:'Salon-de-Provence',status:'Actif',ca:8600,joined:'2026-09-18'}
  ],
  prospects:[
    {id:'P-101',company:'Taxi Santé Orange',city:'Orange',email:'contact@taxisanteorange.fr',status:'Nouveau',score:92,notes:'Taxi conventionné potentiel'},
    {id:'P-102',company:'Taxi Rhône Médical',city:'Avignon',email:'contact@rhonemedical.fr',status:'Contacté',score:88,notes:'Réponse attendue'},
    {id:'P-103',company:'Taxi du Ventoux',city:'Carpentras',email:'contact@taxiduventoux.fr',status:'Intéressé',score:95,notes:'Demande le tarif'},
    {id:'P-104',company:'Taxi Soleil',city:'Bollène',email:'contact@taxisoleil.fr',status:'Proposition envoyée',score:90,notes:'Proposition 3,5 % envoyée'},
    {id:'P-105',company:'Taxi Alpilles',city:'Saint-Rémy-de-Provence',email:'contact@taxialpilles.fr',status:'À relancer',score:84,notes:'Relance J+5'}
  ],
  dossiers:[
    {id:'MF-2026-0142',client:'Taxi du Luberon',patient:'J. D.',date:'2026-09-24',amount:86.4,status:'À traiter'},
    {id:'MF-2026-0141',client:'Avenir Taxi',patient:'M. R.',date:'2026-09-24',amount:124.8,status:'À télétransmettre'},
    {id:'MF-2026-0140',client:'Taxi Provence',patient:'L. A.',date:'2026-09-23',amount:72.2,status:'Télétransmis via Lomaco'},
    {id:'MF-2026-0139',client:'Taxi du Luberon',patient:'C. B.',date:'2026-09-23',amount:94.5,status:'Rejet à corriger'},
    {id:'MF-2026-0138',client:'Avenir Taxi',patient:'P. N.',date:'2026-09-22',amount:63.1,status:'Payé'}
  ],
  events:[
    {time:'Aujourd’hui 09:42',text:'Nouveau dossier reçu de Taxi du Luberon'},
    {time:'Aujourd’hui 09:15',text:'Proposition envoyée à Taxi Soleil'},
    {time:'Hier 17:28',text:'Retour NOEMIE accepté pour MF-2026-0138'}
  ],
  orchestrator:{active:true,target:50,found:312,contacted:150,replies:28,hot:12,proposals:8,signed:3}
};
function load(){try{return {...baseState,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return structuredClone(baseState)}}
let state=load();
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function euro(n){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n)}
function toast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
function pill(s){let c='p-new';if(/Contact/.test(s))c='p-contact';if(/relancer|attente|traiter/i.test(s))c='p-wait';if(/Intéressé/.test(s))c='p-hot';if(/Proposition/.test(s))c='p-proposal';if(/Client|Actif|Payé/.test(s))c='p-client';if(/Rejet/.test(s))c='p-reject';if(/Télétransmis|transmettre/.test(s))c='p-transmit';return `<span class="pill ${c}">${s}</span>`}
function navMobile(){const b=document.querySelector('.mobile-nav');if(!b)return;b.onclick=()=>{const n=document.querySelector('.nav');n.style.display=n.style.display==='flex'?'none':'flex';n.style.position='absolute';n.style.top='72px';n.style.left='0';n.style.right='0';n.style.background='#fff';n.style.padding='12px 20px';n.style.flexDirection='column';n.style.alignItems='stretch'}}
function openModal(id){document.getElementById(id)?.classList.add('open')}function closeModal(id){document.getElementById(id)?.classList.remove('open')}
window.openModal=openModal;window.closeModal=closeModal;
function renderAdmin(){
 const signed=state.clients.length, target=state.orchestrator.target;
 const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
 set('kClients',signed);set('kDossiers',state.dossiers.length);set('kCa',euro(state.clients.reduce((a,c)=>a+c.ca,0)));set('kFactu',euro(state.clients.reduce((a,c)=>a+c.ca,0)*.035));set('kTodo',state.dossiers.filter(d=>/traiter|transmettre|Rejet/i.test(d.status)).length);set('kPaid',euro(state.dossiers.filter(d=>d.status==='Payé').reduce((a,d)=>a+d.amount,0)));
 set('oFound',state.orchestrator.found);set('oContacted',state.orchestrator.contacted);set('oReplies',state.orchestrator.replies);set('oHot',state.orchestrator.hot);set('oProposals',state.orchestrator.proposals);set('oSigned',signed);set('targetLabel',`${signed} / ${target}`);let p=document.getElementById('targetProgress');if(p)p.style.width=`${Math.min(100,signed/target*100)}%`;
 const tb=document.getElementById('prospectRows');if(tb)tb.innerHTML=state.prospects.slice(0,5).map(x=>`<tr><td><b>${x.company}</b><br><small>${x.city}</small></td><td>${pill(x.status)}</td><td>${x.score}%</td><td><button class="mini" onclick="location.href='/orchestrateur'">Ouvrir</button></td></tr>`).join('');
 const db=document.getElementById('dossierRows');if(db)db.innerHTML=state.dossiers.slice(0,5).map(d=>`<tr><td><b>${d.id}</b><br><small>${d.client}</small></td><td>${d.patient}</td><td>${pill(d.status)}</td><td>${euro(d.amount)}</td></tr>`).join('');
}
const laneOrder=['Nouveau','Contacté','À relancer','Intéressé','Proposition envoyée','Client'];
function renderOrchestrator(){
 const wrap=document.getElementById('pipeline');if(!wrap)return;
 wrap.innerHTML=laneOrder.map(status=>{let list= status==='Client'?[]:state.prospects.filter(p=>p.status===status);return `<section class="lane"><h4>${status}<span>${list.length}</span></h4>${list.map(p=>`<article class="lead"><b>${p.company}</b><small>${p.city} • Score ${p.score}%</small><small>${p.notes}</small><div class="lead-actions">${leadButtons(p)}</div></article>`).join('')||'<div class="empty">Aucun</div>'}</section>`}).join('');
 ['found','contacted','replies','hot','proposals'].forEach(k=>{const e=document.getElementById('orc-'+k);if(e)e.textContent=state.orchestrator[k]});
 const s=document.getElementById('orc-signed');if(s)s.textContent=state.clients.length;
}
function leadButtons(p){
 if(p.status==='Nouveau')return `<button class="mini primary" onclick="advanceProspect('${p.id}','Contacté')">Contacter</button>`;
 if(p.status==='Contacté')return `<button class="mini gold" onclick="advanceProspect('${p.id}','Intéressé')">Réponse +</button><button class="mini" onclick="advanceProspect('${p.id}','À relancer')">Relancer</button>`;
 if(p.status==='À relancer')return `<button class="mini primary" onclick="advanceProspect('${p.id}','Intéressé')">Intéressé</button>`;
 if(p.status==='Intéressé')return `<button class="mini primary" onclick="sendProposal('${p.id}')">Envoyer proposition</button>`;
 if(p.status==='Proposition envoyée')return `<button class="mini gold" onclick="validateProposal('${p.id}')">Simuler validation</button>`;
 return '';
}
window.advanceProspect=(id,status)=>{let p=state.prospects.find(x=>x.id===id);if(!p)return;p.status=status;p.notes=status==='Intéressé'?'Prospect chaud : proposition à envoyer':status==='À relancer'?'Relance automatique programmée':'Mis à jour';save();renderOrchestrator();toast('Prospect mis à jour')};
window.sendProposal=(id)=>{let p=state.prospects.find(x=>x.id===id);if(!p)return;p.status='Proposition envoyée';p.notes='Proposition 3,5 % envoyée • en attente de validation';state.orchestrator.proposals++;save();renderOrchestrator();toast('Proposition 3,5 % envoyée')};
window.validateProposal=(id)=>{let p=state.prospects.find(x=>x.id===id);if(!p)return;state.prospects=state.prospects.filter(x=>x.id!==id);state.clients.unshift({id:'CL-'+String(Date.now()).slice(-5),name:p.company,city:p.city,status:'Actif',ca:0,joined:new Date().toISOString().slice(0,10)});state.orchestrator.signed=state.clients.length;save();renderOrchestrator();toast(`${p.company} devient client actif`)};
function renderClient(){const tb=document.getElementById('clientDossiers');if(tb)tb.innerHTML=state.dossiers.map(d=>`<tr><td><b>${d.id}</b><br><small>${d.client}</small></td><td>${d.patient}</td><td>${d.date}</td><td>${euro(d.amount)}</td><td>${pill(d.status)}</td><td><a class="mini" href="/dossier?id=${encodeURIComponent(d.id)}">Voir</a></td></tr>`).join('');let set=(id,v)=>{let e=document.getElementById(id);if(e)e.textContent=v};set('cTodo',state.dossiers.filter(d=>d.status==='À traiter').length);set('cTrans',state.dossiers.filter(d=>/Télétransmis/.test(d.status)).length);set('cReject',state.dossiers.filter(d=>/Rejet/.test(d.status)).length);set('cPaid',state.dossiers.filter(d=>d.status==='Payé').length)}
function renderDossier(){const id=new URLSearchParams(location.search).get('id')||state.dossiers[0]?.id;const d=state.dossiers.find(x=>x.id===id)||state.dossiers[0];if(!d)return;document.querySelectorAll('[data-dossier-id]').forEach(e=>e.textContent=d.id);document.querySelectorAll('[data-client]').forEach(e=>e.textContent=d.client);document.querySelectorAll('[data-patient]').forEach(e=>e.textContent=d.patient);document.querySelectorAll('[data-date]').forEach(e=>e.textContent=d.date);document.querySelectorAll('[data-amount]').forEach(e=>e.textContent=euro(d.amount));const st=document.getElementById('dossierStatus');if(st)st.innerHTML=pill(d.status)}
function renderProposal(){const id=new URLSearchParams(location.search).get('prospect');const p=state.prospects.find(x=>x.id===id)||state.prospects.find(x=>x.status==='Proposition envoyée')||state.prospects[0];if(!p)return;document.querySelectorAll('[data-prospect-company]').forEach(e=>e.textContent=p.company);document.querySelectorAll('[data-prospect-city]').forEach(e=>e.textContent=p.city);const input=document.getElementById('proposalProspectId');if(input)input.value=p.id}
function bindForms(){
 const lead=document.getElementById('leadForm');if(lead)lead.onsubmit=e=>{e.preventDefault();const f=new FormData(lead);state.prospects.unshift({id:'P-'+Date.now(),company:f.get('company'),city:f.get('city'),email:f.get('email'),status:'Nouveau',score:85,notes:'Ajout manuel'});save();lead.reset();closeModal('leadModal');renderOrchestrator();toast('Prospect ajouté')};
 const dossier=document.getElementById('dossierForm');if(dossier)dossier.onsubmit=e=>{e.preventDefault();const f=new FormData(dossier);state.dossiers.unshift({id:'MF-2026-'+String(Date.now()).slice(-4),client:f.get('client'),patient:f.get('patient'),date:f.get('date'),amount:Number(f.get('amount')),status:'À traiter'});save();dossier.reset();closeModal('dossierModal');renderClient();toast('Dossier reçu par M FactU')};
 const sign=document.getElementById('signForm');if(sign)sign.onsubmit=e=>{e.preventDefault();const f=new FormData(sign);if(!f.get('accept')){toast('Cochez l’acceptation de la proposition');return}const id=f.get('prospect');let p=state.prospects.find(x=>x.id===id);if(p){state.prospects=state.prospects.filter(x=>x.id!==id);state.clients.unshift({id:'CL-'+String(Date.now()).slice(-5),name:p.company,city:p.city,status:'Actif',ca:0,joined:new Date().toISOString().slice(0,10)});save()}document.getElementById('proposalBody').innerHTML=`<div class="success"><h2>Proposition validée ✅</h2><p>Bienvenue chez M FactU. Votre espace client est prêt. La prochaine étape est de compléter l’onboarding puis de déposer vos premiers dossiers.</p><div class="actions"><a class="btn btn-blue" href="/onboarding">Commencer l’onboarding</a><a class="btn btn-secondary" href="/espace-client">Ouvrir l’espace client</a></div></div>`;toast('Client créé automatiquement')};
 const onboarding=document.getElementById('onboardingForm');if(onboarding)onboarding.onsubmit=e=>{e.preventDefault();document.getElementById('onboardingWrap').innerHTML=`<div class="success"><h2>Onboarding terminé ✅</h2><p>Le client peut désormais déposer ses dossiers. Les nouveaux dossiers apparaîtront directement dans votre file « À traiter ».</p><a href="/espace-client" class="btn btn-blue">Accéder à l’espace client</a></div>`;toast('Client opérationnel')};
}
function simulateCampaign(){state.orchestrator.active=true;state.orchestrator.found+=25;state.orchestrator.contacted+=12;const names=['Taxi Médical Provence','Taxi Rhône Assistance','Taxi Santé Vaucluse'];names.forEach((name,i)=>state.prospects.unshift({id:'P-'+Date.now()+'-'+i,company:name,city:['Orange','Avignon','Carpentras'][i],email:'contact@'+name.toLowerCase().replace(/[^a-z]/g,'')+'.fr',status:'Nouveau',score:82+i*4,notes:'Trouvé par l’orchestrateur'}));save();renderOrchestrator();toast('Campagne simulée : nouveaux prospects qualifiés ajoutés')}
window.simulateCampaign=simulateCampaign;
function markNextDossier(){let d=state.dossiers.find(x=>x.status==='À traiter');if(!d)d=state.dossiers.find(x=>x.status==='À télétransmettre');if(!d){toast('Aucun dossier en attente');return}d.status=d.status==='À traiter'?'À télétransmettre':'Télétransmis via Lomaco';save();renderAdmin();renderClient();toast('Dossier avancé dans le flux Lomaco')}
window.markNextDossier=markNextDossier;
document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('img[src="assets/logo-source.jpg"]').forEach(img=>{img.src='assets/logo.svg';img.alt='M FactU'});navMobile();renderAdmin();renderOrchestrator();renderClient();renderDossier();renderProposal();bindForms();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close))});