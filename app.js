(function(){
'use strict';
var E = ENGINE;
/* ============ ÉTAT ============ */
var ST = {
  user:null, module:'home', ltab:'fac', ttab:'new', sub:'imp',
  cfg: clone(E.DEFAULT_CONFIG), monthsIndex:[],
  ag:null, month:null, doc:null, files:[], R:null, ov:null, flags:{}, pdfs:[],
  busy:'', pending:null, modal:null, openAnom:{}, lim:{}, openPdf:null, confirmClose:false,
  parAg:null, newAg:false, transports:null, trF:{ month:'', ag:'' },
  users:null, logs:null, admTab:'users', synAg:'all', logF:{ type:'', q:'' }, pwFor:null
};
var dl = null;
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function esc(s){ return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function eur(x){ return (x||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €'; }
function n2(x){ return (x||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function n3(x){ return isNaN(x) ? '' : x.toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3}); }
function nx(x){ return isNaN(x) ? '' : x.toLocaleString('fr-FR',{maximumFractionDigits:4}); }
function $(id){ return document.getElementById(id); }
function toast(t){ var e=$('toast'); e.textContent=t; e.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(function(){ e.hidden=true; },3200); }
function hhmm(){ var d = new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function dt(iso){ return iso ? new Date(iso).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}) : ''; }
var MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function monthLabel(ym){ var p=ym.split('-'); return MOIS[+p[1]-1]+' '+p[0]; }
var SEV = { bloquant:'Bloquant', verifier:'À vérifier', info:'Info' };
var STATUS = { ouvert:'en cours', clos:'clôturé', vide:'vide' };
var INVST = { verifier:'À vérifier', editer:'À éditer', editee:'Éditée' };
function role(){ return ST.user ? ST.user.role : 'lecture'; }
function isAdmin(){ return role() === 'admin'; }
function monthClosed(){ return ST.doc && ST.doc.status === 'clos'; }
function canEdit(){ return role() !== 'lecture' && !monthClosed(); }
function RO(){ return canEdit() ? '' : ' disabled'; }
function ADM(){ return isAdmin() ? '' : ' disabled'; }
function monthId(){ return ST.ag + '_' + ST.month; }
function blankOv(){ return { assign:{}, exclude:{}, affaire:{}, affMap:{}, status:{} }; }
function deepMerge(base, over){ if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over; var o = clone(base || {}); Object.keys(over).forEach(function(k){ o[k] = (base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) ? deepMerge(base[k], over[k]) : over[k]; }); return o; }
function last18(){ var o = [], d = new Date(); d.setDate(1); for (var i=0;i<18;i++){ o.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); d.setMonth(d.getMonth()-1); } return o; }
function agencies(all){ return Object.keys(ST.cfg.agencies).map(function(k){ return ST.cfg.agencies[k]; }).filter(function(a){ return all || a.active !== false; }).sort(function(a,b){ return String(a.code).localeCompare(String(b.code), 'fr', { numeric:true }); }); }
function agLabel(code){ var a = ST.cfg.agencies[code]; return a ? (a.label || 'AG '+code) : 'AG '+code; }
function kpi(l,v,s){ return '<div class="kpi"><span class="lbl">'+esc(l)+'</span><span class="v">'+esc(v)+'</span><span class="s">'+esc(s||'')+'</span></div>'; }
function uniqA(a){ return a.filter(function(x,i){ return a.indexOf(x)===i; }); }
var GEAR = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M11.3 1.5l.4 2.1c.5.2 1 .5 1.4.8l2-.8 1.3 2.2-1.6 1.4c.1.5.1 1 0 1.6l1.6 1.4-1.3 2.2-2-.8c-.4.3-.9.6-1.4.8l-.4 2.1H8.7l-.4-2.1c-.5-.2-1-.5-1.4-.8l-2 .8-1.3-2.2 1.6-1.4a4.9 4.9 0 010-1.6L3.6 5.8l1.3-2.2 2 .8c.4-.3.9-.6 1.4-.8l.4-2.1h2.6zM10 7a3 3 0 100 6 3 3 0 000-6z"/></svg>';

/* ============ NAVIGATION ============ */
function renderTop(){
  var mod = ST.module, tabs = [];
  if (mod === 'log'){
    tabs = [['par','Paramètres'],['fac','Factures logistiques'],['syn','Synthèse']];
    if (isAdmin()) tabs.push(['adm','Administration']);
  } else if (mod === 'trp') tabs = [['new','Nouveau transport'],['hist','Historique des transports']];
  var cur = mod === 'log' ? ST.ltab : ST.ttab;
  $('tabs').innerHTML = tabs.map(function(t, i){ return '<button class="tab" role="tab" data-'+(mod==='log'?'ltab':'ttab')+'="'+t[0]+'" aria-selected="'+(cur===t[0])+'"><b>'+(i+1)+'</b>'+t[1]+'</button>'; }).join('');
  $('tabs').hidden = !tabs.length;
  $('modname').textContent = mod === 'log' ? 'Logistique' : mod === 'trp' ? 'Transport' : mod === 'acc' ? 'Mon compte' : '';
  if (ST.user) $('who').textContent = ST.user.name + ' · ' + ({admin:'administrateur',adv:'ADV',lecture:'lecture seule'})[ST.user.role];
  $('src').textContent = STORE.mode === 'demo' ? 'mode démo' : '';
}
function render(){
  renderTop();
  var m = $('main'), h;
  if (ST.module === 'home') h = vLanding();
  else if (ST.module === 'acc') h = vAccount();
  else if (ST.module === 'trp') h = ST.ttab === 'hist' ? vTrHistory() : vTransport();
  else if (ST.ltab === 'par') h = vParams();
  else if (ST.ltab === 'syn') h = vSynth();
  else if (ST.ltab === 'adm') h = vAdmin();
  else h = vFactures();
  m.innerHTML = h;
  renderModal();
  if (ST.module === 'log' && ST.ltab === 'fac'){ if (ST.sub === 'imp') bindDrops(); if (ST.sub === 'ctl') bindPdfDrop(); }
  if (ST.module === 'log' && ST.ltab === 'syn') bindChartTips();
  if (ST.module === 'trp' && ST.ttab === 'new') calcTransport();
}

/* ============ ACCUEIL ============ */
function vLanding(){
  var ags = agencies(), open = ST.monthsIndex.filter(function(m){ return m.status === 'ouvert'; }).length;
  var cm = new Date().toISOString().slice(0,7), trn = (ST.transports || []).filter(function(t){ return (t.date||'').slice(0,7) === cm; }).length;
  return '<section class="landing"><p class="lbl">'+esc(ST.user ? 'Bonjour '+ST.user.name : '')+'</p><h2>Que souhaitez-vous facturer ?</h2><div class="choices">'+
    '<button class="choice" data-mod="log"><span class="k">Logistique</span><span class="d">Factures mensuelles des agences OTIS : imports Odoo WMS, anomalies, génération des factures, contrôle avant envoi, clôture du mois.</span><span class="m">'+ags.length+' agence'+(ags.length>1?'s':'')+' paramétrée'+(ags.length>1?'s':'')+' · '+open+' mois en cours</span></button>'+
    '<button class="choice" data-mod="trp"><span class="k">Transport</span><span class="d">Chiffrage d\'une livraison chantier : véhicule recommandé, tarif de la grille, validation et historique des transports.</span><span class="m">'+(ST.transports ? trn+' transport'+(trn>1?'s':'')+' validé'+(trn>1?'s':'')+' ce mois-ci' : 'Grille transport OTIS 2023')+'</span></button>'+
    '</div>'+(isAdmin() ? '<p><button class="btn" data-mod="log" data-ltabgo="adm">Administration des accès</button></p>' : '')+'</section>';
}

/* ============ LOGISTIQUE · PARAMÈTRES ============ */
function cfIn(path, val, type, extra){ return '<input type="'+(type||'text')+'" data-cf="'+esc(path)+'" value="'+esc(val === undefined || val === null ? '' : val)+'"'+(type==='number'?' step="any"':'')+ADM()+(extra||'')+'>'; }
function cfSel(path, val, opts){ return '<select data-cf="'+esc(path)+'"'+ADM()+'>'+opts.map(function(o){ return '<option value="'+esc(o[0])+'"'+(String(val)===String(o[0])?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>'; }
function field(label, input, hint){ return '<div class="fld"><span class="lbl">'+label+'</span>'+input+(hint?'<span class="hint">'+hint+'</span>':'')+'</div>'; }
var DOCK = [['grille','Grille tarifaire','PDF ou Excel signé avec OTIS. Document de référence ; les valeurs appliquées sont saisies ci-dessous.','.pdf,.xls,.xlsx'],['cm','Liste des contremaîtres','Excel ou CSV avec une colonne « Code » et une colonne « Nom ». Sert à contrôler les codes contremaîtres d\'Odoo.','.xls,.xlsx,.csv'],['principes','Principes de facturation','PDF ou Word décrivant les règles propres à l\'agence. Les choix appliqués sont réglés ci-dessous.','.pdf,.doc,.docx']];
function vParams(){
  var ags = agencies(true);
  if (!ST.parAg && ags.length) ST.parAg = ags[0].code;
  var h = '<section class="view">';
  if (!isAdmin()) h += '<p class="note">Consultation : seuls les administrateurs modifient les paramètres.</p>';
  h += '<div class="lay"><aside class="panel mtree"><div class="ph"><h3>Agences</h3></div>'+ags.map(function(a){ return '<button class="mitem" data-par="'+esc(a.code)+'" aria-current="'+(ST.parAg===a.code && !ST.newAg)+'"><span>'+esc(a.label||'AG '+a.code)+'</span><span class="muted num">'+esc(a.code)+(a.active===false?' · archivée':'')+'</span></button>'; }).join('')+
    (isAdmin() ? '<div class="pb"><button class="btn pri" data-newag>+ Créer une agence</button></div>' : '')+'</aside><div class="mpanel">';
  if (ST.newAg) h += newAgForm();
  else if (ST.parAg && ST.cfg.agencies[ST.parAg]) h += agEditor(ST.cfg.agencies[ST.parAg]);
  else h += '<div class="panel empty">Aucune agence. Créer la première agence.</div>';
  h += '</div></div>';
  h += commonParams();
  return h + '</section>';
}
function newAgForm(){
  return '<div class="panel"><div class="ph"><h2>Nouvelle agence</h2></div><form class="pb" id="agform" autocomplete="off"><div class="grid-f">'+
    '<div class="fld"><label class="lbl" for="na_code">Code agence</label><input id="na_code" placeholder="ex. 58, CRA495"><span class="hint">Lettres et chiffres, sans espace. Non modifiable ensuite.</span></div>'+
    '<div class="fld"><label class="lbl" for="na_label">Libellé</label><input id="na_label" placeholder="ex. AG 58 Lille"></div>'+
    '<div class="fld"><label class="lbl" for="na_match">Client dans Odoo (début de la colonne « Client »)</label><input id="na_match" placeholder="ex. OTIS CN AG 58"><span class="hint">Texte qui précède la virgule et le nom du contremaître.</span></div>'+
    '<div class="fld"><label class="lbl" for="na_tpl">Grille de départ</label><select id="na_tpl"><option value="STD">Grille OTIS 2022</option><option value="TOURS">Grille Tours The Link</option></select></div>'+
    '</div><div class="row" style="margin-top:12px"><button class="btn pri" type="button" data-a="agcreate">Créer l\'agence</button><button class="btn" type="button" data-a="agcancel">Annuler</button></div></form></div>';
}
function agEditor(a){
  var p = 'agencies.'+a.code+'.', g = ST.cfg.grids[a.grid] || ST.cfg.grids.STD, gp = 'grids.'+a.grid+'.';
  var h = '<div class="panel"><div class="ph"><h2>'+esc(a.label||'AG '+a.code)+'</h2><span class="muted num">code '+esc(a.code)+'</span></div><div class="pb grid-f">'+
    field('Libellé', cfIn(p+'label', a.label))+
    field('Client dans Odoo', cfIn(p+'match', a.match), 'Début de la colonne « Client » des exports Odoo')+
    field('Adresse de facturation OTIS', '<textarea data-cf="'+p+'address" rows="3"'+ADM()+'>'+esc(a.address||'')+'</textarea>', 'Reprise sur les pro forma PDF')+
    field('Statut', cfSel(p+'active', a.active === false ? 'false' : 'true', [['true','Active'],['false','Archivée (masquée de la facturation)']]))+
    '</div></div>';
  h += '<div class="panel"><div class="ph"><h3>Documents de référence</h3><span class="muted">Conservés en base, téléchargeables par tous les utilisateurs</span></div><div class="docs">';
  DOCK.forEach(function(k){
    var d = (a.docs||{})[k[0]];
    h += '<div class="docslot"><span class="lbl">'+k[1]+'</span>'+(d ? '<strong>'+esc(d.name)+'</strong><span class="muted">'+dt(d.at)+' · '+esc(d.by||'')+'</span>'+(k[0]==='cm' ? '<span class="muted">'+(a.cmList||[]).length+' contremaître(s) lus</span>' : '')+'<div class="row"><button class="btn sm" data-docdl="'+k[0]+'">Télécharger</button>'+(isAdmin()?'<label class="btn sm">Remplacer<input type="file" hidden data-docup="'+k[0]+'" accept="'+k[3]+'"></label><button class="btn sm" data-docrm="'+k[0]+'">Supprimer</button>':'')+'</div>'
      : '<span class="muted">Aucun fichier.</span>'+(isAdmin()?'<label class="btn sm pri">Charger le fichier<input type="file" hidden data-docup="'+k[0]+'" accept="'+k[3]+'"></label>':''))+'<span class="hint">'+k[2]+'</span></div>';
  });
  h += '</div>';
  if ((a.cmList||[]).length) h += '<details class="pb"><summary class="lbl">Contremaîtres de l\'agence ('+a.cmList.length+')</summary><div class="tw"><table><thead><tr><th>Code</th><th>Nom</th></tr></thead><tbody>'+a.cmList.map(function(c){ return '<tr><td class="num">'+esc(c.code)+'</td><td>'+esc(c.nom)+'</td></tr>'; }).join('')+'</tbody></table></div></details>';
  h += '</div>';
  h += '<div class="panel"><div class="ph"><h3>Principes de facturation appliqués</h3></div><div class="pb grid-f">'+
    field('Une facture par', cfSel(p+'split', a.split, [['affaire','Affaire'],['cm','Contremaître'],['appareil','Appareil (n° de commande)'],['ag','Agence (facture unique)']]))+
    field('Process OTIS', cfSel(p+'cas', a.cas, [['2','Cas 2 · sans commande client'],['1','Cas 1 · devis puis commande']]))+
    field('Annexe détaillée sur la facture', cfSel(p+'annexe', a.annexe ? 'true':'false', [['false','Non'],['true','Oui : détail colis en annexe du PDF']]))+
    '</div></div>';
  h += '<div class="panel"><div class="ph"><h3>Grille tarifaire appliquée</h3><span class="muted">'+esc(g.label||'')+'</span><div class="sp">'+(isAdmin()?'<select id="tplsel"><option value="STD">Modèle OTIS 2022</option><option value="TOURS">Modèle Tours The Link</option></select><button class="btn sm" data-a="gridreset">Réinitialiser depuis le modèle</button>':'')+'</div></div><div class="pb tbl-in"><div class="tw"><table><tbody>'+
    gRow(gp+'rate','Entrée / sortie, € par unité payante (> 0,500)',g.rate)+gRow(gp+'minChariot','Minimum chariot / transpalette (≥ 0,250 m³ ou > 20 kg)',g.minChariot)+gRow(gp+'minManuel','Minimum manuel (< 0,250 m³ et ≤ 20 kg)',g.minManuel);
  Object.keys(g.prices).forEach(function(t){ [['mois','mois (22 j et plus)'],['quinz','quinzaine (14 j)'],['sem','semaine (7 j)']].forEach(function(pp){ h += gRow(gp+'prices.'+t+'.'+pp[0], 'Stockage '+t.toLowerCase()+' · '+pp[1]+', €/m²', g.prices[t][pp[0]]); }); });
  if (g.storeMode === 'volume') g.coefs.forEach(function(c, i){ h += gRow(gp+'coefs.'+i+'.coef', 'Coefficient volume → m², '+c.label, c.coef); });
  else h += gRow(gp+'coefSurface','Coefficient sur surface au sol', g.coefSurface);
  h += gRow(gp+'min30','Minimum m² par appareil et par mois (0 = sans)', g.min30);
  return h + '</tbody></table></div></div></div>';
}
function gRow(path, label, v){ return '<tr><td>'+label+'</td><td class="n">'+cfIn(path, v, 'number')+'</td></tr>'; }
function commonParams(){
  var c = ST.cfg, co = c.company || {};
  var miss = ['address','siret','tva'].filter(function(k){ return !co[k]; });
  return '<div class="two"><div class="panel"><div class="ph"><h3>Règles de calcul communes</h3></div><div class="pb grid-f">'+
    field('Unité payante manutention', cfSel('rules.upMode', c.rules.upMode, [['max','max(m³ ; tonnes) : lecture « M3/T »'],['vol','m³ seul (pratique Odoo)']]))+
    field('Minimum 30 m² par appareil', cfSel('rules.min30', c.rules.min30 ? 'true':'false', [['true','Appliqué'],['false','Non appliqué']]))+
    '</div><p class="pb note muted" style="margin:0">Jours de stock comptés bornes incluses · tranche : 22 j et plus = mois, 15 à 21 j = quinzaine + semaine, 8 à 14 j = quinzaine, 1 à 7 j = semaine · arrondi au centime par colis.</p></div>'+
    '<div class="panel"><div class="ph"><h3>Émetteur des pro forma</h3>'+(miss.length?'<span class="pill p-verifier">À compléter</span>':'')+'</div><div class="pb grid-f">'+
    field('Raison sociale', cfIn('company.name', co.name))+field('Adresse', '<textarea data-cf="company.address" rows="3"'+ADM()+'>'+esc(co.address||'')+'</textarea>')+
    field('SIRET', cfIn('company.siret', co.siret))+field('TVA intracommunautaire', cfIn('company.tva', co.tva))+
    field('IBAN', cfIn('company.iban', co.iban))+field('Délai de paiement (jours)', cfIn('company.paymentDays', co.paymentDays, 'number'))+
    field('Mentions de bas de page', '<textarea data-cf="company.mentions" rows="2"'+ADM()+'>'+esc(co.mentions||'')+'</textarea>')+'</div></div></div>';
}
function setPath(obj, path, val){ var k = path.split('.'), o = obj; for (var i=0;i<k.length-1;i++){ if (o[k[i]] === undefined) o[k[i]] = {}; o = o[k[i]]; } o[k[k.length-1]] = val; }
function getPath(obj, path){ return path.split('.').reduce(function(o, k){ return o === undefined || o === null ? undefined : o[k]; }, obj); }
var cfgT = null;
function saveCfg(what){
  clearTimeout(cfgT);
  cfgT = setTimeout(function(){ STORE.saveConfig(ST.cfg, what).then(function(){ toast('Paramètre enregistré : '+what); }, function(e){ toast('Enregistrement impossible : '+e.message); }); }, 300);
  if (ST.R && !monthClosed()){ ST.cfgM = ST.cfg; rebuild(true); }
}
function parseCmList(rows){
  var hdr = (rows[0]||[]).map(function(x){ return String(x||'').toLowerCase(); });
  var ci = hdr.findIndex(function(x){ return /code/.test(x); }), ni = hdr.findIndex(function(x){ return /nom|name|contrema/.test(x) && !/code/.test(x); });
  var start = 1; if (ci < 0 || ni < 0){ ci = 0; ni = 1; start = /\d/.test(String((rows[0]||[])[0])) ? 0 : 1; }
  var out = []; for (var i = start; i < rows.length; i++){ var r = rows[i]||[]; var c = String(r[ci] === null || r[ci] === undefined ? '' : r[ci]).replace(/\.0$/,'').trim(), n = String(r[ni]||'').trim(); if (c || n) out.push({ code:c, nom:n }); }
  return out;
}
function agDocUpload(kind, file){
  var a = ST.cfg.agencies[ST.parAg]; if (!a || !isAdmin()) return;
  var old = (a.docs||{})[kind];
  var pre = kind === 'cm' ? new Promise(function(res){ var fr = new FileReader(); fr.onload = function(){ try { var wb = XLSX.read(new Uint8Array(fr.result), { type:'array' }); res(parseCmList(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:false, defval:null }))); } catch(e){ res(null); } }; fr.readAsArrayBuffer(file); }) : Promise.resolve(null);
  pre.then(function(list){
    if (kind === 'cm' && (!list || !list.length)){ toast('Liste illisible : il faut une colonne Code et une colonne Nom.'); return; }
    return STORE.uploadAgencyDoc(a.code, kind, file).then(function(meta){
      if (old) STORE.deleteFile(old);
      a.docs = a.docs || {}; a.docs[kind] = meta; if (list) a.cmList = list;
      saveCfg(a.label+' : '+DOCK.filter(function(k){ return k[0]===kind; })[0][1]+' chargée'); render();
    });
  }).catch(function(e){ toast('Chargement impossible : '+e.message); });
}

/* ============ LOGISTIQUE · FACTURES ============ */
function vFactures(){
  var ags = agencies();
  if (!ags.length) return '<section class="view"><div class="panel empty">Aucune agence active. Créer une agence dans Paramètres.</div></section>';
  if (!ST.ag || !ags.some(function(a){ return a.code === ST.ag; })){ selectMonth(ags[0].code, ST.month || defaultMonth()); return '<section class="view"><div class="panel empty">Chargement…</div></section>'; }
  var h = '<section class="view"><nav class="subnav" role="tablist">'+ags.map(function(a){ return '<button class="subtab" role="tab" data-agsel="'+esc(a.code)+'" aria-selected="'+(a.code===ST.ag)+'"><span class="st-l">'+esc(a.label||'AG '+a.code)+'</span></button>'; }).join('')+'</nav>';
  var idx = {}; ST.monthsIndex.forEach(function(m){ idx[m.id] = m; });
  h += '<div class="lay"><aside class="panel mtree"><div class="ph"><h3>Mois de facturation</h3></div>'+last18().map(function(m){
      var d = idx[ST.ag+'_'+m], st = d ? (d.status||'ouvert') : 'vide', ht = (ST.month===m && ST.R) ? ST.R.totals.HT : (d && d.summary ? d.summary.HT : null);
      return '<button class="mitem" data-mon="'+m+'" aria-current="'+(ST.month===m)+'"><span>'+monthLabel(m)+'</span><span class="mst"><i class="dot d-'+st+'"></i>'+STATUS[st]+(ht!==null?' · <span class="num">'+n2(ht)+'</span>':'')+'</span></button>';
    }).join('')+'</aside><div class="mpanel">';
  h += monthHead();
  if (ST.busy) h += '<div class="panel empty">'+esc(ST.busy)+'</div>';
  else {
    var blk = ST.R ? ST.R.anomalies.filter(function(a){ return a.sev==='bloquant'; }).reduce(function(s,a){ return s+openCount(a); },0) : 0;
    var pb = ST.pdfs.filter(function(p){ return p.result && p.result.status !== 'conforme'; }).length;
    h += '<nav class="subtabs">'+[['imp','A · Import'],['ano','B · Anomalies'+(blk?' <span class="cnt">'+blk+'</span>':'')],['fac','C · Factures'],['ctl','D · Contrôle factures'+(pb?' <span class="cnt w">'+pb+'</span>':'')]].map(function(t){ return '<button class="stb" data-sub="'+t[0]+'" aria-selected="'+(ST.sub===t[0])+'">'+t[1]+'</button>'; }).join('')+'</nav>';
    h += ST.sub === 'imp' ? vImport() : ST.sub === 'ano' ? vAnomalies() : ST.sub === 'fac' ? vInvoices() : vControl();
  }
  return h + '</div></div></section>';
}
function monthHead(){
  var d = ST.doc || { status:'vide' }, st = d.status || 'vide';
  var h = '<div class="strip"><strong>'+esc(agLabel(ST.ag))+' · '+monthLabel(ST.month)+'</strong><span class="pill '+(st==='clos'?'p-ok':st==='ouvert'?'p-verifier':'p-info')+'">'+STATUS[st]+'</span>';
  if (st === 'clos') h += '<span class="muted">clôturé le '+esc(d.closedAt ? new Date(d.closedAt).toLocaleDateString('fr-FR') : '')+' par '+esc(d.closedBy||'')+' · montants et grille figés</span>';
  else h += '<span class="muted" id="save">'+(d.updatedAt ? 'Enregistré le '+dt(d.updatedAt)+' par '+esc(d.updatedBy||'') : '')+'</span>';
  if (st === 'clos' && isAdmin()) h += '<span class="sp"><button class="btn" data-a="reopen">Rouvrir le mois</button></span>';
  return h + '</div>';
}
function defaultMonth(){ var d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function openCount(a){ if (a.code !== 'NON_RATTACHE' && a.code !== 'AFFAIRE_INCONNUE') return a.keys.length; return a.keys.filter(function(k){ return !ST.ov.assign[k] && !ST.ov.exclude[k] && !ST.ov.affaire[k]; }).length; }

/* chargement d'un mois d'une agence */
function selectMonth(ag, m){
  ST.ag = ag; ST.month = m; ST.busy = 'Chargement de '+agLabel(ag)+' · '+monthLabel(m)+'…'; ST.R = null; ST.files = []; ST.pdfs = []; ST.modal = null; ST.pending = null; ST.confirmClose = false; render();
  var id = monthId();
  return STORE.getMonth(id).then(function(doc){
    if (monthId() !== id) return null;
    ST.doc = doc || { id:id, status:'vide', files:[] };
    ST.ov = deepMerge(blankOv(), (doc && doc.ov) || {});
    ST.cfgM = (doc && doc.status==='clos' && doc.cfgSnapshot) ? doc.cfgSnapshot : ST.cfg;
    return Promise.all(((doc && doc.files) || []).map(function(meta){
      return STORE.loadImportRows(meta).then(function(rows){ var p = E.parseFile(meta.name, rows); p.meta = meta; return p; },
        function(e){ return { name:meta.name, meta:meta, error:'Lecture impossible : '+e.message }; });
    }));
  }).then(function(parsed){
    if (monthId() !== id || !parsed) return;
    ST.files = parsed; ST.busy = ''; rebuild();
    return STORE.listPdfs(id).then(function(p){ if (monthId() === id){ ST.pdfs = p; render(); } });
  }).catch(function(e){ ST.busy = ''; toast('Chargement impossible : '+e.message); render(); });
}
function rebuild(noRender){
  var ok = ST.files.filter(function(f){ return !f.error && f.kind; });
  ST.R = ok.length ? E.build(ok, ST.cfgM || ST.cfg, ST.ov, ST.month, ST.ag) : null;
  ST.flags = {};
  if (ST.R) ST.R.anomalies.forEach(function(a){ a.keys.forEach(function(k){ (ST.flags[k] = ST.flags[k] || []).push(a); }); });
  render();
}
var saveT = null, saveWhat = [];
function persist(what){
  if (!canEdit()) return;
  if (what) saveWhat.push(what);
  clearTimeout(saveT); var s = $('save'); if (s) s.textContent = 'Enregistrement…';
  var id = monthId();
  saveT = setTimeout(function(){
    var w = saveWhat.splice(0);
    STORE.saveMonth(id, { ov:ST.ov, summary: ST.R ? summarize(ST.R) : null }).then(function(){
      var s2 = $('save'); if (s2) s2.textContent = 'Enregistré à '+hhmm();
      if (w.length) STORE.log('modification', w.slice(0,6).join(' · ')+(w.length>6?' (+'+(w.length-6)+')':''), id);
      refreshIndex();
    }, function(e){ toast('Enregistrement impossible : '+e.message); });
  }, 700);
}
function refreshIndex(){ return STORE.listMonths().then(function(L){ ST.monthsIndex = L; if (ST.module==='log' && (ST.ltab==='fac' || ST.ltab==='syn')) render(); }); }

/* A · Import : 2 fichiers */
var SLOTS = [['manut','Entrées et sorties','Export Odoo « Fichier Manutention »'],['stock','Stockage','Export Odoo « Fichier Client Stockage »']];
function agCountIn(p, code){
  var a = ST.cfg.agencies[code], m = a && a.match ? a.match.toUpperCase() : null, n = 0, others = {};
  (p.records||[]).forEach(function(r){ var raw = (r.clientRaw||'').toUpperCase(); var mine = m ? raw.indexOf(m) === 0 : r.ag === code; if (mine) n++; else if (r.ag || raw !== 'FALSE'){ var oa = matchAg(r); if (oa) others[oa] = (others[oa]||0)+1; } });
  return { n:n, others:others };
}
function matchAg(r){ var raw = (r.clientRaw||'').toUpperCase(), best = null; agencies(true).forEach(function(a){ if (a.match && raw.indexOf(a.match.toUpperCase()) === 0 && (!best || a.match.length > ST.cfg.agencies[best].match.length)) best = a.code; }); return best || (r.ag ? 'AG '+r.ag+' (non paramétrée)' : null); }
function vImport(){
  var h = '';
  if (ST.pending) h += pendingBox();
  h += '<div class="slots">';
  SLOTS.forEach(function(s){
    var f = ST.files.filter(function(x){ return x.kind === s[0] || (!x.kind && x.meta && false); })[0];
    h += '<div class="panel slot"><div class="ph"><h3>'+s[1]+'</h3><span class="muted">'+s[2]+'</span></div><div class="pb" style="display:grid;gap:10px">';
    if (f){
      var c = agCountIn(f, ST.ag), mo = E.detectMonth([f]);
      h += '<dl class="kv"><dt>Fichier</dt><dd>'+esc(f.name)+'</dd><dt>Importé</dt><dd>'+dt(f.meta && f.meta.at)+' · '+esc(f.meta ? f.meta.by : '')+'</dd><dt>Lignes</dt><dd class="num">'+f.records.length+' dont '+c.n+' pour '+esc(agLabel(ST.ag))+'</dd>'+
        (Object.keys(c.others).length ? '<dt>Autres clients</dt><dd>'+Object.keys(c.others).map(function(k){ return esc(ST.cfg.agencies[k] ? agLabel(k) : k)+' : '+c.others[k]; }).join(' · ')+' <span class="muted">(ignorées ici)</span></dd>' : '')+
        '<dt>Données de</dt><dd>'+(mo ? monthLabel(mo) : '—')+(mo && mo !== ST.month ? ' <span class="pill p-verifier">≠ période</span>' : '')+'</dd><dt>Structure</dt><dd>'+(f.missing && f.missing.length ? '<span class="pill p-bloquant">Colonnes manquantes</span> '+esc(f.missing.join(', ')) : f.kind==='stock' && f.fmt==='B' ? '<span class="pill p-verifier">Incomplet</span> sans dates d\'entrée/sortie : durées reconstruites depuis les mouvements' : '<span class="pill p-ok">Conforme</span>')+'</dd></dl>';
      if (canEdit()) h += '<div class="row"><label class="btn sm">Remplacer<input type="file" hidden data-slotin="'+s[0]+'" accept=".xls,.xlsx,.csv"></label><button class="btn sm" data-rmfile="'+esc(f.meta ? f.meta.id : '')+'">Supprimer</button></div>';
    } else if (canEdit()) h += '<label class="drop" data-slot="'+s[0]+'"><input type="file" data-slotin="'+s[0]+'" accept=".xls,.xlsx,.csv"><strong>Déposer le fichier</strong><span class="muted">ou cliquer pour le choisir</span></label>';
    else h += '<div class="empty">Aucun fichier.</div>';
    h += '</div></div>';
  });
  h += '</div>';
  var bad = ST.files.filter(function(x){ return x.error || !x.kind; });
  if (bad.length) h += '<p class="note"><span class="pill p-bloquant">Illisible</span> '+bad.map(function(b){ return esc(b.name)+' : '+esc(b.error||'format non reconnu'); }).join(' · ')+'</p>';
  if (ST.R){
    var R = ST.R;
    h += '<div class="kpis">'+kpi('Entrées', R.M.filter(function(r){ return r.op==='E' && r.billable; }).length, 'mouvements facturables')+kpi('Sorties', R.M.filter(function(r){ return r.op==='S' && r.billable; }).length, 'mouvements facturables')+kpi('Lignes de stock', R.S.filter(function(r){ return r.billable; }).length, 'colis présents sur la période')+kpi('Factures', R.invoices.length, 'à générer')+'</div>';
    h += '<div><button class="btn pri" data-sub="ano">Passer aux anomalies →</button></div>';
  }
  return h;
}
function pendingBox(){
  var P = ST.pending, h = '<div class="panel pb warnbox">';
  if (P.type === 'month') h += '<p><span class="pill p-verifier">Période</span> Le fichier <strong>'+esc(P.file.name)+'</strong> porte sur <strong>'+monthLabel(P.month)+'</strong>, la période ouverte est <strong>'+monthLabel(ST.month)+'</strong>.</p><div class="row"><button class="btn pri" data-a="pendGo">Importer dans '+monthLabel(P.month)+'</button><button class="btn" data-a="pendHere">Importer quand même dans '+monthLabel(ST.month)+'</button><button class="btn" data-a="pendNo">Annuler</button></div>';
  else h += '<p><span class="pill p-verifier">Agence</span> Le fichier <strong>'+esc(P.file.name)+'</strong> ne contient aucune ligne de <strong>'+esc(agLabel(ST.ag))+'</strong>'+(P.ag ? ' mais '+P.n+' lignes de <strong>'+esc(agLabel(P.ag))+'</strong>' : '')+'.</p><div class="row">'+(P.ag ? '<button class="btn pri" data-a="pendAg">Importer dans '+esc(agLabel(P.ag))+'</button>' : '')+'<button class="btn" data-a="pendHere">Importer quand même ici</button><button class="btn" data-a="pendNo">Annuler</button></div>';
  return h + '</div>';
}
function parseLocal(file){
  return new Promise(function(res){
    var fr = new FileReader();
    fr.onload = function(){ try { var wb = XLSX.read(new Uint8Array(fr.result), { type:'array', raw:false, cellDates:false }); res(E.parseFile(file.name, XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:true, defval:null }))); } catch(e){ res({ name:file.name, error:'Fichier illisible : '+e.message }); } };
    fr.onerror = function(){ res({ name:file.name, error:'Lecture impossible' }); };
    fr.readAsArrayBuffer(file);
  });
}
function importFile(file, slot){
  if (!canEdit()){ toast(monthClosed() ? 'Mois clôturé : le rouvrir avant d\'importer.' : 'Droits insuffisants.'); return; }
  if (typeof XLSX === 'undefined'){ toast('Lecteur Excel indisponible : vérifier la connexion.'); return; }
  parseLocal(file).then(function(p){
    if (p.error || !p.kind){ toast(file.name+' : '+(p.error || 'format non reconnu (ni Manutention ni Stockage)')); return; }
    if (slot && p.kind !== slot) toast('« '+file.name+' » est un export '+(p.kind==='manut'?'Manutention (entrées/sorties)':'Stockage')+' : rangé dans la bonne case.');
    var mo = E.detectMonth([p]), c = agCountIn(p, ST.ag);
    if (!c.n){ var top = Object.keys(c.others).filter(function(k){ return ST.cfg.agencies[k]; }).sort(function(a,b){ return c.others[b]-c.others[a]; })[0]; ST.pending = { type:'agency', file:file, parsed:p, ag:top, n:top ? c.others[top] : 0 }; render(); return; }
    if (mo && mo !== ST.month){ ST.pending = { type:'month', file:file, parsed:p, month:mo }; render(); return; }
    doUpload(file, p, ST.ag, ST.month);
  });
}
function doUpload(file, p, ag, month){
  ST.pending = null; var id = ag+'_'+month, prev = (ag === ST.ag && month === ST.month) ? ST.files.filter(function(f){ return f.kind === p.kind && f.meta; }).map(function(f){ return f.meta; }) : null;
  ST.busy = 'Enregistrement de '+file.name+'…'; render();
  var chain = prev ? Promise.resolve(prev) : STORE.getMonth(id).then(function(d){
    if (d && d.status === 'clos') throw new Error(agLabel(ag)+' · '+monthLabel(month)+' est clôturé');
    return Promise.all(((d && d.files) || []).map(function(meta){ return STORE.loadImportRows(meta).then(function(rows){ return E.parseFile(meta.name, rows).kind === p.kind ? meta : null; }); })).then(function(L){ return L.filter(Boolean); });
  });
  chain.then(function(old){ return old.reduce(function(pr, m){ return pr.then(function(){ return STORE.deleteImport(id, m); }); }, Promise.resolve()); })
    .then(function(){ return STORE.uploadImport(id, file); })
    .then(function(){ ST.busy = ''; toast(file.name+' enregistré pour '+agLabel(ag)+' · '+monthLabel(month)); refreshIndex(); return selectMonth(ag, month); },
      function(e){ ST.busy = ''; toast('Import impossible : '+e.message); render(); });
}
function bindDrops(){
  Array.prototype.forEach.call(document.querySelectorAll('.drop[data-slot]'), function(d){
    d.ondragover = function(e){ e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = function(){ d.classList.remove('over'); };
    d.ondrop = function(e){ e.preventDefault(); d.classList.remove('over'); if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0], d.dataset.slot); };
  });
}

/* B · Anomalies */
function vAnomalies(){
  if (!ST.R) return '<div class="panel empty">Importer d\'abord les deux exports Odoo.</div>';
  var A = ST.R.anomalies.filter(function(a){ return a.code !== 'AUTRE_AGENCE'; }), c = { bloquant:0, verifier:0, info:0 };
  A.forEach(function(a){ c[a.sev] += openCount(a); });
  var h = '<div class="kpis">'+kpi('Bloquant', c.bloquant, 'lignes non facturées tant que non traitées')+kpi('À vérifier', c.verifier, 'facturées selon la règle, à confirmer')+kpi('Information', c.info, 'écarts Odoo sans action requise')+kpi('Lignes exclues', Object.keys(ST.ov.exclude).length, 'par l\'ADV')+'</div>';
  h += '<div class="panel"><div class="ph"><h2>Journal des anomalies</h2><span class="muted">Chaque contrôle liste les lignes concernées, avec fichier et n° de ligne Excel.</span></div>';
  if (!A.length) h += '<div class="empty">Aucune anomalie.</div>';
  A.forEach(function(a){
    var open = ST.openAnom[a.code];
    h += '<div class="anom"><button class="anom-h" data-anom="'+a.code+'" aria-expanded="'+(open?'true':'false')+'"><span class="pill p-'+a.sev+'">'+SEV[a.sev]+'</span><span class="t">'+esc(a.title)+'</span><span class="num">'+openCount(a)+' l.</span><span class="e">'+esc(a.explain)+(a.note?'<br><span class="muted">'+esc(a.note)+'</span>':'')+'</span></button>';
    if (open) h += '<div class="anom-b">'+(a.code==='NON_RATTACHE' ? assignTable(a) : a.code==='AFFAIRE_INCONNUE' ? affTable(a) : (a.merge ? mergeBox(a) : '') + recTable(a.keys, 'anom-'+a.code))+'</div>';
    h += '</div>';
  });
  return h + '</div>';
}
function cmOptions(sel){
  var o = ['<option value="">— Rattacher à —</option>'], seen = {};
  ST.R.records.forEach(function(r){ if (r.ag && !seen[r.ag+'|'+r.cm]){ seen[r.ag+'|'+r.cm]=1; } });
  Object.keys(seen).sort().forEach(function(k){ var p=k.split('|'); o.push('<option value="'+esc(k)+'"'+(k===sel?' selected':'')+'>AG '+esc(p[0])+' · '+esc(p[1])+'</option>'); });
  o.push('<option value="__EXCL__"'+(sel==='__EXCL__'?' selected':'')+'>Ne pas facturer</option>');
  return o.join('');
}
function assignTable(a){
  var h = '<div class="tw"><table><thead><tr><th>Fichier · ligne</th><th>Type</th><th>Code CM</th><th>N° BR</th><th>N° colis</th><th>Produit</th><th class="n">Vol. m³</th><th>Suggestion</th><th>Rattachement</th></tr></thead><tbody>';
  a.keys.forEach(function(k){
    var r = ST.R.byKey[k], cur = ST.ov.assign[k] ? ST.ov.assign[k].ag+'|'+ST.ov.assign[k].cm : ST.ov.exclude[k] ? '__EXCL__' : '';
    var sg = r.suggest ? 'AG '+esc(r.suggest.t.ag)+' · '+esc(r.suggest.t.cm)+' <span class="muted">(via '+esc(r.suggest.via)+')</span> <button class="btn sm" data-sugg="'+esc(k)+'"'+RO()+'>Appliquer</button>' : '<span class="muted">Aucune</span>';
    h += '<tr><td class="num">'+esc(shortF(r.file))+' · '+r.line+'</td><td>'+(r.kind==='manut'?(r.op==='E'?'Entrée':'Sortie')+' '+E.frDate(r.date):'Stock')+'</td><td class="num">'+esc(r.cmCode||'—')+'</td><td class="num">'+esc(r.br)+'</td><td class="num">'+esc(r.colis)+'</td><td class="prod" title="'+esc(r.produit)+'">'+esc(r.produit)+'</td><td class="n">'+n3(r.vol)+'</td><td>'+sg+'</td><td><select data-assign="'+esc(k)+'"'+RO()+'>'+cmOptions(cur)+'</select></td></tr>';
  });
  return h + '</tbody></table></div>';
}
function affOptions(ag, sel){
  var seen = {}; ST.R.records.forEach(function(r){ if (r.eff && r.eff.ag===ag && r.affaire && r.affSrc==='N° de commande') seen[r.affaire]=1; });
  return '<option value="">— Affaire —</option>'+Object.keys(seen).sort().map(function(k){ return '<option'+(k===sel?' selected':'')+'>'+esc(k)+'</option>'; }).join('')+'<option value="__EXCL__"'+(sel==='__EXCL__'?' selected':'')+'>Ne pas facturer</option>';
}
function affTable(a){
  var h = '<div class="tw"><table><thead><tr><th>Fichier · ligne</th><th>Type</th><th>Contremaître</th><th>N° commande Odoo</th><th>N° colis</th><th>Produit</th><th class="n">Montant</th><th>Affaire</th></tr></thead><tbody>';
  a.keys.forEach(function(k){
    var r = ST.R.byKey[k], cur = ST.ov.affaire[k] || (ST.ov.exclude[k] ? '__EXCL__' : '');
    h += '<tr><td class="num">'+esc(shortF(r.file))+' · '+r.line+'</td><td>'+(r.kind==='manut'?(r.op==='E'?'Entrée':'Sortie')+' '+E.frDate(r.date):'Stock')+'</td><td>'+esc(r.eff?r.eff.cm:'')+'</td><td class="num">'+esc(r.cmdRaw)+'</td><td class="num">'+esc(r.colis)+'</td><td class="prod" title="'+esc(r.produit)+'">'+esc(r.produit)+'</td><td class="n">'+n2(r.amount)+'</td><td><select data-aff="'+esc(k)+'"'+RO()+'>'+affOptions(r.eff?r.eff.ag:'', cur)+'</select></td></tr>';
  });
  return h + '</tbody></table></div><p class="note muted">Affaires proposées : celles de l\'agence. Pour un retour chantier, retrouver dans Odoo l\'appareil d\'origine du colis.</p>';
}
function mergeBox(a){
  return '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px"><span class="lbl">Correction</span>'+a.merge.map(function(ks){
    return ks.map(function(from){ return ks.filter(function(to){ return to!==from; }).map(function(to){ var on = ST.ov.affMap[from]===to; return '<button class="btn sm'+(on?' pri':'')+'" data-merge="'+esc(from)+'|'+esc(to)+'"'+RO()+'>'+(on?'✓ ':'')+'Facturer '+esc(from)+' sur '+esc(to)+'</button>'; }).join(''); }).join('');
  }).join('')+'</div>';
}
function shortF(f){ return f.replace(/^Fichier_/, '').replace(/_-_(\d{4})-(\d{2})-(\d{2})_(\d{2})_(\d{2})_(\d{2}).*$/, ' $4h$5').replace(/_/g,' '); }

/* table générique de lignes (détail) */
function recTable(keys, id){
  var recs = keys.map(function(k){ return ST.R.byKey[k]; }).filter(Boolean);
  var lim = ST.lim[id] || 150, hasM = recs.some(function(r){ return r.kind==='manut'; }), hasS = recs.some(function(r){ return r.kind==='stock'; });
  var h = '<div class="detail"><table><thead><tr><th title="Exclure de la facture">Excl.</th><th>Fichier · ligne</th><th>Contremaître</th><th>N° BR</th><th>Affaire</th><th>Appareil</th><th>N° colis</th><th>Produit</th>';
  if (hasM) h += '<th>Date · op.</th>';
  if (hasS) h += '<th>Période retenue</th><th class="n">Jours</th><th class="n">J. Odoo</th>';
  h += '<th class="n">L×l×h mm</th><th class="n">Poids kg</th><th class="n">Vol. m³</th><th>Calcul</th><th class="n">Montant</th><th class="n">Prix Odoo</th><th>Contrôles</th></tr></thead><tbody>';
  recs.slice(0, lim).forEach(function(r){
    var fl = (ST.flags[r.key]||[]).map(function(a){ return '<span class="flag f-'+a.sev+'" title="'+esc(a.title)+'"></span>'; }).join('');
    var ex = !!ST.ov.exclude[r.key];
    h += '<tr class="'+(ex?'excl':'')+'"><td><input type="checkbox" data-excl="'+esc(r.key)+'"'+(ex?' checked':'')+RO()+' aria-label="Exclure"></td><td class="num" style="white-space:nowrap">'+esc(shortF(r.file))+' · '+r.line+'</td><td style="white-space:nowrap">'+esc(r.eff?r.eff.cm:'Non rattaché')+'</td><td class="num">'+esc(r.br)+'</td><td class="num" title="'+esc(r.affSrc)+'">'+esc(r.affaire||'—')+(r.affSrc&&r.affSrc!=='N° de commande'?'*':'')+'</td><td class="num" title="Odoo : '+esc(r.cmdRaw)+'">'+esc(r.apLabel||'')+'</td><td class="num">'+esc(r.colis||'—')+'</td><td class="prod" title="'+esc(r.produit)+'">'+esc(r.produit)+'</td>';
    if (hasM) h += '<td style="white-space:nowrap">'+(r.kind==='manut'?E.frDate(r.date)+' · '+(r.op==='E'?'Entrée':'Sortie'):'')+'</td>';
    if (hasS) h += r.kind==='stock' ? '<td style="white-space:nowrap" title="'+esc(r.daysSrc)+'">'+(r.pStart?E.frDate(r.pStart).slice(0,5)+' → '+E.frDate(r.pEnd).slice(0,5):'—')+' <span class="muted">'+esc(r.daysSrc==='Dates Odoo'?'':r.daysSrc.indexOf('Reconstruit')===0?'(reconstr.)':'(Odoo)')+'</span></td><td class="n">'+r.days+'</td><td class="n">'+(isNaN(r.odooJours)?'':r.odooJours)+'</td>' : '<td></td><td></td><td></td>';
    h += '<td class="n">'+r.L+'×'+r.l+'×'+r.h+'</td><td class="n">'+(isNaN(r.kg)?'':r.kg)+'</td><td class="n">'+n3(r.vol)+'</td><td class="formula">'+esc(r.formula||'')+'</td><td class="n">'+n2(r.amount)+'</td><td class="n">'+(isNaN(r.odooPrix)?'':n2(r.odooPrix))+'</td><td>'+fl+'</td></tr>';
  });
  h += '</tbody></table></div>';
  if (recs.length > lim) h += '<p><button class="btn sm" data-more="'+esc(id)+'">Afficher '+Math.min(500, recs.length-lim)+' lignes de plus ('+(recs.length-lim)+' restantes)</button></p>';
  return h;
}

/* C · Factures */
var FAM3 = [ { k:'E', label:'Entrées', fams:['E'], unit:'UP (m³/t)' }, { k:'S', label:'Sorties', fams:['S'], unit:'UP (m³/t)' }, { k:'STK', label:'Stockage', fams:['STK','MIN'], unit:'m² facturés' } ];
function famAgg(I, f){
  var o = { n:0, qty:0, amount:0, keys:[], minAmt:0, minKeys:[] };
  I.lineList.forEach(function(l){
    if (f.fams.indexOf(l.fam) < 0) return;
    if (l.fam === 'MIN'){ o.minAmt = E.r2(o.minAmt + l.amount); o.minKeys = o.minKeys.concat(l.keys); o.qty += l.qty; }
    else { o.n += l.n; o.qty += l.qty; o.keys = o.keys.concat(l.keys); }
    o.amount = E.r2(o.amount + l.amount);
  });
  return o;
}
function filesSig(){ return ST.files.filter(function(f){ return f.meta; }).map(function(f){ return f.meta.id; }).sort().join(','); }
function subOf(r, I){ return I.split === 'affaire' ? r.affaire : I.split === 'cm' ? r.eff.cm : I.split === 'appareil' ? r.apLabel : 'Agence'; }
function famKeys(I, f){
  var g = famAgg(I, f), ex = [];
  ST.R.records.forEach(function(r){
    if (!ST.ov.exclude[r.key] || !r.eff || r.eff.ag !== I.ag) return;
    var fam = r.kind === 'manut' ? r.op : 'STK'; if (f.fams.indexOf(fam) < 0) return;
    if (subOf(r, I) === I.sub) ex.push(r.key);
  });
  var all = g.keys.concat(ex).sort(function(a, b){ var A = ST.R.byKey[a], B = ST.R.byKey[b]; return A.file === B.file ? A.line - B.line : A.file.localeCompare(B.file); });
  return { g:g, keys:all, excluded:ex };
}
function autoStatus(I){ var bad = I.lineList.some(function(l){ return l.keys.some(function(k){ return (ST.flags[k]||[]).some(function(a){ return a.sev !== 'info'; }); }); }); return bad ? 'verifier' : 'editer'; }
function generate(){
  if (!canEdit() || !ST.R) return;
  var n = 0; ST.R.invoices.forEach(function(I){ if (!ST.ov.status[I.key]){ ST.ov.status[I.key] = autoStatus(I); n++; } });
  ST.doc.gen = { at:new Date().toISOString(), by:ST.user.email, sig:filesSig(), n:ST.R.invoices.length };
  STORE.saveMonth(monthId(), { gen:ST.doc.gen, ov:ST.ov, summary:summarize(ST.R) }).then(function(){ STORE.log('generation', ST.R.invoices.length+' factures · '+eur(ST.R.totals.HT)+' HT', monthId()); refreshIndex(); });
  toast(ST.R.invoices.length+' factures générées'); render();
}
function vInvoices(){
  if (!ST.R) return '<div class="panel empty">Importer d\'abord les deux exports Odoo.</div>';
  var R = ST.R, gen = ST.doc && ST.doc.gen, stale = gen && gen.sig !== filesSig();
  var blk = R.anomalies.filter(function(a){ return a.sev==='bloquant'; }).reduce(function(s,a){ return s+openCount(a); },0);
  var h = '<div class="toolbar">'+(canEdit() ? '<button class="btn pri" data-a="gen">'+(gen ? 'Régénérer les factures' : 'Générer les factures')+'</button>' : '')+
    '<span class="muted">'+(gen ? 'Générées le '+dt(gen.at)+' par '+esc(gen.by) : 'Factures non générées')+'</span>'+
    (stale ? '<span class="pill p-verifier">Les imports ont changé depuis la génération : régénérer</span>' : '')+
    (blk ? '<span class="pill p-bloquant">'+blk+' ligne(s) bloquante(s) non facturée(s)</span>' : '')+
    '<span class="sp">'+(gen ? '<button class="btn" data-a="xlsAg"'+(canSave()?'':' disabled')+'>Exporter le détail (.xlsx)</button>' : '')+'</span></div>';
  if (!gen) return h + '<div class="panel empty">'+R.invoices.length+' factures prêtes à être générées pour '+esc(agLabel(ST.ag))+' · '+monthLabel(ST.month)+' ('+eur(R.totals.HT)+' HT).'+(blk ? '<br>Traiter d\'abord les '+blk+' ligne(s) bloquante(s) dans Anomalies, sinon elles ne seront pas facturées.' : '')+'</div>';
  var t = { E:0, S:0, STK:0, HT:0 }, cnt = { verifier:0, editer:0, editee:0 };
  var body = R.invoices.map(function(I){
    var st = ST.ov.status[I.key] || autoStatus(I); cnt[st]++;
    var stk = E.r2(I.totals.STK + I.totals.MIN); t.E = E.r2(t.E + I.totals.E); t.S = E.r2(t.S + I.totals.S); t.STK = E.r2(t.STK + stk); t.HT = E.r2(t.HT + I.totals.HT);
    var aps = Object.keys(I.appareils).sort();
    function amt(f, v){ var fk = famKeys(I, FAM3.filter(function(x){ return x.k===f; })[0]); return fk.keys.length ? '<button class="amt" data-amt="'+esc(I.key)+'|'+f+'">'+n2(v)+(fk.excluded.length ? '<span class="xn" title="lignes exclues">−'+fk.excluded.length+'</span>' : '')+'</button>' : '<span class="muted">—</span>'; }
    return '<tr class="st-'+st+'"><td><span class="num inum">'+esc(I.num)+'</span><br><strong class="num">'+esc(I.sub)+'</strong> <span class="muted">'+esc(Object.keys(I.cms).join(', '))+'</span><br><span class="muted num aps">'+aps.length+' appareil'+(aps.length>1?'s':'')+' : '+esc(aps.join(' · '))+'</span></td>'+
      '<td class="n">'+amt('E', I.totals.E)+'</td><td class="n">'+amt('S', I.totals.S)+'</td><td class="n">'+amt('STK', stk)+'</td><td class="n"><strong>'+n2(I.totals.HT)+'</strong></td>'+
      '<td><select class="stsel s-'+st+'" data-st="'+esc(I.key)+'"'+RO()+'>'+Object.keys(INVST).map(function(k){ return '<option value="'+k+'"'+(k===st?' selected':'')+'>'+INVST[k]+'</option>'; }).join('')+'</select></td>'+
      '<td class="c"><button class="gear" data-pinv="'+esc(I.key)+'" title="Exporter la facture en PDF" aria-label="Exporter '+esc(I.num)+' en PDF"'+(canSave()?'':' disabled')+'>'+GEAR+'<span>PDF</span></button></td></tr>';
  }).join('');
  h += '<div class="kpis">'+kpi('Total HT', eur(t.HT), R.invoices.length+' factures')+kpi('À vérifier', cnt.verifier, 'lignes signalées dans Anomalies')+kpi('À éditer', cnt.editer, '')+kpi('Éditées', cnt.editee, '')+'</div>';
  h += '<div class="panel"><div class="tw"><table class="invt2"><thead><tr><th>Facture</th><th class="n">Entrées</th><th class="n">Sorties</th><th class="n">Stockage</th><th class="n">Total HT</th><th>Statut</th><th class="c">Export</th></tr></thead><tbody>'+body+
    '</tbody><tfoot><tr class="tot"><td>Total '+esc(agLabel(ST.ag))+'</td><td class="n">'+n2(t.E)+'</td><td class="n">'+n2(t.S)+'</td><td class="n">'+n2(t.STK)+'</td><td class="n">'+n2(t.HT)+'</td><td colspan="2"></td></tr></tfoot></table></div>'+
    '<p class="pb note muted" style="margin:0">Cliquer un montant pour voir le détail colis par colis et exclure des lignes. Le PDF passe la facture en « Éditée ».</p></div>';
  return h;
}
/* fenêtre de détail */
function renderModal(){
  var box = $('modal'); if (!box) return;
  if (!ST.modal || !ST.R){ box.hidden = true; box.innerHTML = ''; document.body.classList.remove('noscroll'); return; }
  var I = ST.R.invoices.filter(function(x){ return x.key === ST.modal.inv; })[0];
  if (!I){ ST.modal = null; box.hidden = true; return; }
  var f = FAM3.filter(function(x){ return x.k === ST.modal.fam; })[0], fk = famKeys(I, f), g = fk.g;
  var h = '<div class="mbox" role="dialog" aria-modal="true" aria-label="Détail '+esc(f.label)+'"><div class="mhead"><div><span class="lbl">'+esc(I.num)+' · '+esc(I.sub)+'</span><h2>'+f.label+'</h2></div><button class="btn" data-mclose>Fermer</button></div>';
  h += '<div class="kpis">'+kpi('Colis facturés', g.n, fk.excluded.length ? fk.excluded.length+' ligne(s) exclue(s), grisée(s)' : 'aucune exclusion')+kpi('Quantité', n3(g.qty), f.unit)+kpi('Montant HT', eur(g.amount), g.minAmt ? 'dont minimum 30 m² : '+eur(g.minAmt) : '')+'</div>';
  h += '<div class="mbody">'+famDetail(I, f, { keys:fk.keys, minKeys:g.minKeys }, 'm-'+I.key+f.k)+'</div></div>';
  box.innerHTML = h; box.hidden = false; document.body.classList.add('noscroll');
}
function famDetail(I, f, g, id){
  var h = '';
  if (f.k === 'STK' && g.minKeys.length){
    h += '<div class="note" style="padding:0 8px 8px"><span class="lbl">Minimum 30 m² par appareil</span><br>'+g.minKeys.map(function(k){ var m = ST.R.byKey[k]; return 'Appareil <span class="num">'+esc(m.apLabel)+'</span> : '+n3(m.surf)+' m² facturés au mois → complément <span class="formula">'+esc(m.formula)+'</span>'; }).join('<br>')+'</div>';
  }
  if (g.keys.length) h += recTable(g.keys, id);
  return h;
}

/* Pro forma PDF */
function invLines(I){
  var g = ST.cfgM || ST.cfg, grid = g.grids[I.grid] || g.grids.STD, out = [];
  ['E','S'].forEach(function(fam){
    var recs = []; I.lineList.forEach(function(l){ if (l.fam === fam) l.keys.forEach(function(k){ recs.push(ST.R.byKey[k]); }); });
    if (!recs.length) return;
    var lab = fam === 'E' ? 'Entrées en stock' : 'Sorties de stock';
    var tx = recs.filter(function(r){ return r.applied === 'taux'; }), mc = recs.filter(function(r){ return r.applied !== 'taux' && r.minCat === 'chariot'; }), mm = recs.filter(function(r){ return r.applied !== 'taux' && r.minCat === 'manuel'; });
    var sum = function(a, k){ return a.reduce(function(s, r){ return s + r[k]; }, 0); };
    if (tx.length) out.push({ fam:fam, label:lab+' · '+tx.length+' colis au tarif', qty:sum(tx,'up'), unit:'UP (m³/t)', pu:grid.rate, pud:4, amount:E.r2(sum(tx,'amount')) });
    if (mc.length) out.push({ fam:fam, label:lab+' · minimum chariot / transpalette', qty:mc.length, unit:'colis', pu:E.r2(grid.minChariot), pud:2, amount:E.r2(sum(mc,'amount')) });
    if (mm.length) out.push({ fam:fam, label:lab+' · minimum manuel', qty:mm.length, unit:'colis', pu:E.r2(grid.minManuel), pud:2, amount:E.r2(sum(mm,'amount')) });
  });
  var tiers = {}; I.lineList.forEach(function(l){ if (l.fam === 'STK') l.keys.forEach(function(k){ var r = ST.R.byKey[k], t = tiers[r.tier+'|'+r.pu] = tiers[r.tier+'|'+r.pu] || { tier:r.tier, pu:r.pu, n:0, qty:0, amount:0 }; t.n++; t.qty += r.surfFact; t.amount += r.amount; }); });
  Object.keys(tiers).forEach(function(k){ var t = tiers[k]; out.push({ fam:'STK', label:'Stockage · tarif '+E.TIER_LABEL[t.tier].toLowerCase()+' · '+t.n+' colis', qty:t.qty, unit:'m²', pu:t.pu, pud:t.pu % 0.01 ? 3 : 2, amount:E.r2(t.amount) }); });
  I.lineList.forEach(function(l){ if (l.fam === 'MIN') l.keys.forEach(function(k){ var m = ST.R.byKey[k]; out.push({ fam:'STK', label:'Stockage · complément minimum 30 m² · appareil '+m.apLabel, qty:m.comp, unit:'m²', pu:m.pu, pud:2, amount:m.amount }); }); });
  return out;
}
function pdfTxt(s){ return String(s === null || s === undefined ? '' : s).replace(/[  ]/g, ' ').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[−]/g, '-').replace(/[→]/g, '->').replace(/[«»]/g, '"').replace(/m³/g, 'm3').replace(/m²/g, 'm2').replace(/³/g, '3').replace(/²/g, '2'); }
function fmtN(x, d){ return pdfTxt((x||0).toLocaleString('fr-FR', { minimumFractionDigits:d, maximumFractionDigits:d })); }
function exportInvoicePdf(key){
  var I = ST.R.invoices.filter(function(x){ return x.key === key; })[0]; if (!I) return;
  if (!window.jspdf || !window.jspdf.jsPDF){ toast('Générateur PDF indisponible : vérifier la connexion.'); return; }
  var c = (ST.cfgM || ST.cfg), co = c.company || {}, A = c.agencies[I.ag] || {}, cas1 = I.cas === 1;
  var doc = new window.jspdf.jsPDF({ unit:'mm', format:'a4' }), W = 210, M = 16;
  var ink = [20,22,24], mut = [100,107,114], line = [214,218,221];
  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor.apply(doc, ink); doc.text(pdfTxt(co.name || 'LEGAA'), M, 20);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, mut);
  var y = 25; pdfTxt(co.address || '').split('\n').filter(Boolean).forEach(function(l){ doc.text(l, M, y); y += 4; });
  if (co.siret) { doc.text('SIRET '+pdfTxt(co.siret), M, y); y += 4; } if (co.tva) { doc.text('TVA '+pdfTxt(co.tva), M, y); y += 4; }
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor.apply(doc, ink); doc.text(cas1 ? 'DEVIS PRO FORMA' : 'FACTURE PRO FORMA', W-M, 20, { align:'right' });
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, ink);
  var today = new Date(), due = new Date(today.getTime() + (+co.paymentDays||30)*86400000);
  [['N°', I.num], ['Date', today.toLocaleDateString('fr-FR')], ['Période', monthLabel(ST.month)], ['Échéance', due.toLocaleDateString('fr-FR')]].forEach(function(p, i){ doc.setTextColor.apply(doc, mut); doc.text(p[0], W-M-58, 27+i*5); doc.setTextColor.apply(doc, ink); doc.text(pdfTxt(p[1]), W-M, 27+i*5, { align:'right' }); });
  y = Math.max(y, 48) + 4;
  doc.setDrawColor.apply(doc, line); doc.rect(W/2, y, W/2-M, 26);
  doc.setFontSize(8); doc.setTextColor.apply(doc, mut); doc.text('CLIENT', W/2+4, y+5);
  doc.setFontSize(9.5); doc.setTextColor.apply(doc, ink); doc.setFont('helvetica','bold'); doc.text(pdfTxt('OTIS CN · '+(A.label || I.agLabel)), W/2+4, y+10.5); doc.setFont('helvetica','normal');
  pdfTxt(A.address || '').split('\n').filter(Boolean).slice(0,3).forEach(function(l, i){ doc.text(l, W/2+4, y+15.5+i*4.2); });
  var info = [[({affaire:'Affaire',cm:'Contremaître',appareil:'Appareil',ag:'Périmètre'})[I.split], I.sub], ['Contremaître(s)', Object.keys(I.cms).join(', ')], ['Appareils', Object.keys(I.appareils).sort().join(' · ')], ['Grille', (c.grids[I.grid]||{}).label || '']];
  doc.setFontSize(8.5); info.forEach(function(p, i){ doc.setTextColor.apply(doc, mut); doc.text(pdfTxt(p[0]), M, y+4+i*5.5); doc.setTextColor.apply(doc, ink); doc.text(doc.splitTextToSize(pdfTxt(p[1]), W/2-M-30)[0], M+28, y+4+i*5.5); });
  y += 33;
  var L = invLines(I), body = [];
  FAM3.forEach(function(f){
    var rows = L.filter(function(l){ return f.fams.indexOf(l.fam) >= 0 || (f.k==='STK' && l.fam==='STK'); }); if (!rows.length) return;
    var tot = rows.reduce(function(s, r){ return s + r.amount; }, 0);
    body.push([{ content:pdfTxt(f.k==='E'?'Entrées en stock':f.k==='S'?'Sorties de stock':'Stockage'), colSpan:4, styles:{ fontStyle:'bold', fillColor:[238,240,241] } }, { content:fmtN(tot,2), styles:{ fontStyle:'bold', halign:'right', fillColor:[238,240,241] } }]);
    rows.forEach(function(r){ body.push([pdfTxt(r.label), fmtN(r.qty, r.unit === 'colis' ? 0 : 3)+' '+pdfTxt(r.unit), fmtN(r.pu, r.pud), '', fmtN(r.amount,2)]); });
  });
  doc.autoTable({ startY:y, head:[[pdfTxt('Désignation'), { content:pdfTxt('Quantité'), styles:{ halign:'right' } }, { content:'PU HT', styles:{ halign:'right' } }, '', { content:'Montant HT', styles:{ halign:'right' } }]], body:body, theme:'plain', margin:{ left:M, right:M },
    styles:{ font:'helvetica', fontSize:8.5, cellPadding:1.8, textColor:ink, lineColor:line, lineWidth:{ bottom:0.1 } },
    headStyles:{ fontStyle:'bold', textColor:mut, fontSize:7.5, lineWidth:{ bottom:0.4 }, lineColor:ink },
    columnStyles:{ 0:{ cellWidth:92 }, 1:{ halign:'right', cellWidth:32 }, 2:{ halign:'right', cellWidth:22 }, 3:{ cellWidth:4 }, 4:{ halign:'right' } } });
  y = doc.lastAutoTable.finalY + 6;
  var tva = E.r2(I.totals.HT * 0.2);
  [['Total HT', I.totals.HT], ['TVA 20 %', tva], ['Total TTC', E.r2(I.totals.HT + tva)]].forEach(function(p, i){
    doc.setFont('helvetica', i === 2 ? 'bold' : 'normal'); doc.setFontSize(i === 2 ? 10.5 : 9); doc.text(pdfTxt(p[0]), W-M-60, y+i*6); doc.text(fmtN(p[1],2)+' EUR', W-M, y+i*6, { align:'right' });
  });
  doc.setDrawColor.apply(doc, ink); doc.line(W-M-62, y+8.2, W-M, y+8.2);
  y += 24;
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, mut);
  var note = doc.splitTextToSize(pdfTxt('Document de préparation : la facture officielle est émise dans le logiciel de facturation LEGAA. Montants calculés colis par colis selon la grille contractuelle et arrondis au centime par colis ; le détail est disponible sur demande'+(A.annexe ? ' et figure en annexe.' : '.')+' Unité payante (UP) = le plus grand du volume en m³ et du poids en tonnes.'), W-2*M);
  doc.text(note, M, y);
  var foot = pdfTxt([co.iban ? 'IBAN '+co.iban : '', 'Paiement à '+(+co.paymentDays||30)+' jours', co.mentions || ''].filter(Boolean).join(' · '));
  if (A.annexe){
    var det = [];
    FAM3.forEach(function(f){ var fk = famKeys(I, f); fk.g.keys.forEach(function(k){ var r = ST.R.byKey[k]; det.push([f.label, pdfTxt(r.colis||'-'), doc.splitTextToSize(pdfTxt(r.produit), 60)[0], pdfTxt(r.kind==='manut' ? E.frDate(r.date) : (r.days+' j')), fmtN(r.vol,3), fmtN(r.kind==='manut' ? r.up : r.surfFact,3), fmtN(r.amount,2)]); }); });
    doc.addPage(); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor.apply(doc, ink); doc.text(pdfTxt('Annexe · détail colis · '+I.num), M, 18);
    doc.autoTable({ startY:23, head:[['Famille','Colis','Produit','Date / jours','Vol. m³','UP / m²','Montant HT']], body:det, theme:'plain', margin:{ left:M, right:M },
      styles:{ fontSize:7, cellPadding:1.2, textColor:ink, lineColor:line, lineWidth:{ bottom:0.1 } }, headStyles:{ fontStyle:'bold', textColor:mut, lineWidth:{ bottom:0.4 }, lineColor:ink },
      columnStyles:{ 4:{ halign:'right' }, 5:{ halign:'right' }, 6:{ halign:'right' } } });
  }
  var pages = doc.getNumberOfPages();
  for (var p = 1; p <= pages; p++){ doc.setPage(p); doc.setFontSize(7); doc.setTextColor.apply(doc, mut); doc.text(foot, M, 290); doc.text(p+' / '+pages, W-M, 290, { align:'right' }); }
  var blob = doc.output('blob');
  saveBlob(I.num+' '+I.sub.replace(/[^\w\- ]+/g,'')+'.pdf', blob, 'pdf');
  if (canEdit() && ST.ov.status[I.key] !== 'editee'){ ST.ov.status[I.key] = 'editee'; render(); persist('Facture éditée '+I.num); }
}

/* D · Contrôle des factures */
var PST = { conforme:['p-ok','Conforme'], ecart:['p-bloquant','Écart'], non_rapprochee:['p-verifier','Non rapprochée'], illisible:['p-verifier','Illisible'], erreur:['p-bloquant','Erreur'] };
function famTotals(I){ return { E:I.totals.E, S:I.totals.S, STK:E.r2(I.totals.STK + I.totals.MIN) }; }
function pdfCtx(){
  var known = { affaires:{}, appareils:{} };
  ST.R.invoices.forEach(function(I){ if (I.split==='affaire') known.affaires[I.sub] = 1; Object.keys(I.appareils).forEach(function(a){ known.appareils[a] = 1; }); });
  return { known:known, invoices:ST.R.invoices, month:ST.month, famTotals:famTotals };
}
function vControl(){
  if (!ST.R) return '<div class="panel empty">Importer d\'abord les exports Odoo : le contrôle compare chaque PDF à la facture calculée.</div>';
  var P = ST.pdfs, c = { conforme:0, ecart:0, non_rapprochee:0, illisible:0, erreur:0 }, byInv = {};
  P.forEach(function(p){ var st = p.result ? p.result.status : 'erreur'; c[st] = (c[st]||0)+1; if (p.result && p.result.invKey) (byInv[p.result.invKey] = byInv[p.result.invKey] || []).push(p); });
  var missing = ST.R.invoices.filter(function(I){ return !byInv[I.key]; }), dups = Object.keys(byInv).filter(function(k){ return byInv[k].length > 1; });
  var issues = [];
  P.forEach(function(p){
    var r = p.result || { status:'erreur', note:'Non analysé' };
    if (r.status === 'conforme') return;
    if (r.status !== 'ecart'){ issues.push(['PDF '+PST[r.status][1].toLowerCase(), p.name, '—', r.note || '', '', '', '', p.id]); return; }
    r.checks.filter(function(k){ return !k.ok; }).forEach(function(k){ issues.push(['Écart', p.name, r.invNum, k.label, k.pdf, k.calc, k.note, p.id]); });
  });
  dups.forEach(function(k){ var I = ST.R.invoices.filter(function(x){ return x.key===k; })[0]; issues.push(['Doublon', byInv[k].map(function(p){ return p.name; }).join(', '), I.num, 'Plusieurs PDF pour la même facture', '', '', '', null]); });
  if (P.length && missing.length) issues.push(['PDF manquant', '—', missing.length+' facture'+(missing.length>1?'s':''), 'Aucun PDF déposé', '', E.r2(missing.reduce(function(s, I){ return s + I.totals.HT; }, 0)), missing.map(function(I){ return I.num.slice(-2)+' '+I.sub; }).join(' · '), null]);
  var ok = P.length && !issues.length;
  var h = '<div class="ctlhead"><div class="verdict '+(P.length ? (ok ? 'v-ok' : 'v-ko') : 'v-none')+'"><span class="lbl">Résultat du contrôle</span><strong>'+(!P.length ? 'Aucune facture déposée' : ok ? 'Conforme : '+c.conforme+' facture'+(c.conforme>1?'s':'')+' sur '+ST.R.invoices.length : issues.length+' anomalie'+(issues.length>1?'s':'')+' à corriger')+'</strong></div>'+
    '<div class="kpis">'+kpi('PDF déposés', P.length, '')+kpi('Conformes', c.conforme, '')+kpi('En écart', c.ecart, '')+kpi('Non rapprochés / illisibles', c.non_rapprochee + c.illisible + c.erreur, '')+kpi('Factures sans PDF', missing.length, 'sur '+ST.R.invoices.length)+'</div></div>';
  h += closeBox();
  if (role() !== 'lecture' && !monthClosed()) h += '<label class="drop" id="pdrop"><input type="file" id="pin" multiple accept="application/pdf,.pdf"><strong>Déposer toutes les factures PDF du mois</strong><span class="muted">PDF générés par le logiciel de facturation (pas de scans). Comparaison : affaire, agence, période, n° d\'appareils, Entrées, Sorties, Stockage, total HT, TVA, TTC (tolérance 0,01 €).</span></label>';
  if (issues.length){
    h += '<div class="panel"><div class="ph"><h2>Anomalies identifiées</h2><div class="sp">'+(P.length && canEdit() ? '<button class="btn sm" data-a="pdfRerun">Relancer le contrôle</button>' : '')+'</div></div><div class="tw"><table><thead><tr><th>Type</th><th>Fichier</th><th>Facture</th><th>Contrôle</th><th class="n">PDF</th><th class="n">Calculé</th><th>Précision</th></tr></thead><tbody>'+
      issues.map(function(x){ var f = function(v){ return typeof v === 'number' ? n2(v) : esc(v === null || v === undefined || v === '' ? '' : v); }; return '<tr><td><span class="pill '+(x[0]==='PDF manquant'?'p-verifier':'p-bloquant')+'">'+esc(x[0])+'</span></td><td>'+esc(x[1])+'</td><td class="num">'+esc(x[2])+'</td><td>'+esc(x[3])+'</td><td class="n">'+f(x[4])+'</td><td class="n">'+f(x[5])+'</td><td class="muted">'+esc(x[6])+'</td></tr>'; }).join('')+'</tbody></table></div></div>';
  }
  if (P.length){
    h += '<details class="panel"><summary class="ph"><h3>Factures déposées ('+P.length+')</h3></summary><div class="tw"><table><thead><tr><th>Fichier</th><th>N° (PDF)</th><th>Facture calculée</th><th class="n">HT PDF</th><th class="n">HT calculé</th><th>Statut</th><th></th></tr></thead><tbody>';
    P.forEach(function(p){
      var r = p.result || { status:'erreur' }, I = r.invKey ? ST.R.invoices.filter(function(x){ return x.key===r.invKey; })[0] : null, open = ST.openPdf === p.id;
      h += '<tr class="click'+(open?' open':'')+'" data-pdf="'+esc(p.id)+'"><td>'+(open?'▾ ':'▸ ')+esc(p.name)+'</td><td class="num">'+esc(r.parsed ? r.parsed.numero||'—' : '—')+'</td><td class="num">'+esc(I ? I.num : '—')+'</td><td class="n">'+(r.parsed && r.parsed.totalHT!==null ? n2(r.parsed.totalHT) : '—')+'</td><td class="n">'+(I ? n2(I.totals.HT) : '—')+'</td><td><span class="pill '+PST[r.status][0]+'">'+PST[r.status][1]+'</span></td><td>'+(canEdit() ? '<button class="btn sm" data-pdfrm="'+esc(p.id)+'">Supprimer</button>' : '')+'</td></tr>';
      if (open) h += '<tr class="det"><td colspan="7"><div class="det-w">'+pdfDetail(p, r)+'</div></td></tr>';
    });
    h += '</tbody></table></div></details>';
  }
  return h;
}
function closeBox(){
  var st = ST.doc ? ST.doc.status : 'vide';
  if (st === 'clos') return '<div class="closebar"><span class="pill p-ok">Mois clôturé</span><span class="muted">le '+esc(ST.doc.closedAt ? new Date(ST.doc.closedAt).toLocaleDateString('fr-FR') : '')+' par '+esc(ST.doc.closedBy||'')+'</span>'+(isAdmin()?'<button class="btn" data-a="reopen">Rouvrir le mois</button>':'')+'</div>';
  if (role() === 'lecture') return '';
  var gen = ST.doc && ST.doc.gen, blk = ST.R.anomalies.filter(function(a){ return a.sev==='bloquant'; }).reduce(function(s,a){ return s+openCount(a); },0);
  var stop = !gen ? 'Générer d\'abord les factures' : gen.sig !== filesSig() ? 'Régénérer les factures (imports modifiés)' : blk ? 'Traiter les '+blk+' ligne(s) bloquante(s)' : '';
  var warn = [];
  var ne = ST.R.invoices.filter(function(I){ return (ST.ov.status[I.key]||'') !== 'editee'; }).length; if (ne) warn.push(ne+' facture(s) non éditée(s)');
  var pk = ST.pdfs.filter(function(p){ return p.result && p.result.status !== 'conforme'; }).length; if (pk) warn.push(pk+' PDF non conforme(s)');
  if (!ST.pdfs.length) warn.push('aucune facture PDF contrôlée');
  var h = '<div class="closebar">';
  if (stop) h += '<button class="btn" disabled>Clôturer le mois</button><span class="muted">'+esc(stop)+'</span>';
  else if (ST.confirmClose) h += '<span>'+(warn.length ? '<span class="pill p-verifier">Attention</span> '+esc(warn.join(' · '))+'. ' : '')+'Clôturer fige les montants, les décisions et la grille.</span><button class="btn pri" data-a="closeOk">Confirmer la clôture</button><button class="btn" data-a="closeNo">Annuler</button>';
  else h += '<button class="btn pri" data-a="close">Clôturer '+monthLabel(ST.month)+'</button>'+(warn.length ? '<span class="muted">'+esc(warn.join(' · '))+'</span>' : '<span class="muted">Contrôle conforme</span>');
  return h + '</div>';
}
function closeMonth(){
  var R = ST.R, id = monthId(); ST.confirmClose = false;
  STORE.saveMonth(id, { status:'clos', cfgSnapshot: ST.cfgM || ST.cfg, summary: summarize(R), ov:ST.ov })
    .then(function(){ return STORE.log('month_close', agLabel(ST.ag)+' · '+monthLabel(ST.month)+' · '+eur(R.totals.HT)+' HT', id); })
    .then(function(){ toast(monthLabel(ST.month)+' clôturé'); refreshIndex(); selectMonth(ST.ag, ST.month); }, function(e){ toast('Clôture impossible : '+e.message); });
}
function reopenMonth(){
  var id = monthId();
  STORE.saveMonth(id, { status:'ouvert', cfgSnapshot:null }).then(function(){ return STORE.log('month_reopen', agLabel(ST.ag)+' · '+monthLabel(ST.month), id); })
    .then(function(){ toast('Mois rouvert'); refreshIndex(); selectMonth(ST.ag, ST.month); }, function(e){ toast('Réouverture impossible : '+e.message); });
}
function pdfDetail(p, r){
  var h = '<p class="note">'+esc(r.note||'')+(p.at ? ' <span class="muted">· déposé le '+esc(new Date(p.at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}))+' par '+esc(p.by||'')+'</span>' : '')+'</p>';
  if (r.checks && r.checks.length){
    h += '<div class="tw"><table><thead><tr><th>Contrôle</th><th class="n">PDF</th><th class="n">Calculé</th><th>Résultat</th><th>Précision</th></tr></thead><tbody>';
    r.checks.forEach(function(c){ var f = function(v){ return typeof v === 'number' ? n2(v) : esc(v === null || v === undefined ? '—' : v); }; h += '<tr><td>'+esc(c.label)+'</td><td class="n">'+f(c.pdf)+'</td><td class="n">'+f(c.calc)+'</td><td><span class="pill '+(c.ok?'p-ok':'p-bloquant')+'">'+(c.ok?'OK':'Écart')+'</span></td><td class="muted">'+esc(c.note)+'</td></tr>'; });
    h += '</tbody></table></div>';
  }
  if (r.parsed && r.parsed.warnings && r.parsed.warnings.length) h += '<p class="note"><span class="pill p-verifier">Lecture</span> '+esc(r.parsed.warnings.join(' · '))+'</p>';
  if (r.lines && r.lines.length) h += '<details><summary class="lbl">Texte lu dans le PDF ('+r.lines.length+' lignes)</summary><pre class="pdftxt">'+esc(r.lines.join('\n'))+'</pre></details>';
  return h;
}
function bindPdfDrop(){
  var d = $('pdrop'), i = $('pin'); if (!d) return;
  i.onchange = function(){ addPdfs(i.files); i.value=''; };
  d.ondragover = function(e){ e.preventDefault(); d.classList.add('over'); };
  d.ondragleave = function(){ d.classList.remove('over'); };
  d.ondrop = function(e){ e.preventDefault(); d.classList.remove('over'); addPdfs(e.dataTransfer.files); };
}
function readBuf(file){ return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = rej; fr.readAsArrayBuffer(file); }); }
function analyseBuf(buf){
  return PDFCHECK.analyse(buf, pdfCtx()).then(function(r){ if (r.invKey){ var I = ST.R.invoices.filter(function(x){ return x.key===r.invKey; })[0]; r.calcHT = I.totals.HT; } return r; },
    function(e){ return { status:'erreur', note:'Lecture du PDF impossible : '+e.message, checks:[], lines:[] }; });
}
function addPdfs(list){
  var arr = Array.prototype.slice.call(list).filter(function(f){ return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
  if (!arr.length){ toast('Aucun PDF dans la sélection'); return; }
  var m = monthId(), n = 0, chain = Promise.resolve();
  ST.busy = 'Contrôle de '+arr.length+' PDF…'; render();
  arr.forEach(function(file){
    chain = chain.then(function(){
      return readBuf(file).then(function(buf){ return Promise.all([analyseBuf(buf.slice(0)), STORE.uploadPdf(m, file)]); })
        .then(function(x){ n++; ST.busy = 'Contrôle des PDF… '+n+' / '+arr.length; render(); return STORE.savePdfResult(m, x[1], x[0]); });
    });
  });
  chain.then(function(){ return STORE.listPdfs(m); }).then(function(P){ ST.busy=''; ST.pdfs = P; renderTop(); render(); toast(n+' PDF contrôlé(s)'); },
    function(e){ ST.busy=''; toast('Contrôle interrompu : '+e.message); STORE.listPdfs(m).then(function(P){ ST.pdfs = P; render(); }); });
}
function rerunPdfs(){
  var m = monthId(), P = ST.pdfs.slice(), chain = Promise.resolve(), n = 0;
  ST.busy = 'Nouveau contrôle de '+P.length+' PDF…'; render();
  P.forEach(function(p){ chain = chain.then(function(){ return STORE.getPdfBytes(p).then(analyseBuf).then(function(r){ n++; var meta = { id:p.id, name:p.name, path:p.path, size:p.size, at:p.at, by:p.by }; return STORE.savePdfResult(m, meta, r); }); }); });
  chain.then(function(){ return STORE.listPdfs(m); }).then(function(L){ ST.busy=''; ST.pdfs = L; renderTop(); render(); toast(n+' PDF recontrôlé(s)'); }, function(e){ ST.busy=''; toast('Échec : '+e.message); render(); });
}
function removePdf(id){
  var p = ST.pdfs.filter(function(x){ return x.id===id; })[0]; if (!p) return;
  STORE.deletePdf(monthId(), p).then(function(){ return STORE.listPdfs(monthId()); }).then(function(L){ ST.pdfs = L; renderTop(); render(); toast('PDF supprimé'); }, function(e){ toast('Suppression impossible : '+e.message); });
}
function summarize(R){
  var out = { HT:R.totals.HT, at:new Date().toISOString(), byAg:{} };
  R.invoices.forEach(function(I){
    var a = out.byAg[I.ag] = out.byAg[I.ag] || { label:I.agLabel, inv:0, HT:0, E:{n:0,up:0,eur:0}, S:{n:0,up:0,eur:0}, STK:{n:0,m2:0,eur:0,minM2:0,minEur:0} };
    a.inv++; a.HT = E.r2(a.HT + I.totals.HT);
    I.lineList.forEach(function(l){
      if (l.fam==='E' || l.fam==='S'){ a[l.fam].n += l.n; a[l.fam].up = Math.round((a[l.fam].up + l.qty)*1000)/1000; a[l.fam].eur = E.r2(a[l.fam].eur + l.amount); }
      else if (l.fam==='STK'){ a.STK.n += l.n; a.STK.m2 = Math.round((a.STK.m2 + l.qty)*1000)/1000; a.STK.eur = E.r2(a.STK.eur + l.amount); }
      else { a.STK.minM2 = Math.round((a.STK.minM2 + l.qty)*1000)/1000; a.STK.minEur = E.r2(a.STK.minEur + l.amount); a.STK.m2 = Math.round((a.STK.m2 + l.qty)*1000)/1000; a.STK.eur = E.r2(a.STK.eur + l.amount); }
    });
  });
  return out;
}

/* ============ SYNTHÈSE ============ */
function synthRows(){
  var byM = {};
  ST.monthsIndex.forEach(function(d){ if (!d.summary || !d.month) return; var m = byM[d.month] = byM[d.month] || { id:d.month, status:'clos', s:{ HT:0, byAg:{} } }; Object.keys(d.summary.byAg||{}).forEach(function(k){ m.s.byAg[k] = d.summary.byAg[k]; }); if (d.status !== 'clos') m.status = 'ouvert'; });
  if (ST.R && ST.month){ var cur = summarize(ST.R), m = byM[ST.month] = byM[ST.month] || { id:ST.month, status:'ouvert', s:{ HT:0, byAg:{} } }; Object.keys(m.s.byAg).forEach(function(k){ if (k === ST.ag) delete m.s.byAg[k]; }); Object.keys(cur.byAg).forEach(function(k){ m.s.byAg[k] = cur.byAg[k]; }); if (!monthClosed()) m.status = 'ouvert'; }
  Object.keys(byM).forEach(function(k){ var s = byM[k].s; s.HT = Object.keys(s.byAg).reduce(function(t, a){ return E.r2(t + s.byAg[a].HT); }, 0); });
  return last18().slice().reverse().map(function(k){ return byM[k] || { id:k, status:'vide', s:null }; });
}
function pick(s, ag){
  var z = { inv:0, HT:0, E:{n:0,up:0,eur:0}, S:{n:0,up:0,eur:0}, STK:{n:0,m2:0,eur:0,minM2:0,minEur:0} };
  if (!s) return null;
  Object.keys(s.byAg).forEach(function(k){ if (ag !== 'all' && k !== ag) return; var a = s.byAg[k];
    z.inv += a.inv; z.HT = E.r2(z.HT + a.HT);
    ['E','S'].forEach(function(f){ z[f].n += a[f].n; z[f].up += a[f].up; z[f].eur = E.r2(z[f].eur + a[f].eur); });
    z.STK.n += a.STK.n; z.STK.m2 += a.STK.m2; z.STK.eur = E.r2(z.STK.eur + a.STK.eur); z.STK.minM2 += a.STK.minM2; z.STK.minEur = E.r2(z.STK.minEur + a.STK.minEur); });
  return z;
}
function vSynth(){
  var rows = synthRows(), ags = {};
  rows.forEach(function(r){ if (r.s) Object.keys(r.s.byAg).forEach(function(k){ ags[k] = r.s.byAg[k].label; }); });
  var ag = ST.synAg, data = rows.map(function(r){ return { id:r.id, status:r.status, v:pick(r.s, ag) }; });
  var h = '<section class="view"><nav class="subnav" role="tablist">'+[['all','Toutes agences']].concat(Object.keys(ags).sort().map(function(k){ return [k, ags[k]]; })).map(function(p){ return '<button class="subtab" role="tab" data-synag="'+esc(p[0])+'" aria-selected="'+(ag===p[0])+'"><span class="st-l">'+esc(p[1])+'</span></button>'; }).join('')+'</nav>';
  var filled = data.filter(function(d){ return d.v; });
  if (!filled.length) return h + '<div class="panel empty">Aucun mois facturé sur les 18 derniers mois.</div></section>';
  var last = filled[filled.length-1];
  h += '<div class="kpis">'+kpi('Dernier mois', monthLabel(last.id), STATUS[last.status])+kpi('Total HT', eur(last.v.HT), last.v.inv+' factures')+kpi('Entrées', n3(last.v.E.up)+' m³/t', last.v.E.n+' colis · '+eur(last.v.E.eur))+kpi('Sorties', n3(last.v.S.up)+' m³/t', last.v.S.n+' colis · '+eur(last.v.S.eur))+kpi('Stockage facturé', n2(last.v.STK.m2)+' m²', eur(last.v.STK.eur))+'</div>';
  h += '<div class="charts">'+
    chart('Entrées', 'm³/t facturés', data, function(v){ return v.E.up; }, function(v){ return n3(v.E.up)+' m³/t · '+v.E.n+' colis · '+eur(v.E.eur); })+
    chart('Sorties', 'm³/t facturés', data, function(v){ return v.S.up; }, function(v){ return n3(v.S.up)+' m³/t · '+v.S.n+' colis · '+eur(v.S.eur); })+
    chart('Stockage', 'm² facturés', data, function(v){ return v.STK.m2; }, function(v){ return n2(v.STK.m2)+' m² (dont min. 30 m² : '+n2(v.STK.minM2)+') · '+eur(v.STK.eur); })+
    chart('Chiffre d\'affaires', '€ HT', data, function(v){ return v.HT; }, function(v){ return eur(v.HT)+' · '+v.inv+' factures'; })+'</div>';
  h += '<div class="panel"><div class="ph"><h2>Détail mensuel</h2><span class="muted">'+(ag==='all'?'Toutes agences':esc(ags[ag]))+' · 18 derniers mois · un mois en cours est recalculé à chaque modification</span><div class="sp"><button class="btn" data-a="xlsSyn"'+(canSave()?'':' disabled')+'>Exporter (.xlsx)</button></div></div><div class="tw"><table class="syn"><thead><tr><th rowspan="2">Mois</th><th rowspan="2">Statut</th><th colspan="3" class="grp">Entrées</th><th colspan="3" class="grp">Sorties</th><th colspan="3" class="grp">Stockage</th><th rowspan="2" class="n">Total HT</th><th rowspan="2" class="n">Var. M-1</th></tr><tr><th class="n">Colis</th><th class="n">m³/t</th><th class="n">€ HT</th><th class="n">Colis</th><th class="n">m³/t</th><th class="n">€ HT</th><th class="n">m² facturés</th><th class="n">dont min. 30</th><th class="n">€ HT</th></tr></thead><tbody>';
  data.slice().reverse().forEach(function(d, i, arr){
    var v = d.v, prev = arr[i+1] && arr[i+1].v;
    if (!v){ h += '<tr class="zero"><td>'+monthLabel(d.id)+'</td><td class="muted">vide</td><td colspan="11"></td></tr>'; return; }
    var dv = prev && prev.HT ? (v.HT - prev.HT) / prev.HT * 100 : null;
    h += '<tr><td>'+monthLabel(d.id)+'</td><td><span class="pill '+(d.status==='clos'?'p-ok':'p-verifier')+'">'+STATUS[d.status]+'</span></td><td class="n">'+v.E.n+'</td><td class="n">'+n3(v.E.up)+'</td><td class="n">'+n2(v.E.eur)+'</td><td class="n">'+v.S.n+'</td><td class="n">'+n3(v.S.up)+'</td><td class="n">'+n2(v.S.eur)+'</td><td class="n">'+n2(v.STK.m2)+'</td><td class="n">'+n2(v.STK.minM2)+'</td><td class="n">'+n2(v.STK.eur)+'</td><td class="n"><strong>'+n2(v.HT)+'</strong></td><td class="n">'+(dv===null?'—':(dv>0?'+':'')+dv.toFixed(1).replace('.',',')+' %')+'</td></tr>';
  });
  return h + '</tbody></table></div></div></section>';
}
/* petit histogramme SVG (une série, une unité) */
function chart(title, unit, data, get, tip){
  var W = 360, H = 170, L = 44, R = 8, T = 10, B = 26, n = data.length, vals = data.map(function(d){ return d.v ? get(d.v) : null; });
  var max = Math.max.apply(null, vals.filter(function(v){ return v !== null; }).concat([0])), step = niceStep(max / 4), top = Math.max(step * 4, step);
  var bw = (W - L - R) / n, bar = Math.max(4, Math.min(18, bw - 4));
  var s = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(title+' par mois, '+unit)+'">';
  for (var g = 0; g <= 4; g++){ var y = T + (H - T - B) * (1 - g/4), v = step * g; s += '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" class="grid"/><text x="'+(L-6)+'" y="'+(y+3.5)+'" class="ax" text-anchor="end">'+fmtAx(v)+'</text>'; }
  data.forEach(function(d, i){
    var cx = L + bw * i + bw / 2, v = vals[i];
    if (i % 3 === (n - 1) % 3) s += '<text x="'+cx+'" y="'+(H-8)+'" class="ax" text-anchor="middle">'+MCOURT[+d.id.slice(5)-1]+' '+d.id.slice(2,4)+'</text>';
    if (v === null || v === 0) return;
    var hgt = (H - T - B) * v / top, y0 = H - B;
    s += '<path class="bar'+(i===n-1?' cur':'')+'" d="'+barPath(cx - bar/2, y0 - hgt, bar, hgt)+'" data-tip="'+esc(monthLabel(d.id)+' · '+tip(d.v))+'"/>';
  });
  return '<figure class="chart"><figcaption><span class="t">'+esc(title)+'</span> <span class="muted">'+esc(unit)+'</span></figcaption>'+s+'</svg></figure>';
}
var MCOURT = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
function barPath(x, y, w, h){ var r = Math.min(3, w/2, h); return 'M'+x+','+(y+h)+'V'+(y+r)+'Q'+x+','+y+' '+(x+r)+','+y+'H'+(x+w-r)+'Q'+(x+w)+','+y+' '+(x+w)+','+(y+r)+'V'+(y+h)+'Z'; }
function niceStep(x){ if (x <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function fmtAx(v){ return v >= 10000 ? (v/1000).toLocaleString('fr-FR',{maximumFractionDigits:1})+' k' : v.toLocaleString('fr-FR',{maximumFractionDigits:1}); }
function bindChartTips(){
  var tipEl = $('ctip');
  Array.prototype.forEach.call(document.querySelectorAll('.chart .bar'), function(b){
    b.addEventListener('mousemove', function(e){ tipEl.textContent = b.getAttribute('data-tip'); tipEl.hidden = false; tipEl.style.left = Math.min(e.clientX + 12, window.innerWidth - tipEl.offsetWidth - 8)+'px'; tipEl.style.top = (e.clientY - 34)+'px'; });
    b.addEventListener('mouseleave', function(){ tipEl.hidden = true; });
  });
}
function exportSynth(){
  var rows = synthRows(), out = [];
  rows.forEach(function(r){ if (!r.s) return; Object.keys(r.s.byAg).sort().forEach(function(k){ var a = r.s.byAg[k];
    out.push({ 'Mois':r.id, 'Statut':STATUS[r.status], 'Agence':a.label, 'Factures':a.inv, 'Entrées colis':a.E.n, 'Entrées m³/t':a.E.up, 'Entrées € HT':a.E.eur, 'Sorties colis':a.S.n, 'Sorties m³/t':a.S.up, 'Sorties € HT':a.S.eur, 'Stockage m² facturés':a.STK.m2, 'dont minimum 30 m²':a.STK.minM2, 'Stockage € HT':a.STK.eur, 'Total HT':a.HT }); }); });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), 'Synthèse'); saveXlsx(wb, 'Synthèse facturation OTIS.xlsx');
}

/* ============ TRANSPORT ============ */
var VEH = [
  { id:'break', label:'Break 500 kg', pal:1, kg:500, len:null, dims:'—', hayon:false, grue:false, p:{A:[156,277],B:[175,296],C:[194,315]}, h:41, km:0.63 },
  { id:'f1300', label:'Fourgon 1300 kg', pal:4, kg:1300, len:null, dims:'—', hayon:false, grue:false, p:{A:[192,301],B:[217,326],C:[242,351]}, h:47, km:0.83 },
  { id:'f700', label:'Fourgon 700 kg hayon', pal:7, kg:700, len:3900, dims:'3,9 × 2,1 × 2,1', hayon:true, grue:false, p:{A:[224,374],B:[252,402],C:[280,430]}, h:56, km:0.92 },
  { id:'f2t', label:'Fourgon 2T hayon / débâchable', pal:12, kg:2000, len:5200, dims:'5,2 × 2,45 × 2,25', hayon:true, grue:false, p:{A:[263,429],B:[298,464],C:[333,499]}, h:65, km:1.17 },
  { id:'f5t', label:'Fourgon / débâchable 5T hayon', pal:15, kg:5000, len:7000, dims:'7,0 × 2,45 × 2,35', hayon:true, grue:false, p:{A:[282,443],B:[320,481],C:[358,519]}, h:75, km:1.28 },
  { id:'grue', label:'Porteur 10T bras de grue', pal:null, kg:10000, len:7800, dims:'7,8 × 2,4 × 2,4', hayon:false, grue:true, p:{A:[425,637],B:[468,680],C:[511,722]}, h:96, km:1.43 }
];
var KMI = { A:[70,150], B:[100,180], C:[130,210] }, MANUT = [152,272];
function zoneOf(cp, half78){
  var d = String(cp||'').trim().slice(0,2); if (!/^\d{2}$/.test(d)) return null;
  if (['75','92','93','95'].indexOf(d)>=0) return 'A';
  if (['91','77','94'].indexOf(d)>=0) return 'B';
  if (d === '78') return half78 || null;
  return 'C';
}
function vTransport(){
  var ags = agencies(), a0 = ags[0] ? ags[0].code : '';
  var h = '<section class="view"><div class="two"><div class="panel"><div class="ph"><h2>Nouvelle livraison chantier</h2><span class="muted">Grille transport OTIS 2023 (01/07/2023)</span></div><form class="pb" id="tform" style="display:grid;gap:14px" autocomplete="off">';
  h += '<div class="grid-f"><div class="fld"><label class="lbl" for="t_ag">Agence OTIS</label><select id="t_ag">'+ags.map(function(a){ return '<option value="'+esc(a.code)+'">'+esc(a.label||'AG '+a.code)+'</option>'; }).join('')+'</select></div>'+
    '<div class="fld"><label class="lbl" for="t_cm">Contremaître</label><input id="t_cm" list="t_cml"><datalist id="t_cml">'+((ST.cfg.agencies[a0]||{}).cmList||[]).map(function(c){ return '<option value="'+esc(c.nom)+'">'; }).join('')+'</datalist></div>'+
    fld('Appareil / affaire','t_cmd','text','')+fld('Date de livraison','t_date','date', new Date().toISOString().slice(0,10))+'</div>';
  h += '<div class="grid-f">'+fld('Code postal du chantier','t_cp','text','92400')+fld('Commune','t_ville','text','Courbevoie')+
    '<div class="fld" id="w78" hidden><span class="lbl">Yvelines (78) : zone</span><select id="t_78"><option value="">Choisir</option><option value="A">Zone A (moitié Est)</option><option value="B">Zone B (moitié Ouest)</option></select></div></div>';
  h += '<div class="grid-f">'+fld('Palettes Europe','t_pal','number','3')+fld('Poids total (kg)','t_kg','number','850')+fld('Plus grande longueur (mm)','t_len','number','2500')+'</div>';
  h += '<div class="grid-f">'+fld('Durée estimée (h)','t_h','number','3.5')+fld('Km estimés (aller-retour)','t_km','number','60')+'</div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:10px 22px"><label class="chk"><input type="checkbox" id="t_hayon" checked>Livraison sans quai (hayon requis)</label><label class="chk"><input type="checkbox" id="t_grue">Levage par grue</label><label class="chk"><input type="checkbox" id="t_man">Manutentionnaire en plus</label></div>';
  h += fld('Observations','t_obs','text','')+'</form></div><div style="display:grid;gap:16px"><div id="treco"></div></div></div></section>';
  return h;
}
function fld(l,id,type,v){ return '<div class="fld"><label class="lbl" for="'+id+'">'+l+'</label><input id="'+id+'" type="'+type+'" value="'+esc(v)+'"'+(type==='number'?' step="any" min="0"':'')+'></div>'; }
function tv(id){ var e=$(id); return e ? (e.type==='checkbox' ? e.checked : e.value) : null; }
function quote(v, zone, hrs, km, man){
  var half = hrs <= 4 || (hrs <= 6), base = half ? v.p[zone][0] : v.p[zone][1];
  var xh = half ? Math.max(0, hrs-4) : Math.max(0, hrs-7), kmi = KMI[zone][half?0:1], xk = Math.max(0, km-kmi);
  var m = man ? MANUT[half?0:1] : 0;
  var tot = E.r2(base + xh*v.h + xk*v.km + m);
  var det = (half?'½ journée':'Journée')+' '+base+' + '+nx(xh)+' h × '+v.h+' + '+nx(xk)+' km × '+String(v.km).replace('.',',')+(m?' + manut. '+m:'')+' = '+n2(tot);
  return { half:half, base:base, xh:xh, xk:xk, kmi:kmi, man:m, total:tot, detail:det };
}
var LAST_Q = null;
function calcTransport(){
  var box = $('treco'); if (!box) return;
  var cp = tv('t_cp'); $('w78').hidden = String(cp).slice(0,2) !== '78';
  var zone = zoneOf(cp, tv('t_78')), pal = +tv('t_pal')||0, kg = +tv('t_kg')||0, len = +tv('t_len')||0, hrs = +tv('t_h')||0, km = +tv('t_km')||0;
  var hay = tv('t_hayon'), grue = tv('t_grue'), man = tv('t_man');
  if (!zone){ box.innerHTML = '<div class="panel pb note">'+(String(cp).slice(0,2)==='78'?'Yvelines : choisir la zone A ou B (la grille partage le 78 en deux moitiés).':'Saisir un code postal valide pour déterminer la zone.')+'</div>'; LAST_Q=null; return; }
  var rows = VEH.map(function(v){
    var why = [];
    if (grue && !v.grue) why.push('pas de grue');
    if (!grue && v.grue && false) why.push('');
    if (v.pal !== null && pal > v.pal) why.push(pal+' pal. > '+v.pal);
    if (kg > v.kg) why.push(kg+' kg > '+v.kg);
    if (v.len === null ? len > 1200 : len > v.len) why.push(v.len===null ? 'dimensions non garanties > 1 200 mm' : 'longueur > '+v.len+' mm');
    if (hay && !v.hayon && !v.grue) why.push('pas de hayon');
    var q = quote(v, zone, hrs, km, man);
    return { v:v, ok:!why.length, why:why, q:q };
  });
  var ok = rows.filter(function(r){ return r.ok; }).sort(function(a,b){ return a.q.total-b.q.total; });
  var best = ok[0];
  var h = '<div class="panel"><div class="ph"><h2>Recommandation</h2><span class="pill p-info">Zone '+zone+'</span></div><div class="pb" style="display:grid;gap:12px">';
  if (!best){ h += '<p class="note"><span class="pill p-bloquant">Hors grille</span> Aucun véhicule de la grille ne convient : transport sur devis.</p>'; LAST_Q=null; }
  else {
    LAST_Q = { zone:zone, veh:best.v.label, detail:best.q.detail, total:best.q.total };
    h += '<div class="reco"><span class="lbl">Véhicule recommandé</span><strong style="font-size:17px">'+esc(best.v.label)+'</strong><span class="muted">'+(best.v.dims!=='—'?'Caisse '+best.v.dims+' m · ':'')+(best.v.pal?best.v.pal+' pal. max · ':'')+best.v.kg+' kg max'+(best.v.hayon?' · transpalette comprise':'')+'</span><span class="price">'+eur(best.q.total)+' HT</span><span class="formula">'+esc(best.q.detail)+'</span><span class="muted" style="font-size:12.5px">'+(best.q.half?'½ journée : 4 h et '+best.q.kmi+' km inclus ; dépassement facturé à l\'heure jusqu\'à 2 h.':'Journée : 7 h et '+best.q.kmi+' km inclus.')+'</span><div><button class="btn pri" data-a="addTr"'+(role()==='lecture'?' disabled':'')+'>Valider le transport</button></div></div>';
  }
  h += '<div class="tw"><table><thead><tr><th>Véhicule</th><th>Compatibilité</th><th class="n">Montant HT</th></tr></thead><tbody>';
  rows.forEach(function(r){ h += '<tr'+(best&&r.v===best.v?' class="open"':'')+'><td>'+esc(r.v.label)+'</td><td>'+(r.ok?'<span class="pill p-ok">OK</span>':'<span class="muted">'+esc(r.why.join(' · '))+'</span>')+'</td><td class="n">'+n2(r.q.total)+'</td></tr>'; });
  h += '</tbody></table></div><p class="muted" style="font-size:12.5px;margin:0">Au-delà de 6 h, bascule en journée (dépassement ½ journée limité à 2 h). Véhicules sans dimensions dans la grille (Break, Fourgon 1300) : retenus seulement si la plus grande longueur ≤ 1 200 mm. Annotations manuscrites de la grille (semi, 26T…) non intégrées.</p></div></div>';
  box.innerHTML = h;
}
function validateTransport(){
  if (role() === 'lecture' || !LAST_Q) return;
  var t = { date:tv('t_date'), ag:tv('t_ag'), agLabel:agLabel(tv('t_ag')), cm:tv('t_cm'), cmd:tv('t_cmd'), cp:tv('t_cp'), ville:tv('t_ville'), pal:+tv('t_pal')||0, kg:+tv('t_kg')||0, len:+tv('t_len')||0, h:+tv('t_h')||0, km:+tv('t_km')||0, obs:tv('t_obs'), zone:LAST_Q.zone, veh:LAST_Q.veh, detail:LAST_Q.detail, total:LAST_Q.total, status:'valide' };
  if (!t.date){ toast('Renseigner la date de livraison'); return; }
  STORE.addTransport(t).then(function(){ toast('Transport validé : '+eur(t.total)+' HT'); ST.transports = null; loadTransports(); }, function(e){ toast('Validation impossible : '+e.message); });
}
function loadTransports(){ return STORE.listTransports().then(function(L){ ST.transports = L; if (ST.module !== 'log') render(); }, function(e){ toast('Historique inaccessible : '+e.message); }); }
var TRST = { valide:'Validé', facture:'Facturé', annule:'Annulé' };
function vTrHistory(){
  if (!ST.transports){ loadTransports(); return '<section class="view"><div class="panel empty">Chargement…</div></section>'; }
  var L = ST.transports, months = uniqA(L.map(function(t){ return (t.date||'').slice(0,7); }).filter(Boolean)).sort().reverse();
  var F = L.filter(function(t){ return (!ST.trF.month || (t.date||'').slice(0,7) === ST.trF.month) && (!ST.trF.ag || t.ag === ST.trF.ag); });
  var tot = F.filter(function(t){ return t.status !== 'annule'; }).reduce(function(s, t){ return E.r2(s + t.total); }, 0);
  var h = '<section class="view"><div class="kpis">'+kpi('Transports', F.filter(function(t){ return t.status !== 'annule'; }).length, 'hors annulés')+kpi('Montant HT', eur(tot), '')+kpi('À facturer', F.filter(function(t){ return t.status === 'valide'; }).length, 'validés, non facturés')+kpi('Facturés', F.filter(function(t){ return t.status === 'facture'; }).length, '')+'</div>';
  h += '<div class="panel"><div class="ph"><h2>Transports validés</h2><span class="muted">Cas 1 : un devis par livraison, facturé après validation OTIS</span><div class="sp"><select id="trf_m"><option value="">Tous les mois</option>'+months.map(function(m){ return '<option value="'+m+'"'+(ST.trF.month===m?' selected':'')+'>'+monthLabel(m)+'</option>'; }).join('')+'</select><select id="trf_a"><option value="">Toutes les agences</option>'+agencies(true).map(function(a){ return '<option value="'+esc(a.code)+'"'+(ST.trF.ag===a.code?' selected':'')+'>'+esc(a.label)+'</option>'; }).join('')+'</select><button class="btn" data-a="xlsTr"'+(F.length&&canSave()?'':' disabled')+'>Exporter (.xlsx)</button></div></div>';
  if (!F.length) h += '<div class="empty">Aucun transport validé'+(ST.trF.month||ST.trF.ag?' pour ce filtre':'')+'.</div>';
  else {
    h += '<div class="tw"><table><thead><tr><th>Date</th><th>Agence</th><th>Contremaître</th><th>Appareil</th><th>Chantier</th><th>Zone</th><th>Véhicule</th><th>Calcul</th><th class="n">Montant HT</th><th>Statut</th><th>Validé par</th><th></th></tr></thead><tbody>'+
      F.map(function(t){ return '<tr'+(t.status==='annule'?' class="excl"':'')+'><td class="num">'+esc(E.frDate(t.date))+'</td><td>'+esc(t.agLabel||t.ag)+'</td><td>'+esc(t.cm)+'</td><td class="num">'+esc(t.cmd)+'</td><td>'+esc(t.cp+' '+t.ville)+'</td><td>'+esc(t.zone)+'</td><td>'+esc(t.veh)+'</td><td class="formula">'+esc(t.detail)+'</td><td class="n">'+n2(t.total)+'</td><td><select data-trs="'+esc(t.id)+'"'+(role()==='lecture'?' disabled':'')+'>'+Object.keys(TRST).map(function(k){ return '<option value="'+k+'"'+(t.status===k?' selected':'')+'>'+TRST[k]+'</option>'; }).join('')+'</select></td><td class="muted">'+esc(t.createdBy||'')+'<br>'+dt(t.createdAt)+'</td><td>'+(isAdmin()?'<button class="btn sm" data-trdel="'+esc(t.id)+'">Supprimer</button>':'')+'</td></tr>'; }).join('')+
      '<tr class="tot"><td colspan="8">Total (hors annulés)</td><td class="n">'+n2(tot)+'</td><td colspan="3"></td></tr></tbody></table></div>';
  }
  return h + '</div></section>';
}
function exportTr(){
  var F = (ST.transports||[]).filter(function(t){ return (!ST.trF.month || (t.date||'').slice(0,7) === ST.trF.month) && (!ST.trF.ag || t.ag === ST.trF.ag); });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(F.map(function(t){ return { 'Date':E.frDate(t.date), 'Agence':t.agLabel||t.ag, 'Contremaître':t.cm, 'Appareil':t.cmd, 'Code postal':t.cp, 'Commune':t.ville, 'Zone':t.zone, 'Véhicule':t.veh, 'Palettes':t.pal, 'Poids kg':t.kg, 'Calcul':t.detail, 'Montant HT':t.total, 'Statut':TRST[t.status]||t.status, 'Validé par':t.createdBy, 'Le':t.createdAt, 'Observations':t.obs||'' }; })), 'Transports');
  saveXlsx(wb, 'Transports OTIS'+(ST.trF.month?' '+ST.trF.month:'')+'.xlsx');
}

/* ============ EXPORTS ============ */
function recRow(r, I){
  var fl = (ST.flags[r.key]||[]).map(function(a){ return a.title; }).join(' | ');
  return {
    'Facture': I ? I.num : '', 'Fichier': r.file, 'Ligne Excel': r.line, 'Agence': r.eff ? r.eff.agLabel : 'Non rattaché', 'Contremaître': r.eff ? r.eff.cm : '', 'Code CM': r.eff ? r.eff.cmCode : r.cmCode,
    'N° BR': r.br, 'N° commande Odoo': r.cmdRaw, 'Affaire': r.affaire || '', 'Source affaire': r.affSrc || '', 'Appareil': r.apLabel || '', 'N° colis': r.colis, 'Produit': r.produit,
    'Famille': r.kind==='manut' ? (r.op==='E'?'Entrée':'Sortie') : 'Stockage', 'Date mouvement': r.date ? E.frDate(r.date) : '',
    'Début période': r.pStart ? E.frDate(r.pStart) : '', 'Fin période': r.pEnd ? E.frDate(r.pEnd) : '', 'Jours retenus': r.kind==='stock' ? r.days : '', 'Source jours': r.daysSrc || '', 'Jours Odoo': isNaN(r.odooJours) ? '' : r.odooJours,
    'Longueur mm': r.L, 'Largeur mm': r.l, 'Hauteur mm': r.h, 'Poids kg': r.kg, 'Volume m3': r.vol, 'Surface m2': r.surf,
    'Unité payante': r.kind==='manut' ? r.up : '', 'Coefficient': r.kind==='stock' ? r.coef : '', 'Surface facturée m2': r.kind==='stock' ? r.surfFact : '', 'Tranche': r.kind==='stock' ? E.TIER_LABEL[r.tier] : (r.applied||''),
    'Prix unitaire': r.kind==='stock' ? r.pu : r.rate, 'Calcul': r.formula, 'Montant HT': r.billable ? r.amount : 0, 'Facturé': r.billable ? 'Oui' : 'Non', 'Exclusion ADV': ST.ov.exclude[r.key] || '', 'Prix Odoo': isNaN(r.odooPrix) ? '' : r.odooPrix, 'Contrôles': fl
  };
}
function detailRows(I){
  var out = [];
  I.lineList.forEach(function(l){ l.keys.forEach(function(k){ var r = ST.R.byKey[k]; if (r.kind==='min30') out.push({ 'Facture':I.num, 'Famille':'Complément 30 m²', 'N° commande':r.cmd, 'Surface facturée m2':r.surf, 'Calcul':r.formula, 'Montant HT':r.amount }); else out.push(recRow(r, I)); }); });
  return out;
}
function canSave(){ return STORE.mode !== 'demo' || !!dl; }
function saveBlob(name, blob, kind){
  STORE.log('export', name, ST.ag && ST.month ? monthId() : null);
  if (dl){ dl.save({ filename:name, data:blob }).then(function(){ toast('Fichier enregistré'); }, function(e){ if (e && e.code !== 'declined') toast('Export impossible : '+(e.message||e.code)); }); return; }
  if (STORE.mode === 'demo'){ toast('Téléchargement indisponible dans cette vue.'); return; }
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function saveXlsx(wb, name){ var buf = XLSX.write(wb, { bookType:'xlsx', type:'array' }); saveBlob(name, new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'xlsx'); }
function exportAg(){
  var R = ST.R, wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(R.invoices.map(function(I){ return { 'Facture':I.num, 'Agence':I.agLabel, 'Affaire / périmètre':I.sub, 'Contremaître(s)':Object.keys(I.cms).join(', '), 'Appareils':Object.keys(I.appareils).sort().join(' · '), 'Entrées':I.totals.E, 'Sorties':I.totals.S, 'Stockage':E.r2(I.totals.STK+I.totals.MIN), 'dont minimum 30 m²':I.totals.MIN, 'Total HT':I.totals.HT, 'Statut':INVST[ST.ov.status[I.key]||'verifier'], 'Manutention Odoo':I.odoo.M }; })), 'Factures');
  var det = []; R.invoices.forEach(function(I){ det = det.concat(detailRows(I)); });
  var seen = {}; det.forEach(function(d){ seen[d['Fichier']+'#'+d['Ligne Excel']] = 1; });
  R.records.forEach(function(r){ if (!seen[r.key]) det.push(recRow(r, null)); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(det), 'Détail toutes lignes');
  var an = []; R.anomalies.forEach(function(a){ a.keys.forEach(function(k){ var r = R.byKey[k]; an.push({ 'Gravité':SEV[a.sev], 'Contrôle':a.title, 'Fichier':r?r.file:'', 'Ligne Excel':r?r.line:'', 'N° colis':r?r.colis:'', 'N° BR':r?r.br:'', 'Contremaître':r&&r.eff?r.eff.cm:'' }); }); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(an), 'Anomalies');
  saveXlsx(wb, 'Facturation '+agLabel(ST.ag)+' '+ST.month+'.xlsx');
}

/* ============ ADMINISTRATION · COMPTE ============ */
var LOGT = { login:'Connexion', login_failed:'Échec de connexion', logout:'Déconnexion', import:'Import Odoo', import_delete:'Suppression import', modification:'Modification facture', month_close:'Clôture du mois', month_reopen:'Réouverture du mois', export:'Export Excel', pdf_control:'Contrôle PDF', pdf_delete:'Suppression PDF', config:'Grilles / règles', user_create:'Création utilisateur', user_update:'Modification utilisateur', password_set:'Mot de passe défini', password_self:'Mot de passe changé', purge:'Purge > 18 mois', generation:'Génération des factures', transport:'Transport' };
function loadAdmin(){
  if (!isAdmin()) return;
  if (ST.admTab === 'users' && !ST.users) STORE.listUsers().then(function(u){ ST.users = u.sort(function(a,b){ return (a.name||a.email).localeCompare(b.name||b.email); }); render(); }, function(e){ toast('Utilisateurs inaccessibles : '+e.message); });
  if (ST.admTab === 'logs' && !ST.logs) STORE.listLogs(500).then(function(l){ ST.logs = l; render(); }, function(e){ toast('Journal inaccessible : '+e.message); });
}
function adminAct(p, msg){ p.then(function(){ toast(msg); ST.users = null; loadAdmin(); }, function(e){ toast('Échec : '+(e.message||e)); }); }
function genPassword(){ var c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_!?', a = new Uint32Array(16), o = ''; crypto.getRandomValues(a); for (var i=0;i<16;i++) o += c[a[i] % c.length]; return o; }
function createUserFromForm(){
  var u = { name:$('nu_name').value.trim(), email:$('nu_email').value.trim().toLowerCase(), role:$('nu_role').value };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)){ toast('E-mail invalide'); return; }
  adminAct(STORE.createUser(u), 'Invitation enregistrée : créer maintenant le compte '+u.email+' dans la console Firebase');
}
function vAdmin(){
  if (!isAdmin()) return '<section class="view"><div class="panel empty">Réservé aux administrateurs.</div></section>';
  var h = '<section class="view"><nav class="subnav" role="tablist">'+[['users','Utilisateurs'],['logs','Journal de connexion et d\'activité'],['data','Données et conservation']].map(function(p){ return '<button class="subtab" role="tab" data-adm="'+p[0]+'" aria-selected="'+(ST.admTab===p[0])+'"><span class="st-l">'+p[1]+'</span></button>'; }).join('')+'</nav>';
  if (ST.admTab === 'users'){
    h += '<div class="panel"><div class="ph"><h2>Créer un compte</h2><span class="muted">1. Déclarer ici l\'e-mail et le rôle. 2. Console Firebase → Authentication → Ajouter un utilisateur, même e-mail, mot de passe de 12 caractères min. (bouton Générer). 3. Communiquer le mot de passe par un autre canal que l\'e-mail. À sa première connexion, le compte prend le rôle déclaré.</span></div><form class="pb" id="uform" autocomplete="off"><div class="grid-f">'+
      '<div class="fld"><label class="lbl" for="nu_name">Nom</label><input id="nu_name" type="text"></div>'+
      '<div class="fld"><label class="lbl" for="nu_email">E-mail</label><input id="nu_email" type="email"></div>'+
      '<div class="fld"><label class="lbl" for="nu_role">Rôle</label><select id="nu_role"><option value="adv">ADV : import, contrôles, factures</option><option value="lecture">Lecture seule</option><option value="admin">Administrateur</option></select></div>'+
      '<div class="fld"><label class="lbl" for="nu_pw">Mot de passe à saisir dans la console (non enregistré ici)</label><div class="row"><input id="nu_pw" type="password" autocomplete="new-password"><button class="btn sm" type="button" data-a="genpw">Générer</button></div></div>'+
      '</div><div class="row" style="margin-top:12px"><button class="btn pri" type="button" data-a="ucreate">Enregistrer l\'invitation</button><a class="btn" href="https://console.firebase.google.com/project/'+esc((window.FIREBASE_CONFIG||{}).projectId||'')+'/authentication/users" target="_blank" rel="noopener">Ouvrir la console Firebase</a></div></form></div>';
    h += '<div class="panel"><div class="ph"><h2>Comptes</h2><div class="sp"><button class="btn sm" data-a="admReload">Actualiser</button></div></div>';
    if (!ST.users) h += '<div class="empty">Chargement…</div>';
    else {
      h += '<div class="tw"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Créé le</th><th></th></tr></thead><tbody>';
      ST.users.forEach(function(u){
        var me = ST.user && u.uid === ST.user.uid;
        h += '<tr'+(u.active?'':' class="zero"')+'><td>'+esc(u.name||'')+(me?' <span class="muted">(vous)</span>':'')+'</td><td>'+esc(u.email)+'</td><td><select data-urole="'+esc(u.uid)+'"'+(me?' disabled':'')+'>'+['admin','adv','lecture'].map(function(r){ return '<option value="'+r+'"'+(u.role===r?' selected':'')+'>'+({admin:'Administrateur',adv:'ADV',lecture:'Lecture seule'})[r]+'</option>'; }).join('')+'</select></td><td><span class="pill '+(u.active?'p-ok':u.invite||u.pending?'p-verifier':'p-info')+'">'+(u.active?'Actif':u.invite?'Invitation · compte à créer dans la console':u.pending?'En attente de validation':'Désactivé')+'</span></td><td class="muted">'+(u.lastLogin?esc(new Date(u.lastLogin).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})):'jamais')+'</td><td class="muted">'+(u.createdAt?esc(new Date(u.createdAt).toLocaleDateString('fr-FR')):'')+'</td><td class="row">'+
          (u.invite ? '<button class="btn sm" data-uinvrm="'+esc(u.uid)+'">Supprimer l\'invitation</button>' :
            (me ? '' : '<button class="btn sm" data-uact="'+esc(u.uid)+'">'+(u.active?'Désactiver':u.pending?'Activer':'Réactiver')+'</button>')+'<button class="btn sm" data-upw="'+esc(u.uid)+'">Réinitialiser le mot de passe</button>')+'</td></tr>';
        if (ST.pwFor === u.uid) h += '<tr class="det"><td colspan="7"><div class="row"><span>Envoyer à '+esc(u.email)+' l\'e-mail Firebase de réinitialisation du mot de passe ?</span><button class="btn pri sm" data-upwok="'+esc(u.uid)+'">Envoyer</button></div></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
  } else if (ST.admTab === 'logs'){
    h += '<div class="panel"><div class="ph"><h2>Journal</h2><span class="muted">Horodatage serveur et identité imposés par les règles Firestore · entrées non modifiables · IP relevée par le navigateur · 500 derniers événements</span><div class="sp"><button class="btn sm" data-a="admReload">Actualiser</button><button class="btn sm" data-a="xlsLog"'+(canSave()&&ST.logs?'':' disabled')+'>Exporter (.xlsx)</button></div></div>';
    h += '<div class="pb row"><select id="lf_type"><option value="">Tous les événements</option>'+Object.keys(LOGT).map(function(k){ return '<option value="'+k+'"'+(ST.logF.type===k?' selected':'')+'>'+LOGT[k]+'</option>'; }).join('')+'</select><input id="lf_q" type="search" placeholder="Filtrer par utilisateur ou détail" value="'+esc(ST.logF.q)+'" style="min-width:240px"></div>';
    if (!ST.logs) h += '<div class="empty">Chargement…</div>';
    else {
      var L = ST.logs.filter(function(l){ return (!ST.logF.type || l.type === ST.logF.type) && (!ST.logF.q || ((l.email||'')+' '+(l.detail||'')).toLowerCase().indexOf(ST.logF.q.toLowerCase()) >= 0); });
      h += '<div class="tw"><table><thead><tr><th>Date et heure</th><th>Utilisateur</th><th>Événement</th><th>Détail</th><th>Mois</th><th>Adresse IP</th></tr></thead><tbody>'+
        L.map(function(l){ return '<tr><td class="num" style="white-space:nowrap">'+esc(l.at ? new Date(l.at).toLocaleString('fr-FR') : '')+'</td><td>'+esc(l.email||'—')+'</td><td><span class="pill '+(l.type==='login_failed'?'p-bloquant':/login|logout/.test(l.type)?'p-info':'p-ok')+'">'+esc(LOGT[l.type]||l.type)+'</span></td><td class="muted">'+esc(l.detail||'')+'</td><td class="num">'+esc(l.month||'')+'</td><td class="num muted">'+esc(l.ip||'')+'</td></tr>'; }).join('')+
        (L.length ? '' : '<tr><td colspan="6" class="empty">Aucun événement.</td></tr>')+'</tbody></table></div>';
    }
    h += '</div>';
  } else {
    var ms = ST.monthsIndex.slice().sort(function(a,b){ return b.id.localeCompare(a.id); }), keep = last18();
    h += '<div class="panel"><div class="ph"><h2>Mois enregistrés</h2><span class="muted">Conservation : 18 mois glissants. Les mois plus anciens (exports, PDF, décisions) sont supprimés automatiquement à la première connexion d\'un administrateur (au plus une fois par jour).</span></div><div class="tw"><table><thead><tr><th>Agence · mois</th><th>Statut</th><th class="n">Exports</th><th class="n">Total HT</th><th>Dernière modification</th><th>Conservation</th></tr></thead><tbody>'+
      ms.map(function(m){ return '<tr><td>'+esc(agLabel(m.ag||String(m.id).split('_')[0]))+' · '+monthLabel(m.month||String(m.id).split('_')[1])+'</td><td>'+STATUS[m.status||'ouvert']+'</td><td class="n">'+((m.files||[]).length)+'</td><td class="n">'+(m.summary?n2(m.summary.HT):'—')+'</td><td class="muted">'+esc(m.updatedAt?new Date(m.updatedAt).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'')+' '+esc(m.updatedBy||'')+'</td><td>'+(keep.indexOf(m.month||String(m.id).split('_')[1])>=0?'<span class="pill p-ok">conservé</span>':'<span class="pill p-verifier">purge au prochain passage</span>')+'</td></tr>'; }).join('')+
      (ms.length?'':'<tr><td colspan="6" class="empty">Aucun mois enregistré.</td></tr>')+'</tbody></table></div></div>';
    h += '<div class="panel pb note">Stockage : tout est dans Firestore (Europe) : exports Odoo et PDF conservés à l\'identique avec leur empreinte SHA-256, décisions de l\'ADV, clôtures, grilles et journal. Rien n\'est conservé dans le navigateur.</div>';
  }
  return h + '</section>';
}
function exportLogs(){ var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((ST.logs||[]).map(function(l){ return { 'Date':l.at, 'Utilisateur':l.email, 'Événement':LOGT[l.type]||l.type, 'Détail':l.detail, 'Mois':l.month||'', 'IP':l.ip||'', 'Navigateur':l.ua||'' }; })), 'Journal'); saveXlsx(wb, 'Journal plateforme OTIS.xlsx'); }
function vAccount(){
  return '<section class="view"><div class="panel"><div class="ph"><h2>Mon compte</h2><span class="muted">'+esc(ST.user.email)+' · '+({admin:'administrateur',adv:'ADV',lecture:'lecture seule'})[ST.user.role]+'</span></div><form class="pb" autocomplete="off"><div class="grid-f">'+
    '<div class="fld"><label class="lbl" for="my_old">Mot de passe actuel</label><input id="my_old" type="password" autocomplete="current-password"></div>'+
    '<div class="fld"><label class="lbl" for="my_new">Nouveau mot de passe (12 caractères min.)</label><input id="my_new" type="password" autocomplete="new-password"></div>'+
    '<div class="fld"><label class="lbl" for="my_new2">Confirmer</label><input id="my_new2" type="password" autocomplete="new-password"></div></div>'+
    '<div class="row" style="margin-top:12px"><button class="btn pri" type="button" data-a="mypw">Changer mon mot de passe</button><button class="btn" type="button" data-a="logout">Se déconnecter</button></div></form></div></section>';
}
function changeMyPassword(){
  var o = $('my_old').value, a = $('my_new').value, b = $('my_new2').value;
  if (a.length < 12){ toast('12 caractères minimum'); return; } if (a !== b){ toast('Les deux saisies diffèrent'); return; }
  STORE.changeOwnPassword(o, a).then(function(){ toast('Mot de passe changé'); render(); }, function(e){ toast(/wrong-password|invalid-credential/.test(e.code||'') ? 'Mot de passe actuel incorrect' : 'Échec : '+e.message); });
}

/* ============ ÉVÉNEMENTS ============ */
document.addEventListener('click', function(e){
  if (e.target.id === 'modal'){ ST.modal = null; renderModal(); return; }
  var t = e.target.closest('button,[data-mod],[data-home],[data-acc],tr[data-pdf],.mitem');
  if (!t || t.disabled) return;
  var d = t.dataset;
  if (d.home !== undefined){ ST.module = 'home'; ST.modal = null; if (!ST.transports) loadTransports(); render(); return; }
  if (d.acc !== undefined){ ST.module = 'acc'; render(); return; }
  if (d.mod){ ST.module = d.mod; if (d.ltabgo) ST.ltab = d.ltabgo; render(); window.scrollTo(0,0); if (ST.module==='log' && ST.ltab==='adm') loadAdmin(); return; }
  if (d.ltab){ ST.ltab = d.ltab; ST.modal = null; render(); window.scrollTo(0,0); if (d.ltab==='adm') loadAdmin(); return; }
  if (d.ttab){ ST.ttab = d.ttab; render(); return; }
  if (d.agsel){ selectMonth(d.agsel, ST.month || defaultMonth()); return; }
  if (d.mon){ selectMonth(ST.ag, d.mon); return; }
  if (d.sub){ ST.sub = d.sub; ST.modal = null; render(); return; }
  if (d.par){ ST.parAg = d.par; ST.newAg = false; render(); return; }
  if (d.newag !== undefined){ ST.newAg = true; render(); return; }
  if (d.amt){ var p = d.amt.split('|'); ST.modal = { inv:p.slice(0,-1).join('|'), fam:p[p.length-1] }; renderModal(); return; }
  if (d.mclose !== undefined){ ST.modal = null; renderModal(); return; }
  if (d.pinv){ exportInvoicePdf(d.pinv); return; }
  if (d.anom){ ST.openAnom[d.anom] = !ST.openAnom[d.anom]; render(); return; }
  if (d.more){ ST.lim[d.more] = (ST.lim[d.more]||150) + 500; render(); return; }
  if (d.pdf){ ST.openPdf = ST.openPdf === d.pdf ? null : d.pdf; render(); return; }
  if (d.pdfrm){ removePdf(d.pdfrm); return; }
  if (d.rmfile){ var f = ST.files.filter(function(x){ return x.meta && x.meta.id === d.rmfile; })[0]; if (f && canEdit()){ ST.busy = 'Suppression…'; render(); STORE.deleteImport(monthId(), f.meta).then(function(){ ST.busy=''; refreshIndex(); selectMonth(ST.ag, ST.month); }, function(e){ ST.busy=''; toast('Suppression impossible : '+e.message); render(); }); } return; }
  if (d.docdl){ var a0 = ST.cfg.agencies[ST.parAg], m0 = a0 && a0.docs && a0.docs[d.docdl]; if (m0) STORE.getFileBytes(m0).then(function(b){ saveBlob(m0.name, new Blob([b]), ''); }, function(e){ toast('Téléchargement impossible : '+e.message); }); return; }
  if (d.docrm && isAdmin()){ var a1 = ST.cfg.agencies[ST.parAg], m1 = a1.docs[d.docrm]; STORE.deleteFile(m1); delete a1.docs[d.docrm]; if (d.docrm === 'cm') a1.cmList = []; saveCfg(a1.label+' : document supprimé'); render(); return; }
  if (d.trdel && isAdmin()){ STORE.deleteTransport(d.trdel).then(loadTransports); return; }
  if (d.adm){ ST.admTab = d.adm; render(); loadAdmin(); return; }
  if (d.synag){ ST.synAg = d.synag; render(); return; }
  if (d.uact){ var u = (ST.users||[]).filter(function(x){ return x.uid === d.uact; })[0]; if (u) adminAct(STORE.updateUser(u.uid, { active: !u.active }), (u.active?'Compte désactivé : ':'Compte réactivé : ')+u.email); return; }
  if (d.upw){ ST.pwFor = ST.pwFor === d.upw ? null : d.upw; render(); return; }
  if (d.upwok){ adminAct(STORE.setPassword(d.upwok), 'E-mail de réinitialisation envoyé'); ST.pwFor = null; return; }
  if (d.uinvrm){ adminAct(STORE.updateUser(d.uinvrm, { remove:true }), 'Invitation supprimée'); return; }
  if (!canEdit() && (d.sugg || d.merge)) return;
  if (d.sugg){ var r = ST.R.byKey[d.sugg]; if (r && r.suggest){ var s = r.suggest.t; ST.ov.assign[r.key] = { ag:s.ag, agLabel:s.agLabel, cm:s.cm, cmCode:s.cmCode }; delete ST.ov.exclude[r.key]; rebuild(); persist('Rattachement '+r.file+' l.'+r.line+' → '+s.cm); } return; }
  if (d.merge){ var mp = d.merge.split('|'); if (ST.ov.affMap[mp[0]]===mp[1]) delete ST.ov.affMap[mp[0]]; else { ST.ov.affMap[mp[0]] = mp[1]; delete ST.ov.affMap[mp[1]]; } rebuild(); persist('Affaire '+mp[0]+' facturée sur '+mp[1]); return; }
  var a = d.a;
  if (a === 'gen') generate();
  else if (a === 'pendGo'){ var P = ST.pending; doUpload(P.file, P.parsed, ST.ag, P.month); }
  else if (a === 'pendAg'){ var P2 = ST.pending; doUpload(P2.file, P2.parsed, P2.ag, ST.month); }
  else if (a === 'pendHere'){ var P3 = ST.pending; doUpload(P3.file, P3.parsed, ST.ag, ST.month); }
  else if (a === 'pendNo'){ ST.pending = null; render(); }
  else if (a === 'close'){ ST.confirmClose = true; render(); }
  else if (a === 'closeNo'){ ST.confirmClose = false; render(); }
  else if (a === 'closeOk') closeMonth();
  else if (a === 'reopen' && isAdmin()) reopenMonth();
  else if (a === 'xlsAg') exportAg();
  else if (a === 'xlsTr') exportTr();
  else if (a === 'xlsSyn') exportSynth();
  else if (a === 'xlsLog') exportLogs();
  else if (a === 'pdfRerun') rerunPdfs();
  else if (a === 'addTr') validateTransport();
  else if (a === 'agcreate') createAgency();
  else if (a === 'agcancel'){ ST.newAg = false; render(); }
  else if (a === 'gridreset' && isAdmin()){ var ag = ST.cfg.agencies[ST.parAg], tpl = $('tplsel').value; ST.cfg.grids[ag.grid] = clone(E.DEFAULT_CONFIG.grids[tpl]); ST.cfg.grids[ag.grid].label = 'Grille '+ag.label+' (base '+(tpl==='STD'?'OTIS 2022':'Tours')+')'; ag.template = tpl; saveCfg(ag.label+' : grille réinitialisée ('+tpl+')'); render(); }
  else if (a === 'ucreate') createUserFromForm();
  else if (a === 'genpw'){ var g = genPassword(), inp = $('nu_pw'); if (inp){ inp.value = g; inp.type = 'text'; } }
  else if (a === 'admReload'){ ST.users = null; ST.logs = null; loadAdmin(); }
  else if (a === 'logout') logout('Déconnexion');
  else if (a === 'mypw') changeMyPassword();
});
document.addEventListener('change', function(e){
  var t = e.target, d = t.dataset;
  if (d.cf !== undefined){
    if (!isAdmin()){ render(); return; }
    var v = t.type === 'number' ? parseFloat(t.value) : t.value; if (t.type === 'number' && isNaN(v)) return;
    if (v === 'true') v = true; else if (v === 'false') v = false; else if (/\.cas$/.test(d.cf)) v = +v;
    setPath(ST.cfg, d.cf, v); saveCfg(d.cf.replace(/^agencies\./,'agence ').replace(/^grids\./,'grille ')+' = '+v); if (/\.(label|active)$/.test(d.cf)) render(); return;
  }
  if (d.docup){ if (t.files[0]) agDocUpload(d.docup, t.files[0]); t.value = ''; return; }
  if (d.slotin){ if (t.files[0]) importFile(t.files[0], d.slotin); t.value = ''; return; }
  if (t.id === 'trf_m' || t.id === 'trf_a'){ ST.trF = { month:$('trf_m').value, ag:$('trf_a').value }; render(); return; }
  if (d.trs){ var tr = (ST.transports||[]).filter(function(x){ return x.id === d.trs; })[0]; if (tr){ tr.status = t.value; STORE.updateTransport(d.trs, { status:t.value }).then(function(){ toast('Statut : '+TRST[t.value]); render(); }); } return; }
  if (t.id === 'lf_type' || t.id === 'lf_q'){ ST.logF.type = $('lf_type').value; ST.logF.q = $('lf_q').value; render(); return; }
  if (d.urole){ adminAct(STORE.updateUser(d.urole, { role: t.value }), 'Rôle modifié'); return; }
  if (d.st){ if (!canEdit()){ render(); return; } ST.ov.status[d.st] = t.value; render(); persist('Statut '+(ST.R.invoices.filter(function(I){ return I.key===d.st; })[0]||{}).num+' : '+INVST[t.value]); return; }
  if ((d.aff || d.excl || d.assign) && !canEdit()){ render(); return; }
  if (d.aff){ var ka = d.aff; delete ST.ov.affaire[ka]; delete ST.ov.exclude[ka]; if (t.value==='__EXCL__') ST.ov.exclude[ka]='Affaire inconnue : non facturée'; else if (t.value) ST.ov.affaire[ka]=t.value; rebuild(); persist('Affaire '+(t.value||'retirée')+' pour '+ka); return; }
  if (d.excl){ if (t.checked) ST.ov.exclude[d.excl] = 'Exclu par '+(ST.user?ST.user.email:''); else delete ST.ov.exclude[d.excl]; rebuild(); persist((t.checked?'Exclusion ':'Réintégration ')+d.excl); return; }
  if (d.assign){ var k = d.assign, v2 = t.value; delete ST.ov.assign[k]; delete ST.ov.exclude[k];
    if (v2 === '__EXCL__') ST.ov.exclude[k] = 'Non rattachée : non facturée';
    else if (v2){ var q = v2.split('|'), ref = ST.R.records.filter(function(r){ return r.ag===q[0] && r.cm===q[1]; })[0]; ST.ov.assign[k] = { ag:q[0], agLabel:ref.agLabel, cm:q[1], cmCode:ref.cmCode }; }
    rebuild(); persist('Rattachement '+k+' → '+(v2||'aucun')); return; }
  if (t.id === 't_ag'){ var dlst = $('t_cml'); if (dlst) dlst.innerHTML = ((ST.cfg.agencies[t.value]||{}).cmList||[]).map(function(c){ return '<option value="'+esc(c.nom)+'">'; }).join(''); }
  if (t.closest && t.closest('#tform')) calcTransport();
});
document.addEventListener('input', function(e){ if (e.target.closest && e.target.closest('#tform')) calcTransport(); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && ST.modal){ ST.modal = null; renderModal(); } });
document.addEventListener('submit', function(e){ e.preventDefault(); if (e.target.id === 'loginForm') doLogin(); });
function createAgency(){
  var code = ($('na_code').value||'').trim().toUpperCase().replace(/\s+/g,''), label = ($('na_label').value||'').trim(), match = ($('na_match').value||'').trim(), tpl = $('na_tpl').value;
  if (!/^[0-9A-Z_-]{1,12}$/.test(code)){ toast('Code agence : lettres et chiffres, 12 caractères max.'); return; }
  if (ST.cfg.agencies[code]){ toast('Ce code existe déjà'); return; }
  if (!label || !match){ toast('Renseigner le libellé et le client Odoo'); return; }
  var gk = 'G'+code; ST.cfg.grids[gk] = clone(E.DEFAULT_CONFIG.grids[tpl]); ST.cfg.grids[gk].label = 'Grille '+label+' (base '+(tpl==='STD'?'OTIS 2022':'Tours')+')';
  ST.cfg.agencies[code] = { code:code, label:label, match:match, address:'', grid:gk, template:tpl, split:'affaire', cas:2, annexe:false, active:true, docs:{}, cmList:[] };
  ST.newAg = false; ST.parAg = code; saveCfg('Agence créée : '+label); render();
}

/* ============ SESSION ============ */
var IDLE_MIN = 30, idleT = null, warnT = null;
function armIdle(){ clearTimeout(idleT); clearTimeout(warnT); if (!ST.user || STORE.mode === 'demo') return; warnT = setTimeout(function(){ toast('Déconnexion automatique dans 2 minutes sans activité'); }, (IDLE_MIN-2)*60000); idleT = setTimeout(function(){ logout('Déconnexion automatique (inactivité '+IDLE_MIN+' min)'); }, IDLE_MIN*60000); }
['click','keydown','scroll','mousemove','touchstart'].forEach(function(ev){ document.addEventListener(ev, function(){ if (ST.user && !armIdle._t){ armIdle._t = setTimeout(function(){ armIdle._t = null; armIdle(); }, 1000); } }, { passive:true }); });
function logout(reason){ STORE.signOut(reason).then(function(){ ST.user = null; showLogin(reason === 'Déconnexion' ? '' : reason); }); }
function showLogin(msg){ $('app').hidden = true; $('login').hidden = false; $('loginMsg').textContent = msg || ''; }
function doLogin(){
  var em = $('lg_email').value.trim(), pw = $('lg_pw').value;
  $('loginMsg').textContent = 'Connexion…';
  STORE.signIn(em, pw).catch(function(e){ $('loginMsg').textContent = /wrong-password|invalid-credential|user-not-found|invalid-login/.test(e.code||e.message) ? 'E-mail ou mot de passe incorrect.' : /too-many/.test(e.code||'') ? 'Trop de tentatives : réessayer dans quelques minutes.' : 'Connexion impossible : '+e.message; });
}
function start(profile){
  ST.user = profile; $('login').hidden = true; $('app').hidden = false; armIdle();
  STORE.getConfig().then(function(c){ ST.cfg = c ? deepMerge(E.DEFAULT_CONFIG, c) : clone(E.DEFAULT_CONFIG); if (c && c.agencies) Object.keys(E.DEFAULT_CONFIG.agencies).forEach(function(k){ if (!c.agencies[k]) delete ST.cfg.agencies[k]; }); ST.cfgM = ST.cfg; return STORE.listMonths(); })
    .then(function(L){ ST.monthsIndex = L; var withData = L.filter(function(m){ return (m.files||[]).length; }).map(function(m){ return m.month; }).sort(); ST.month = withData.indexOf(defaultMonth()) >= 0 ? defaultMonth() : (withData[withData.length-1] || defaultMonth()); render(); loadTransports(); },
      function(e){ toast('Base de données inaccessible : '+e.message); });
}
STORE.onAuth(function(profile, msg){ if (profile) start(profile); else { ST.user = null; showLogin(msg); } });
if (window.claude && window.claude.use) window.claude.use('downloads').then(function(x){ dl = x; render(); }, function(){ dl = null; });
})();
