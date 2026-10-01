(function(){
'use strict';
var E = ENGINE;
var ST = { files: [], globalCfg: clone(E.DEFAULT_CONFIG), cfg: clone(E.DEFAULT_CONFIG), user: null, months: [], monthDoc: null, pdfs: [], openPdf: null, users: null, logs: null, admTab: 'users', synAg: 'all', logF: { type:'', q:'' }, pending: null, busy: '', ov: { assign: {}, exclude: {}, affaire: {}, affMap: {} }, month: null, R: null, view: 'fac', inv: null, ag: null, done: {}, openLine: null, openAnom: {}, lim: {}, sample: true, transport: [] };
var dl = null;
function role(){ return ST.user ? ST.user.role : 'lecture'; }
function isAdmin(){ return role() === 'admin'; }
function monthClosed(){ return ST.monthDoc && ST.monthDoc.status === 'clos'; }
function canEdit(){ return role() !== 'lecture' && !monthClosed(); }
function RO(){ return canEdit() ? '' : ' disabled'; }
function hhmm(){ var d = new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function blankOv(){ return { assign:{}, exclude:{}, affaire:{}, affMap:{} }; }
function deepMerge(base, over){ if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over; var o = clone(base); Object.keys(over).forEach(function(k){ o[k] = (base && typeof base[k] === 'object' && !Array.isArray(base[k])) ? deepMerge(base[k], over[k]) : over[k]; }); return o; }
function last18(){ var o = [], d = new Date(); d.setDate(1); for (var i=0;i<18;i++){ o.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); d.setMonth(d.getMonth()-1); } return o; }
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function esc(s){ return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function eur(x){ return (x||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €'; }
function n2(x){ return (x||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function n3(x){ return isNaN(x) ? '' : x.toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3}); }
function nx(x){ return isNaN(x) ? '' : x.toLocaleString('fr-FR',{maximumFractionDigits:4}); }
function $(id){ return document.getElementById(id); }
function toast(t){ var e=$('toast'); e.textContent=t; e.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(function(){ e.hidden=true; },2600); }
var MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function monthLabel(ym){ var p=ym.split('-'); return MOIS[+p[1]-1]+' '+p[0]; }
var FAM = { E:'Entrées en stock', S:'Sorties de stock', STK:'Stockage', MIN:'Complément minimum 30 m² / appareil' };
var FAMU = { E:'UP (m³/t)', S:'UP (m³/t)', STK:'m² facturés', MIN:'m² complément' };
var SEV = { bloquant:'Bloquant', verifier:'À vérifier', info:'Info' };

/* ---------- données (base de données via STORE) ---------- */
function refreshMonths(){ return STORE.listMonths().then(function(L){ ST.months = L; renderTop(); if (ST.view==='syn') render(); }); }
function loadMonth(m){
  ST.month = m; ST.busy = 'Chargement de '+monthLabel(m)+'…'; ST.R = null; ST.files = []; ST.pdfs = []; ST.openLine = null; ST.pending = null; renderTop(); render();
  return STORE.getMonth(m).then(function(doc){
    if (ST.month !== m) return null;
    ST.monthDoc = doc || { id:m, status:'vide', files:[] };
    ST.ov = deepMerge(blankOv(), (doc && doc.ov) || {});
    ST.done = (doc && doc.done) || {}; ST.transport = (doc && doc.transport) || [];
    ST.cfg = (doc && doc.status==='clos' && doc.cfgSnapshot) ? doc.cfgSnapshot : ST.globalCfg;
    return Promise.all(((doc && doc.files) || []).map(function(meta){
      return STORE.loadImportRows(meta).then(function(rows){ var p = E.parseFile(meta.name, rows); p.meta = meta; return p; },
        function(e){ return { name:meta.name, meta:meta, error:'Lecture impossible : '+e.message }; });
    }));
  }).then(function(parsed){
    if (ST.month !== m || !parsed) return;
    ST.files = parsed; ST.busy = ''; rebuild();
    return STORE.listPdfs(m).then(function(p){ if (ST.month === m){ ST.pdfs = p; if (ST.view==='pdf') render(); } });
  }).catch(function(e){ ST.busy = ''; toast('Chargement impossible : '+e.message); render(); });
}
function rebuild(){
  var ok = ST.files.filter(function(f){ return !f.error; });
  ST.R = ok.length ? E.build(ok, ST.cfg, ST.ov, ST.month) : null;
  ST.flags = {};
  if (ST.R) ST.R.anomalies.forEach(function(a){ a.keys.forEach(function(k){ (ST.flags[k] = ST.flags[k] || []).push(a); }); });
  renderTop(); render();
}
/* Enregistrement différé des décisions de l'ADV (rattachements, exclusions, statut des factures, transports) */
var saveT = null, saveWhat = [];
function persist(what){
  if (!canEdit()) return;
  if (what) saveWhat.push(what);
  clearTimeout(saveT); setSave('Enregistrement…');
  saveT = setTimeout(function(){
    var w = saveWhat.splice(0);
    STORE.saveMonth(ST.month, { ov:ST.ov, done:ST.done, transport:ST.transport, summary: ST.R ? summarize(ST.R) : null }).then(function(){
      setSave('Enregistré à '+hhmm()); if (w.length) STORE.log('modification', w.slice(0,6).join(' · ')+(w.length>6?' (+'+(w.length-6)+')':''), ST.month); refreshMonths();
    }, function(e){ setSave('Échec de l\'enregistrement : '+e.message); toast('Enregistrement impossible : '+e.message); });
  }, 700);
}
function setSave(t){ var e = $('save'); if (e) e.textContent = t; }
/* Chiffres clés du mois, stockés pour la synthèse et l'historique */
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
function parseLocal(file){
  return new Promise(function(res){
    var fr = new FileReader();
    fr.onload = function(){ try { var wb = XLSX.read(new Uint8Array(fr.result), { type:'array', raw:false, cellDates:false }); var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:true, defval:null }); res(E.parseFile(file.name, rows)); } catch(e){ res({ name:file.name, error:'Fichier illisible : '+e.message }); } };
    fr.onerror = function(){ res({ name:file.name, error:'Lecture impossible' }); };
    fr.readAsArrayBuffer(file);
  });
}
function readFiles(list){
  var arr = Array.prototype.slice.call(list);
  if (!arr.length) return;
  if (!canEdit()){ toast(monthClosed() ? 'Mois clôturé : le rouvrir avant d\'importer.' : 'Droits insuffisants pour importer.'); return; }
  if (typeof XLSX === 'undefined'){ toast('Lecteur Excel indisponible : vérifier la connexion.'); return; }
  ST.busy = 'Lecture de '+arr.length+' fichier(s)…'; render();
  Promise.all(arr.map(parseLocal)).then(function(parsed){
    ST.busy = '';
    var bad = parsed.filter(function(p){ return p.error || !p.kind; });
    if (bad.length){ toast(bad.length+' fichier(s) rejeté(s) : '+bad.map(function(b){ return b.name; }).join(', ')); }
    var good = []; parsed.forEach(function(p, i){ if (!p.error && p.kind) good.push({ file:arr[i], parsed:p, month:E.detectMonth([p]) }); });
    if (!good.length){ render(); return; }
    var other = good.filter(function(g){ return g.month && g.month !== ST.month; });
    if (other.length){ ST.pending = good; render(); return; }
    upload(good, ST.month);
  });
}
function upload(items, month){
  ST.pending = null; ST.busy = 'Enregistrement de '+items.length+' fichier(s) en base…'; render();
  var existing = (month === ST.month && ST.monthDoc && ST.monthDoc.files) || [];
  var chain = Promise.resolve();
  items.forEach(function(it){
    existing.filter(function(m){ return m.name === it.file.name; }).forEach(function(m){ chain = chain.then(function(){ return STORE.deleteImport(month, m); }); });
    chain = chain.then(function(){ return STORE.uploadImport(month, it.file); });
  });
  chain.then(function(){ ST.busy = ''; toast(items.length+' fichier(s) enregistré(s) pour '+monthLabel(month)); refreshMonths(); return loadMonth(month); },
    function(e){ ST.busy = ''; toast('Import impossible : '+e.message); render(); });
}

/* ---------- barre ---------- */
var STATUS = { ouvert:'en cours', clos:'clôturé', vide:'vide' };
function renderTop(){
  var sel = $('month'), have = {};
  ST.months.forEach(function(m){ have[m.id] = m; });
  var list = last18(); if (ST.month && list.indexOf(ST.month) < 0) list.push(ST.month);
  Object.keys(have).forEach(function(k){ if (list.indexOf(k) < 0) list.push(k); });
  list.sort().reverse();
  sel.innerHTML = list.map(function(k){ var st = have[k] ? (have[k].status || 'ouvert') : 'vide'; return '<option value="'+k+'"'+(k===ST.month?' selected':'')+'>'+monthLabel(k)+' · '+STATUS[st]+'</option>'; }).join('');
  $('src').textContent = STORE.mode === 'demo' ? 'mode démo' : '';
  if (ST.user) $('who').textContent = ST.user.name + ' · ' + ({admin:'administrateur',adv:'ADV',lecture:'lecture seule'})[ST.user.role];
  var blk = ST.R ? ST.R.anomalies.filter(function(a){ return a.sev==='bloquant'; }).reduce(function(s,a){ return s + openCount(a); },0) : 0;
  $('cntBlk').hidden = !blk; $('cntBlk').textContent = blk;
  var pb = ST.pdfs.filter(function(p){ return p.result && p.result.status !== 'conforme'; }).length;
  $('cntPdf').hidden = !pb; $('cntPdf').textContent = pb;
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(t){ t.setAttribute('aria-selected', t.dataset.v === ST.view ? 'true':'false'); if (t.dataset.v === 'adm') t.hidden = !isAdmin(); });
}
function openCount(a){ if (a.code !== 'NON_RATTACHE' && a.code !== 'AFFAIRE_INCONNUE') return a.keys.length; return a.keys.filter(function(k){ return !ST.ov.assign[k] && !ST.ov.exclude[k] && !ST.ov.affaire[k]; }).length; }

function render(){
  var m = $('main');
  if (ST.busy && ST.view !== 'adm' && ST.view !== 'syn' && ST.view !== 'acc') { m.innerHTML = '<section class="view"><div class="panel empty">'+esc(ST.busy)+'</div></section>'; return; }
  if (ST.view === 'imp') m.innerHTML = vImport();
  else if (ST.view === 'pdf') m.innerHTML = vPdf();
  else if (ST.view === 'syn') m.innerHTML = vSynth();
  else if (ST.view === 'adm') m.innerHTML = vAdmin();
  else if (ST.view === 'acc') m.innerHTML = vAccount();
  else if (ST.view === 'ctl') m.innerHTML = vControls();
  else if (ST.view === 'fac') m.innerHTML = vInvoices();
  else if (ST.view === 'trp') m.innerHTML = vTransport();
  else m.innerHTML = vRules();
  if (ST.view === 'imp') bindDrop();
  if (ST.view === 'pdf') bindPdfDrop();
  if (ST.view === 'syn') bindChartTips();
  if (ST.view === 'trp') calcTransport();
}

/* ---------- 1. Imports ---------- */
function vImport(){
  var f = ST.files, h = '<section class="view">';
  h += monthStrip();
  if (ST.pending) h += pendingBox();
  h += '<div class="panel"><div class="ph"><h2>Exports Odoo WMS · '+monthLabel(ST.month)+'</h2><span class="muted">Fichiers enregistrés en base, rechargés à chaque ouverture du mois</span></div><div class="pb" style="display:grid;gap:14px">';
  if (canEdit()) h += '<label class="drop" id="drop"><input type="file" id="fin" multiple accept=".xls,.xlsx,.csv"><strong>Déposer les exports Odoo ici</strong><span class="muted">« Fichier Manutention » et « Fichier Client Stockage », une paire par agence. Formats .xls / .xlsx. Un fichier de même nom remplace le précédent.</span><span class="btn sm">Choisir des fichiers</span></label>';
  else h += '<p class="note muted">'+(monthClosed() ? 'Mois clôturé : lecture seule. Un administrateur peut le rouvrir.' : 'Profil en lecture seule.')+'</p>';
  if (!f.length) h += '<div class="empty">Aucun export enregistré pour '+monthLabel(ST.month)+'.</div>';
  else {
    h += '<div class="tw"><table><thead><tr><th>Fichier</th><th>Type</th><th>Format</th><th>Agence(s)</th><th class="n">Lignes</th><th>Contrôle de structure</th><th>Importé</th><th></th></tr></thead><tbody>';
    f.forEach(function(x,i){
      var st = x.error ? '<span class="pill p-bloquant">Rejeté</span> '+esc(x.error)
        : x.missing.length ? '<span class="pill p-bloquant">Colonnes manquantes</span> '+esc(x.missing.join(', '))
        : x.kind==='stock' && x.fmt==='B' ? '<span class="pill p-verifier">Incomplet</span> Sans dates d\'entrée/sortie, type de stockage ni prix : durées reconstruites depuis les mouvements.'
        : '<span class="pill p-ok">Conforme</span>';
      h += '<tr><td>'+esc(x.name)+'</td><td>'+(x.kind==='manut'?'Manutention':x.kind==='stock'?'Stockage':'—')+'</td><td>'+(x.kind==='stock'?(x.fmt==='A'?'Complet (dates)':'Réduit (jours seuls)'):x.kind?'Standard':'')+'</td><td>'+esc((x.agences||[]).join(', ')||'—')+'</td><td class="n">'+(x.records?x.records.length:'')+'</td><td>'+st+(x.kind && E.detectMonth([x]) && E.detectMonth([x]) !== ST.month ? ' <span class="pill p-verifier">Données de '+monthLabel(E.detectMonth([x]))+'</span>' : '')+'</td><td class="muted" style="font-size:12px;white-space:nowrap">'+(x.meta ? esc(new Date(x.meta.at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}))+'<br>'+esc(x.meta.by) : '')+'</td><td>'+(canEdit() ? '<button class="btn sm" data-a="rm" data-i="'+i+'">Supprimer</button>' : '')+'</td></tr>';
    });
    h += '</tbody></table></div>';
    // couverture par agence
    var cov = {};
    f.forEach(function(x){ (x.agences||[]).forEach(function(a){ cov[a] = cov[a] || {}; cov[a][x.kind] = 1; }); });
    var miss = Object.keys(cov).filter(function(a){ return !cov[a].manut || !cov[a].stock; });
    if (miss.length) h += '<p class="note"><span class="pill p-bloquant">Incomplet</span> Fichier manquant pour : '+miss.map(function(a){ return esc(a)+' ('+(cov[a].manut?'stockage':'manutention')+')'; }).join(', ')+'.</p>';
  }
  h += '</div></div>';
  if (ST.R){
    var R = ST.R, nm = R.M.length, ns = R.S.length;
    h += '<div class="kpis">'+kpi('Mouvements', nm.toLocaleString('fr-FR'), R.M.filter(function(r){return r.op==='E';}).length+' entrées · '+R.M.filter(function(r){return r.op==='S';}).length+' sorties')+
      kpi('Lignes de stock', ns.toLocaleString('fr-FR'), 'colis présents sur la période')+
      kpi('Agences', uniqA(R.records.map(function(r){ return r.agLabel; }).filter(Boolean)).length, uniqA(R.records.map(function(r){ return r.agLabel; }).filter(Boolean)).join(' · '))+
      kpi('Période détectée', monthLabel(R.month), R.mb.len+' jours')+'</div>';
    h += '<div><button class="btn pri" data-go="ctl">Passer aux anomalies Odoo →</button></div>';
  }
  return h + '</section>';
}
function monthStrip(){
  var d = ST.monthDoc || { status:'vide' }, st = d.status || 'vide', h = '<div class="strip"><span class="lbl">Période de facturation</span><strong>'+monthLabel(ST.month)+'</strong>';
  h += '<span class="pill '+(st==='clos'?'p-ok':st==='ouvert'?'p-verifier':'p-info')+'">'+STATUS[st]+'</span>';
  if (st==='clos') h += '<span class="muted">le '+esc(d.closedAt ? new Date(d.closedAt).toLocaleDateString('fr-FR') : '')+' par '+esc(d.closedBy||'')+' · grilles figées à la clôture</span>';
  else if (d.updatedAt) h += '<span class="muted" id="save">Dernier enregistrement '+esc(new Date(d.updatedAt).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}))+' par '+esc(d.updatedBy||'')+'</span>';
  else h += '<span class="muted" id="save"></span>';
  h += '<span class="sp">';
  if (st==='ouvert' && role()!=='lecture' && ST.R){
    var blk = ST.R.anomalies.filter(function(a){ return a.sev==='bloquant'; }).reduce(function(s,a){ return s+openCount(a); },0);
    h += blk ? '<button class="btn" disabled title="Traiter les lignes bloquantes avant de clôturer">Clôturer le mois ('+blk+' bloquante'+(blk>1?'s':'')+')</button>' : (ST.confirmClose ? '<span class="muted">Figer les montants et les grilles ?</span><button class="btn pri" data-a="closeOk">Confirmer la clôture</button><button class="btn" data-a="closeNo">Annuler</button>' : '<button class="btn pri" data-a="close">Clôturer '+monthLabel(ST.month)+'</button>');
  }
  if (st==='clos' && isAdmin()) h += '<button class="btn" data-a="reopen">Rouvrir le mois</button>';
  return h + '</span></div>';
}
function pendingBox(){
  var ms = {}; ST.pending.forEach(function(g){ if (g.month) ms[g.month] = 1; });
  var target = Object.keys(ms).filter(function(k){ return k !== ST.month; })[0];
  return '<div class="panel pb warnbox"><p><span class="pill p-verifier">Période</span> Les fichiers déposés portent sur <strong>'+Object.keys(ms).map(monthLabel).join(', ')+'</strong>, alors que la période sélectionnée est <strong>'+monthLabel(ST.month)+'</strong>.</p><div class="row">'+
    (target ? '<button class="btn pri" data-a="pendGo" data-m="'+target+'">Importer dans '+monthLabel(target)+'</button>' : '')+
    '<button class="btn" data-a="pendHere">Importer quand même dans '+monthLabel(ST.month)+'</button><button class="btn" data-a="pendNo">Annuler</button></div></div>';
}
function closeMonth(){
  var R = ST.R; ST.confirmClose = false;
  STORE.saveMonth(ST.month, { status:'clos', cfgSnapshot: ST.cfg, summary: summarize(R), ov:ST.ov, done:ST.done, transport:ST.transport })
    .then(function(){ return STORE.log('month_close', monthLabel(ST.month)+' · '+eur(R.totals.HT)+' HT', ST.month); })
    .then(function(){ toast(monthLabel(ST.month)+' clôturé'); refreshMonths(); loadMonth(ST.month); }, function(e){ toast('Clôture impossible : '+e.message); });
}
function reopenMonth(){
  STORE.saveMonth(ST.month, { status:'ouvert', cfgSnapshot:null }).then(function(){ return STORE.log('month_reopen', monthLabel(ST.month), ST.month); })
    .then(function(){ toast(monthLabel(ST.month)+' rouvert'); refreshMonths(); loadMonth(ST.month); }, function(e){ toast('Réouverture impossible : '+e.message); });
}
function uniqA(a){ return a.filter(function(x,i){ return a.indexOf(x)===i; }); }
function kpi(l,v,s){ return '<div class="kpi"><span class="lbl">'+esc(l)+'</span><span class="v">'+esc(v)+'</span><span class="s">'+esc(s||'')+'</span></div>'; }
function bindDrop(){
  var d = $('drop'), i = $('fin'); if (!d) return;
  i.onchange = function(){ readFiles(i.files); i.value=''; };
  d.ondragover = function(e){ e.preventDefault(); d.classList.add('over'); };
  d.ondragleave = function(){ d.classList.remove('over'); };
  d.ondrop = function(e){ e.preventDefault(); d.classList.remove('over'); readFiles(e.dataTransfer.files); };
}

/* ---------- 2. Contrôles ---------- */
function vControls(){
  if (!ST.R) return noData();
  var A = ST.R.anomalies, c = { bloquant:0, verifier:0, info:0 };
  A.forEach(function(a){ c[a.sev] += openCount(a); });
  var h = '<section class="view"><div class="kpis">'+kpi('Bloquant', c.bloquant, 'lignes exclues des factures tant que non traitées')+kpi('À vérifier', c.verifier, 'facturées selon la règle, à confirmer')+kpi('Information', c.info, 'écarts Odoo sans action requise')+kpi('Lignes exclues par l\'ADV', Object.keys(ST.ov.exclude).length, 'cochées « exclure »')+'</div>';
  h += '<div class="panel"><div class="ph"><h2>Incohérences des données Odoo</h2><span class="muted">Chaque contrôle liste les lignes concernées, avec fichier et n° de ligne Excel.</span></div>';
  if (!A.length) h += '<div class="empty">Aucune incohérence détectée.</div>';
  A.forEach(function(a){
    var open = ST.openAnom[a.code];
    h += '<div class="anom"><button class="anom-h" data-anom="'+a.code+'" aria-expanded="'+(open?'true':'false')+'"><span class="pill p-'+a.sev+'">'+SEV[a.sev]+'</span><span class="t">'+esc(a.title)+'</span><span class="num">'+openCount(a)+' l.</span><span class="e">'+esc(a.explain)+(a.note?'<br><span class="muted">'+esc(a.note)+'</span>':'')+'</span></button>';
    if (open) h += '<div class="anom-b">'+(a.code==='NON_RATTACHE' ? assignTable(a) : a.code==='AFFAIRE_INCONNUE' ? affTable(a) : (a.merge ? mergeBox(a) : '') + recTable(a.keys, 'anom-'+a.code))+'</div>';
    h += '</div>';
  });
  return h + '</div></section>';
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

/* ---------- 3. Factures ---------- */
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
function agList(){ var o = {}; ST.R.invoices.forEach(function(I){ o[I.ag] = o[I.ag] || { ag:I.ag, label:I.agLabel, n:0, ht:0, done:0 }; o[I.ag].n++; o[I.ag].ht = E.r2(o[I.ag].ht + I.totals.HT); if (ST.done[I.key]) o[I.ag].done++; }); return Object.keys(o).sort().map(function(k){ return o[k]; }); }
function vInvoices(){
  if (!ST.R) return noData();
  var R = ST.R, ags = agList();
  if (!ags.length) return '<section class="view"><div class="panel empty">Aucune facture sur la période.</div></section>';
  if (!ags.some(function(a){ return a.ag === ST.ag; })) ST.ag = ags[0].ag;
  var A = ags.filter(function(a){ return a.ag === ST.ag; })[0];
  var list = R.invoices.filter(function(I){ return I.ag === ST.ag; });
  var blk = R.anomalies.filter(function(a){ return a.sev==='bloquant'; }).reduce(function(s,a){ return s+openCount(a); },0);
  var h = '<section class="view">' + monthStrip();
  // sous-menu agences
  h += '<nav class="subnav" role="tablist">'+ags.map(function(a){ return '<button class="subtab" role="tab" data-ag="'+esc(a.ag)+'" aria-selected="'+(a.ag===ST.ag)+'"><span class="st-l">'+esc(a.label)+'</span><span class="st-v num">'+eur(a.ht)+'</span><span class="st-s">'+a.n+' factures · '+a.done+' éditée'+(a.done>1?'s':'')+'</span></button>'; }).join('')+'</nav>';
  var t = { E:0, S:0, STK:0 }; list.forEach(function(I){ t.E = E.r2(t.E+I.totals.E); t.S = E.r2(t.S+I.totals.S); t.STK = E.r2(t.STK+I.totals.STK+I.totals.MIN); });
  h += '<div class="kpis">'+kpi('Total HT '+A.label, eur(A.ht), monthLabel(R.month))+kpi('Entrées', eur(t.E), '')+kpi('Sorties', eur(t.S), '')+kpi('Stockage', eur(t.STK), 'dont minimum 30 m² : '+eur(list.reduce(function(s,I){ return s+I.totals.MIN; },0)))+kpi('À éditer', (A.n-A.done)+' / '+A.n, 'factures restantes')+'</div>';
  if (blk) h += '<p class="note"><span class="pill p-bloquant">'+blk+' ligne(s) bloquante(s)</span> Non incluses dans les montants. <button class="btn sm" data-go="ctl">Traiter dans Contrôles</button></p>';
  // liste des factures
  var cfgA = ST.cfg.agencies[ST.ag] || {};
  h += '<div class="panel"><div class="ph"><h2>Factures à éditer</h2><span class="muted">'+({affaire:'Une facture par affaire',cm:'Une facture par contremaître',appareil:'Une facture par appareil',ag:'Une facture pour l\'agence'})[cfgA.split||'cm']+' · '+(cfgA.cas===1?'cas 1, devis à valider':'cas 2, sans commande client')+' · '+(cfgA.annexe?'avec annexe':'sans annexe')+'</span><div class="sp"><button class="btn" data-a="xlsAll"'+(canSave()?'':' disabled')+'>Exporter le mois, toutes agences</button><button class="btn" data-a="xlsAg"'+(canSave()?'':' disabled title="Téléchargement indisponible dans cette vue"')+'>Exporter l\'agence (.xlsx)</button></div></div>';
  h += '<div class="tw"><table class="invt"><thead><tr><th>Facture</th><th>'+({affaire:'Affaire',cm:'Contremaître',appareil:'Appareil',ag:'Périmètre'})[cfgA.split||'cm']+'</th><th>Désignation</th><th class="n">Colis</th><th class="n">Quantité</th><th>Unité</th><th class="n">Montant HT</th><th>Statut</th></tr></thead>';
  list.forEach(function(I){
    var done = !!ST.done[I.key], aps = Object.keys(I.appareils).sort(), det = '';
    h += '<tbody class="inv'+(done?' done':'')+'">';
    FAM3.forEach(function(f, i){
      var g = famAgg(I, f), id = I.key+'|'+f.k, open = ST.openLine === id, empty = !g.keys.length && !g.minKeys.length;
      h += '<tr class="'+(empty?'zero':'click')+(open?' open':'')+(i===0?' first':'')+'"'+(empty?'':' data-line="'+esc(id)+'" aria-expanded="'+open+'"')+'>';
      if (i === 0) h += '<td rowspan="4" class="ihead"><span class="num inum">'+esc(I.num)+'</span></td><td rowspan="4" class="ihead"><span class="num" style="font-weight:600">'+esc(I.sub)+'</span><br><span class="muted">'+esc(Object.keys(I.cms).join(', '))+'</span><br><span class="muted num aps" title="'+esc(aps.join(' · '))+'">'+aps.length+' appareil'+(aps.length>1?'s':'')+' : '+esc(aps.join(' · '))+'</span></td>';
      h += '<td>'+(empty?'':(open?'▾ ':'▸ '))+f.label+(g.minAmt?' <span class="muted">(dont min. 30 m² '+n2(g.minAmt)+')</span>':'')+'</td><td class="n">'+(g.n||'—')+'</td><td class="n">'+(g.qty?n3(g.qty):'—')+'</td><td class="muted" style="font-size:12px">'+f.unit+'</td><td class="n">'+n2(g.amount)+'</td>';
      if (i === 0) h += '<td rowspan="4" class="ihead"><button class="btn sm'+(done?' pri':'')+'" data-done="'+esc(I.key)+'"'+RO()+'>'+(done?'✓ Éditée':'À éditer')+'</button><br><button class="btn sm" style="margin-top:6px" data-xinv="'+esc(I.key)+'"'+(canSave()?'':' disabled')+'>Excel</button></td>';
      h += '</tr>';
      if (open) det = '<tr class="det"><td colspan="8"><div class="det-h"><span class="lbl">Détail '+f.label.toLowerCase()+' · '+esc(I.num)+'</span><button class="btn sm" data-line="'+esc(id)+'">Fermer</button></div><div class="det-w">'+famDetail(I, f, g, id)+'</div></td></tr>';
    });
    h += '<tr class="tot"><td colspan="4">Total HT</td><td class="n">'+n2(I.totals.HT)+'</td></tr>'+det+'</tbody>';
  });
  h += '</table></div></div>';
  return h + '</section>';
}
function famDetail(I, f, g, id){
  var h = '';
  if (f.k === 'STK' && g.minKeys.length){
    h += '<div class="note" style="padding:0 8px 8px"><span class="lbl">Minimum 30 m² par appareil</span><br>'+g.minKeys.map(function(k){ var m = ST.R.byKey[k]; return 'Appareil <span class="num">'+esc(m.apLabel)+'</span> : '+n3(m.surf)+' m² facturés au mois → complément <span class="formula">'+esc(m.formula)+'</span>'; }).join('<br>')+'</div>';
  }
  if (g.keys.length) h += recTable(g.keys, id);
  return h;
}
/* ---------- 4. Transport ---------- */
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
  var h = '<section class="view"><div class="two"><div class="panel"><div class="ph"><h2>Nouvelle livraison chantier</h2><span class="muted">Grille transport OTIS 2023 (01/07/2023)</span></div><form class="pb" id="tform" style="display:grid;gap:14px">';
  h += '<div class="grid-f">'+fld('Agence OTIS','t_ag','text','AG 496 Major Project')+fld('Contremaître','t_cm','text','')+fld('Appareil / N° commande','t_cmd','text','')+fld('Date de livraison','t_date','date','')+'</div>';
  h += '<div class="grid-f">'+fld('Code postal du chantier','t_cp','text','92400')+fld('Commune','t_ville','text','Courbevoie')+
    '<div class="fld" id="w78" hidden><span class="lbl">Yvelines (78) : zone</span><select id="t_78"><option value="">Choisir</option><option value="A">Zone A (moitié Est)</option><option value="B">Zone B (moitié Ouest)</option></select></div></div>';
  h += '<div class="grid-f">'+fld('Palettes Europe','t_pal','number','3')+fld('Poids total (kg)','t_kg','number','850')+fld('Plus grande longueur (mm)','t_len','number','2500')+'</div>';
  h += '<div class="grid-f">'+fld('Durée estimée (h)','t_h','number','3.5')+fld('Km estimés (aller-retour)','t_km','number','60')+'</div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:10px 22px"><label class="chk"><input type="checkbox" id="t_hayon" checked>Livraison sans quai (hayon requis)</label><label class="chk"><input type="checkbox" id="t_grue">Levage par grue</label><label class="chk"><input type="checkbox" id="t_man">Manutentionnaire en plus</label></div>';
  h += '</form></div><div style="display:grid;gap:16px"><div id="treco"></div></div></div>';
  h += '<div class="panel"><div class="ph"><h2>Transports du mois</h2><span class="muted">Cas 1 : un devis par livraison, facturé après validation OTIS</span><div class="sp"><button class="btn" data-a="xlsTr"'+(ST.transport.length&&canSave()?'':' disabled')+'>Exporter (.xlsx)</button></div></div>';
  if (!ST.transport.length) h += '<div class="empty">Aucun transport ajouté. Renseigner une livraison puis « Ajouter à la facturation ».</div>';
  else {
    h += '<div class="tw"><table><thead><tr><th>Date</th><th>Agence</th><th>Contremaître</th><th>Appareil</th><th>Chantier</th><th>Zone</th><th>Véhicule</th><th>Détail</th><th class="n">Montant HT</th><th></th></tr></thead><tbody>';
    ST.transport.forEach(function(t,i){ h += '<tr><td>'+esc(E.frDate(t.date))+'</td><td>'+esc(t.ag)+'</td><td>'+esc(t.cm)+'</td><td class="num">'+esc(t.cmd)+'</td><td>'+esc(t.cp+' '+t.ville)+'</td><td>'+t.zone+'</td><td>'+esc(t.veh)+'</td><td class="formula">'+esc(t.detail)+'</td><td class="n">'+n2(t.total)+'</td><td><button class="btn sm" data-trm="'+i+'"'+RO()+'>Retirer</button></td></tr>'; });
    h += '<tr class="tot"><td colspan="8">Total</td><td class="n">'+n2(ST.transport.reduce(function(s,t){ return s+t.total; },0))+'</td><td></td></tr></tbody></table></div>';
  }
  return h + '</div></section>';
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
    h += '<div class="reco"><span class="lbl">Véhicule recommandé</span><strong style="font-size:17px">'+esc(best.v.label)+'</strong><span class="muted">'+(best.v.dims!=='—'?'Caisse '+best.v.dims+' m · ':'')+(best.v.pal?best.v.pal+' pal. max · ':'')+best.v.kg+' kg max'+(best.v.hayon?' · transpalette comprise':'')+'</span><span class="price">'+eur(best.q.total)+' HT</span><span class="formula">'+esc(best.q.detail)+'</span><span class="muted" style="font-size:12.5px">'+(best.q.half?'½ journée : 4 h et '+best.q.kmi+' km inclus ; dépassement facturé à l\'heure jusqu\'à 2 h.':'Journée : 7 h et '+best.q.kmi+' km inclus.')+'</span><div><button class="btn pri" data-a="addTr"'+RO()+'>Ajouter à la facturation</button></div></div>';
  }
  h += '<div class="tw"><table><thead><tr><th>Véhicule</th><th>Compatibilité</th><th class="n">Montant HT</th></tr></thead><tbody>';
  rows.forEach(function(r){ h += '<tr'+(best&&r.v===best.v?' class="open"':'')+'><td>'+esc(r.v.label)+'</td><td>'+(r.ok?'<span class="pill p-ok">OK</span>':'<span class="muted">'+esc(r.why.join(' · '))+'</span>')+'</td><td class="n">'+n2(r.q.total)+'</td></tr>'; });
  h += '</tbody></table></div><p class="muted" style="font-size:12.5px;margin:0">Au-delà de 6 h, bascule en journée (dépassement ½ journée limité à 2 h). Véhicules sans dimensions dans la grille (Break, Fourgon 1300) : retenus seulement si la plus grande longueur ≤ 1 200 mm. Annotations manuscrites de la grille (semi, 26T…) non intégrées.</p></div></div>';
  box.innerHTML = h;
}

/* ---------- 5. Grilles & règles ---------- */
function vRules(){
  var c = ST.cfg, h = '<section class="view">';
  h += '<p class="note">'+(monthClosed() ? '<span class="pill p-ok">Figé</span> '+monthLabel(ST.month)+' est clôturé : les grilles affichées sont celles en vigueur à la clôture. Toute modification s\'applique aux mois ouverts.' : isAdmin() ? 'Les modifications sont enregistrées en base, tracées au journal et appliquées à tous les mois ouverts.' : 'Consultation seule : seuls les administrateurs modifient les grilles et les règles.')+'</p>';
  h += '<div class="panel"><div class="ph"><h2>Paramétrage par agence</h2><span class="muted">Process OTIS : AG 495 et 496 en cas 2, une facture par affaire avec les n° d\'appareils, sans annexe. AG 58 en cas 1, par contremaître. CRA (BU), NSA et Tours à paramétrer à l\'arrivée de leurs exports.</span></div><div class="tw"><table><thead><tr><th>Agence</th><th>Grille tarifaire</th><th>Une facture par</th><th>Process</th><th>Annexe détaillée</th></tr></thead><tbody>';
  var ags = {}; if (ST.R) ST.R.records.forEach(function(r){ if (r.ag) ags[r.ag] = r.agLabel; });
  Object.keys(c.agencies).forEach(function(a){ ags[a] = ags[a] || 'AG '+a; });
  Object.keys(ags).sort().forEach(function(a){
    var ac = c.agencies[a] || { grid:'STD', split:'cm', cas:2, annexe:false };
    h += '<tr><td>'+esc(ags[a])+'</td><td><select'+CFGRO()+' data-agcfg="'+a+'" data-f="grid">'+Object.keys(c.grids).map(function(g){ return '<option value="'+g+'"'+(ac.grid===g?' selected':'')+'>'+esc(c.grids[g].label)+'</option>'; }).join('')+'</select></td><td><select'+CFGRO()+' data-agcfg="'+a+'" data-f="split"><option value="affaire"'+(ac.split==='affaire'?' selected':'')+'>Affaire</option><option value="cm"'+(ac.split==='cm'?' selected':'')+'>Contremaître</option><option value="appareil"'+(ac.split==='appareil'?' selected':'')+'>Appareil (N° de commande)</option><option value="ag"'+(ac.split==='ag'?' selected':'')+'>Agence (facture unique)</option></select></td><td><select'+CFGRO()+' data-agcfg="'+a+'" data-f="cas"><option value="2"'+(ac.cas!=1?' selected':'')+'>Cas 2 · sans commande</option><option value="1"'+(ac.cas==1?' selected':'')+'>Cas 1 · devis puis commande</option></select></td><td><select'+CFGRO()+' data-agcfg="'+a+'" data-f="annexe"><option value="0"'+(!ac.annexe?' selected':'')+'>Non</option><option value="1"'+(ac.annexe?' selected':'')+'>Oui</option></select></td></tr>';
  });
  h += '</tbody></table></div></div>';
  h += '<div class="two">';
  Object.keys(c.grids).forEach(function(gk){
    var g = c.grids[gk];
    h += '<div class="panel"><div class="ph"><h3>'+esc(g.label)+'</h3></div><div class="pb tbl-in" style="display:grid;gap:12px"><div class="tw"><table><tbody>'+
      gRow(gk,'rate','Entrée / sortie, €/unité payante (> 0,500)',g.rate)+gRow(gk,'minChariot','Minimum chariot / transpalette (≥ 0,250 m³ ou > 20 kg)',g.minChariot)+gRow(gk,'minManuel','Minimum manuel (< 0,250 m³ et ≤ 20 kg)',g.minManuel);
    Object.keys(g.prices).forEach(function(t){ ['mois','quinz','sem'].forEach(function(p){ h += '<tr><td>Stockage '+t.toLowerCase()+' · '+({mois:'mois (≥ 22 j)',quinz:'quinzaine (14 j)',sem:'semaine (7 j)'})[p]+', €/m²</td><td class="n"><input type="number" step="any"'+CFGRO()+' data-gp="'+gk+'|'+t+'|'+p+'" value="'+g.prices[t][p]+'"></td></tr>'; }); });
    if (g.storeMode==='volume') g.coefs.forEach(function(cf,i){ h += '<tr><td>Coefficient volume → m², '+esc(cf.label)+'</td><td class="n"><input type="number" step="any"'+CFGRO()+' data-gc="'+gk+'|'+i+'" value="'+cf.coef+'"></td></tr>'; });
    else h += gRow(gk,'coefSurface','Coefficient sur surface au sol',g.coefSurface);
    h += gRow(gk,'min30','Minimum m² par appareil et par mois (0 = sans)',g.min30);
    h += '</tbody></table></div></div></div>';
  });
  h += '</div>';
  h += '<div class="panel"><div class="ph"><h2>Règles de calcul</h2><div class="sp">'+(isAdmin() && !monthClosed() ? '<button class="btn" data-a="reset">Revenir aux valeurs contractuelles</button>' : '')+'</div></div><div class="pb rules">';
  h += '<div class="grid-f"><div class="fld"><label class="lbl" for="r_up">Unité payante manutention</label><select id="r_up"'+CFGRO()+' data-rule="upMode"><option value="max"'+(c.rules.upMode==='max'?' selected':'')+'>max(m³ ; tonnes) — lecture « M3/T »</option><option value="vol"'+(c.rules.upMode==='vol'?' selected':'')+'>m³ seul (pratique Odoo)</option></select></div>'+
    '<div class="fld"><span class="lbl">Minimum 30 m² / appareil</span><label class="chk"><input type="checkbox"'+CFGRO()+' data-rule="min30"'+(c.rules.min30?' checked':'')+'>Appliquer</label></div></div>';
  h += '<ol>'+
    '<li><strong>Manutention (entrée ou sortie)</strong>, par colis et par mouvement : <code>UP = max(volume m³ ; poids t)</code> ; <code>montant = arrondi₂( max( taux × UP ; minimum ) )</code>. Minimum « manuel » si volume &lt; 0,250 m³ et poids ≤ 20 kg, sinon minimum « chariot ».</li>'+
    '<li><strong>Durée de stockage</strong> sur le mois : jours comptés bornes incluses, de max(entrée, 1<sup>er</sup> du mois) à min(sortie, dernier jour). Export stockage sans dates : entrée et sortie reprises des mouvements du fichier Manutention ; à défaut, colis présent tout le mois. Le nombre de jours Odoo n\'est utilisé que si aucune date n\'est exploitable (plafonné au mois).</li>'+
    '<li><strong>Tranche</strong> : 22 j et plus = mois ; 15 à 21 j = quinzaine + semaine ; 8 à 14 j = quinzaine ; 1 à 7 j = semaine.</li>'+
    '<li><strong>Surface facturée</strong> (grille 2022) : <code>volume × coefficient de sa tranche de volume</code> (≥ 1 m³ : 2,6832 ; 0,5–0,999 : 3,224 ; 0,25–0,499 : 3,744 ; &lt; 0,25 : 4,2952). Grille Tours : <code>surface au sol × 1,50</code>. <code>montant = arrondi₂(surface facturée × prix de la tranche)</code>.</li>'+
    '<li><strong>Minimum 30 m²</strong> : par agence et par appareil, somme des surfaces facturées au mois. Si inférieure à 30 m², complément <code>(30 − somme) × prix mois</code>, porté par le contremaître qui détient la plus grande surface.</li>'+
    '<li><strong>Affaire et appareil</strong> : le n° de commande Odoo se lit <code>APPAREIL / AFFAIRE</code> (ex. <code>45K1BZY5 / 45KRXI9F</code>). Si l\'affaire manque (retour chantier), elle est reprise de l\'appareil, puis de l\'historique du colis ; sinon la ligne est bloquée jusqu\'à saisie par l\'ADV. Une facture par agence et par affaire ; une ligne par famille et par appareil.</li>'+
    '<li><strong>Arrondis</strong> : au centime par ligne colis ; les totaux sont la somme des lignes arrondies. TVA 20 % sur le total HT.</li>'+
    '<li><strong>Exclusions</strong> : lignes sans client, dimensions nulles ou mouvement hors période ne sont jamais facturées. L\'ADV peut exclure toute ligne (case « Excl. ») ; l\'exclusion apparaît dans l\'export.</li>'+
  '</ol></div></div>';
  return h + '</section>';
}
function CFGRO(){ return isAdmin() && !monthClosed() ? '' : ' disabled'; }
function saveCfg(what){ ST.globalCfg = ST.cfg; STORE.saveConfig(ST.cfg, what).then(function(){ toast('Enregistré : '+what); }, function(e){ toast('Enregistrement impossible : '+e.message); }); rebuild(); if (canEdit()) persist(); }
function gRow(gk,f,l,v){ return '<tr><td>'+l+'</td><td class="n"><input type="number" step="any"'+CFGRO()+' data-g="'+gk+'|'+f+'" value="'+v+'"></td></tr>'; }
function noData(){ return '<section class="view">'+monthStrip()+'<div class="panel empty">Aucune donnée pour '+monthLabel(ST.month)+' : importer les exports Odoo du mois. <button class="btn sm" data-go="imp">Aller aux imports</button></div></section>'; }

/* ---------- Exports Excel ---------- */
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
function invSheet(I){
  var R = ST.R, rows = [['Facture', I.num], ['Période', monthLabel(R.month)], ['Client', 'OTIS CN · '+I.agLabel], [({affaire:'Affaire',cm:'Contremaître',appareil:'Appareil',ag:'Périmètre'})[I.split], I.sub], ['Contremaître(s)', Object.keys(I.cms).join(', ')], ['Appareils', Object.keys(I.appareils).sort().join(' · ')], ['Grille', ST.cfg.grids[I.grid].label], ['Process', (I.cas===1?'Cas 1 · devis à valider':'Cas 2 · sans commande client')+(I.annexe?' · avec annexe':' · sans annexe')], [], ['Désignation','Nb colis','Quantité','Unité','Montant HT']];
  FAM3.forEach(function(f){ var g = famAgg(I, f); rows.push([f.label + (g.minAmt ? ' (dont minimum 30 m² : '+n2(g.minAmt)+' €)' : ''), g.n, Math.round(g.qty*1000)/1000, f.unit, g.amount]); });
  rows.push([], ['Total HT','','','',I.totals.HT], ['TVA 20 %','','','',E.r2(I.totals.HT*0.2)], ['Total TTC','','','',E.r2(I.totals.HT*1.2)]);
  return XLSX.utils.aoa_to_sheet(rows);
}
function detailRows(I){
  var out = [];
  I.lineList.forEach(function(l){ l.keys.forEach(function(k){ var r = ST.R.byKey[k]; if (r.kind==='min30') out.push({ 'Facture':I.num, 'Famille':'Complément 30 m²', 'N° commande':r.cmd, 'Surface facturée m2':r.surf, 'Calcul':r.formula, 'Montant HT':r.amount }); else out.push(recRow(r, I)); }); });
  return out;
}
function canSave(){ return STORE.mode !== 'demo' || !!dl; }
function saveXlsx(wb, name){
  var buf = XLSX.write(wb, { bookType:'xlsx', type:'array' }), blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  STORE.log('export', name, ST.month);
  if (dl){ dl.save({ filename:name, data:blob }).then(function(){ toast('Fichier enregistré'); }, function(e){ if (e && e.code !== 'declined') toast('Export impossible : '+(e.message||e.code)); }); return; }
  if (STORE.mode === 'demo'){ toast('Téléchargement indisponible dans cette vue.'); return; }
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function exportOne(key){
  var I = ST.R.invoices.filter(function(x){ return x.key===key; })[0]; if (!I) return;
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, invSheet(I), 'Facture');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows(I)), I.annexe ? 'Annexe détail colis' : 'Justificatif interne');
  saveXlsx(wb, I.num+' '+I.sub.replace(/[^\w\- ]+/g,'')+'.xlsx');
}
function exportAll(ag){
  var R = ST.R, wb = XLSX.utils.book_new(), INV = R.invoices.filter(function(I){ return !ag || I.ag === ag; });
  var sum = INV.map(function(I){ return { 'Facture':I.num, 'Agence':I.agLabel, 'Affaire / périmètre':I.sub, 'Contremaître(s)':Object.keys(I.cms).join(', '), 'Appareils':Object.keys(I.appareils).sort().join(' · '), 'Entrées':I.totals.E, 'Sorties':I.totals.S, 'Stockage':E.r2(I.totals.STK+I.totals.MIN), 'dont minimum 30 m²':I.totals.MIN, 'Total HT':I.totals.HT, 'Statut':ST.done[I.key]?'Éditée':'À éditer', 'Manutention Odoo':I.odoo.M, 'Stockage Odoo':I.odoo.sHas?I.odoo.S:'' }; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sum), 'Synthèse');
  var det = []; INV.forEach(function(I){ det = det.concat(detailRows(I)); });
  var billedKeys = {}; det.forEach(function(d){ billedKeys[d['Fichier']+'#'+d['Ligne Excel']] = 1; });
  R.records.forEach(function(r){ if (!billedKeys[r.key] && (!ag || (r.eff ? r.eff.ag === ag : true))) det.push(recRow(r, null)); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(det), 'Détail toutes lignes');
  var an = []; R.anomalies.forEach(function(a){ a.keys.forEach(function(k){ var r = R.byKey[k]; an.push({ 'Gravité':SEV[a.sev], 'Contrôle':a.title, 'Fichier':r?r.file:'', 'Ligne Excel':r?r.line:'', 'N° colis':r?r.colis:'', 'N° BR':r?r.br:'', 'Contremaître':r&&r.eff?r.eff.cm:'' }); }); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(an), 'Contrôles');
  saveXlsx(wb, 'Facturation OTIS '+R.month+(ag?' AG '+ag:'')+'.xlsx');
}
function exportTr(){
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ST.transport.map(function(t){ return { 'Date':E.frDate(t.date), 'Agence':t.ag, 'Contremaître':t.cm, 'Appareil':t.cmd, 'Code postal':t.cp, 'Commune':t.ville, 'Zone':t.zone, 'Véhicule':t.veh, 'Calcul':t.detail, 'Montant HT':t.total }; })), 'Transports');
  saveXlsx(wb, 'Transports OTIS '+(ST.month||'')+'.xlsx');
}

/* ---------- 4. Contrôle des factures PDF ---------- */
var PST = { conforme:['p-ok','Conforme'], ecart:['p-bloquant','Écart'], non_rapprochee:['p-verifier','Non rapprochée'], illisible:['p-verifier','Illisible'], erreur:['p-bloquant','Erreur'] };
function famTotals(I){ return { E:I.totals.E, S:I.totals.S, STK:E.r2(I.totals.STK + I.totals.MIN) }; }
function pdfCtx(){
  var known = { affaires:{}, appareils:{} };
  ST.R.invoices.forEach(function(I){ if (I.split==='affaire') known.affaires[I.sub] = 1; Object.keys(I.appareils).forEach(function(a){ known.appareils[a] = 1; }); });
  return { known:known, invoices:ST.R.invoices, month:ST.month, famTotals:famTotals };
}
function vPdf(){
  var h = '<section class="view">' + monthStrip();
  if (!ST.R) return h + '<div class="panel empty">Importer d\'abord les exports Odoo de '+monthLabel(ST.month)+' : le contrôle compare chaque PDF à la facture calculée.</div></section>';
  var P = ST.pdfs, c = { conforme:0, ecart:0, non_rapprochee:0, illisible:0, erreur:0 }, byInv = {};
  P.forEach(function(p){ var st = p.result ? p.result.status : 'erreur'; c[st] = (c[st]||0)+1; if (p.result && p.result.invKey) (byInv[p.result.invKey] = byInv[p.result.invKey] || []).push(p); });
  var missing = ST.R.invoices.filter(function(I){ return !byInv[I.key]; });
  var dups = Object.keys(byInv).filter(function(k){ return byInv[k].length > 1; });
  h += '<div class="kpis">'+kpi('PDF contrôlés', P.length, '')+kpi('Conformes', c.conforme, '')+kpi('En écart', c.ecart, 'montant, affaire, appareils ou période')+kpi('Non rapprochés / illisibles', c.non_rapprochee + c.illisible + c.erreur, '')+kpi('Factures sans PDF', missing.length, 'sur '+ST.R.invoices.length+' calculées')+'</div>';
  h += '<div class="panel"><div class="ph"><h2>Factures émises à contrôler</h2><span class="muted">Chaque PDF est comparé à la facture calculée : affaire, agence, période, n° d\'appareils, Entrées, Sorties, Stockage, total HT, TVA, TTC (tolérance 0,01 €)</span><div class="sp">'+(P.length && role()!=='lecture' ? '<button class="btn" data-a="pdfRerun">Relancer le contrôle</button>' : '')+'</div></div><div class="pb" style="display:grid;gap:14px">';
  if (role() !== 'lecture') h += '<label class="drop" id="pdrop"><input type="file" id="pin" multiple accept="application/pdf,.pdf"><strong>Déposer les factures PDF ici</strong><span class="muted">PDF générés par le logiciel de facturation (pas de scans). Ils sont conservés en base avec le résultat du contrôle.</span><span class="btn sm">Choisir des PDF</span></label>';
  if (dups.length) h += '<p class="note"><span class="pill p-bloquant">Doublon</span> Plusieurs PDF pour la même facture : '+dups.map(function(k){ return esc(ST.R.invoices.filter(function(I){ return I.key===k; })[0].num); }).join(', ')+'.</p>';
  if (!P.length) h += '<div class="empty">Aucun PDF déposé pour '+monthLabel(ST.month)+'.</div>';
  else {
    h += '<div class="tw"><table><thead><tr><th>Fichier</th><th>N° facture (PDF)</th><th>Affaire</th><th>Facture calculée</th><th class="n">HT PDF</th><th class="n">HT calculé</th><th class="n">Écart</th><th>Statut</th><th></th></tr></thead><tbody>';
    P.forEach(function(p){
      var r = p.result || { status:'erreur', note:'Non analysé' }, I = r.invKey ? ST.R.invoices.filter(function(x){ return x.key===r.invKey; })[0] : null;
      var pht = r.parsed ? r.parsed.totalHT : null, cht = I ? I.totals.HT : null, d = (pht!==null && cht!==null) ? E.r2(pht - cht) : null;
      var stale = I && r.calcHT !== undefined && Math.abs(r.calcHT - I.totals.HT) > 0.005;
      var open = ST.openPdf === p.id;
      h += '<tr class="click'+(open?' open':'')+'" data-pdf="'+esc(p.id)+'"><td>'+(open?'▾ ':'▸ ')+esc(p.name)+'</td><td class="num">'+esc(r.parsed ? r.parsed.numero || '—' : '—')+'</td><td class="num">'+esc(r.parsed ? r.parsed.affaires.join(', ') || '—' : '—')+'</td><td class="num">'+esc(I ? I.num : '—')+'</td><td class="n">'+(pht===null?'—':n2(pht))+'</td><td class="n">'+(cht===null?'—':n2(cht))+'</td><td class="n">'+(d===null?'—':(d>0?'+':'')+n2(d))+'</td><td><span class="pill '+PST[r.status][0]+'">'+PST[r.status][1]+'</span>'+(stale?' <span class="pill p-verifier" title="Le calcul a changé depuis le contrôle">à relancer</span>':'')+'</td><td>'+(role()!=='lecture' ? '<button class="btn sm" data-pdfrm="'+esc(p.id)+'">Supprimer</button>' : '')+'</td></tr>';
      if (open) h += '<tr class="det"><td colspan="9"><div class="det-w">'+pdfDetail(p, r)+'</div></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  if (missing.length && P.length) h += '<details class="miss"><summary><span class="lbl">Factures calculées sans PDF ('+missing.length+')</span></summary><div class="tw"><table><tbody>'+missing.map(function(I){ return '<tr><td class="num">'+esc(I.num)+'</td><td>'+esc(I.agLabel)+'</td><td class="num">'+esc(I.sub)+'</td><td class="n">'+n2(I.totals.HT)+'</td></tr>'; }).join('')+'</tbody></table></div></details>';
  return h + '</div></div></section>';
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
  var m = ST.month, n = 0, chain = Promise.resolve();
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
  var m = ST.month, P = ST.pdfs.slice(), chain = Promise.resolve(), n = 0;
  ST.busy = 'Nouveau contrôle de '+P.length+' PDF…'; render();
  P.forEach(function(p){ chain = chain.then(function(){ return STORE.getPdfBytes(p).then(analyseBuf).then(function(r){ n++; var meta = { id:p.id, name:p.name, path:p.path, size:p.size, at:p.at, by:p.by }; return STORE.savePdfResult(m, meta, r); }); }); });
  chain.then(function(){ return STORE.listPdfs(m); }).then(function(L){ ST.busy=''; ST.pdfs = L; renderTop(); render(); toast(n+' PDF recontrôlé(s)'); }, function(e){ ST.busy=''; toast('Échec : '+e.message); render(); });
}
function removePdf(id){
  var p = ST.pdfs.filter(function(x){ return x.id===id; })[0]; if (!p) return;
  STORE.deletePdf(ST.month, p).then(function(){ return STORE.listPdfs(ST.month); }).then(function(L){ ST.pdfs = L; renderTop(); render(); toast('PDF supprimé'); }, function(e){ toast('Suppression impossible : '+e.message); });
}

/* ---------- 5. Synthèse mensuelle ---------- */
function synthRows(){
  var byId = {}; ST.months.forEach(function(m){ if (m.summary) byId[m.id] = { id:m.id, status:m.status, s:m.summary }; });
  if (ST.R) byId[ST.month] = { id:ST.month, status:(ST.monthDoc && ST.monthDoc.status) || 'ouvert', s:summarize(ST.R) };
  var keep = last18();
  return keep.slice().reverse().map(function(k){ return byId[k] || { id:k, status:'vide', s:null }; });
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

/* ---------- 8. Administration ---------- */
var LOGT = { login:'Connexion', login_failed:'Échec de connexion', logout:'Déconnexion', import:'Import Odoo', import_delete:'Suppression import', modification:'Modification facture', month_close:'Clôture du mois', month_reopen:'Réouverture du mois', export:'Export Excel', pdf_control:'Contrôle PDF', pdf_delete:'Suppression PDF', config:'Grilles / règles', user_create:'Création utilisateur', user_update:'Modification utilisateur', password_set:'Mot de passe défini', password_self:'Mot de passe changé', purge:'Purge > 18 mois' };
function loadAdmin(){
  if (!isAdmin()) return;
  if (ST.admTab === 'users' && !ST.users) STORE.listUsers().then(function(u){ ST.users = u.sort(function(a,b){ return (a.name||a.email).localeCompare(b.name||b.email); }); render(); }, function(e){ toast('Utilisateurs inaccessibles : '+e.message); });
  if (ST.admTab === 'logs' && !ST.logs) STORE.listLogs(500).then(function(l){ ST.logs = l; render(); }, function(e){ toast('Journal inaccessible : '+e.message); });
}
function adminAct(p, msg){ p.then(function(){ toast(msg); ST.users = null; loadAdmin(); }, function(e){ toast('Échec : '+(e.message||e)); }); }
function genPassword(){ var c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_!?', a = new Uint32Array(16), o = ''; crypto.getRandomValues(a); for (var i=0;i<16;i++) o += c[a[i] % c.length]; return o; }
function createUserFromForm(){
  var u = { name:$('nu_name').value.trim(), email:$('nu_email').value.trim().toLowerCase(), role:$('nu_role').value, password:$('nu_pw').value };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)){ toast('E-mail invalide'); return; }
  if (u.password.length < 12){ toast('Mot de passe : 12 caractères minimum'); return; }
  adminAct(STORE.createUser(u), 'Compte créé : '+u.email+' · communiquer le mot de passe par un autre canal que l\'e-mail');
}
function vAdmin(){
  if (!isAdmin()) return '<section class="view"><div class="panel empty">Réservé aux administrateurs.</div></section>';
  var h = '<section class="view"><nav class="subnav" role="tablist">'+[['users','Utilisateurs'],['logs','Journal de connexion et d\'activité'],['data','Données et conservation']].map(function(p){ return '<button class="subtab" role="tab" data-adm="'+p[0]+'" aria-selected="'+(ST.admTab===p[0])+'"><span class="st-l">'+p[1]+'</span></button>'; }).join('')+'</nav>';
  if (ST.admTab === 'users'){
    h += '<div class="panel"><div class="ph"><h2>Créer un compte</h2><span class="muted">Le compte est actif immédiatement. Mot de passe : 12 caractères minimum.</span></div><form class="pb" id="uform" autocomplete="off"><div class="grid-f">'+
      '<div class="fld"><label class="lbl" for="nu_name">Nom</label><input id="nu_name" type="text"></div>'+
      '<div class="fld"><label class="lbl" for="nu_email">E-mail</label><input id="nu_email" type="email"></div>'+
      '<div class="fld"><label class="lbl" for="nu_role">Rôle</label><select id="nu_role"><option value="adv">ADV : import, contrôles, factures</option><option value="lecture">Lecture seule</option><option value="admin">Administrateur</option></select></div>'+
      '<div class="fld"><label class="lbl" for="nu_pw">Mot de passe initial</label><div class="row"><input id="nu_pw" type="password" autocomplete="new-password"><button class="btn sm" type="button" data-a="genpw">Générer</button></div></div>'+
      '</div><div class="row" style="margin-top:12px"><button class="btn pri" type="button" data-a="ucreate">Créer le compte</button></div></form></div>';
    h += '<div class="panel"><div class="ph"><h2>Comptes</h2><div class="sp"><button class="btn sm" data-a="admReload">Actualiser</button></div></div>';
    if (!ST.users) h += '<div class="empty">Chargement…</div>';
    else {
      h += '<div class="tw"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Créé le</th><th></th></tr></thead><tbody>';
      ST.users.forEach(function(u){
        var me = ST.user && u.uid === ST.user.uid;
        h += '<tr'+(u.active?'':' class="zero"')+'><td>'+esc(u.name||'')+(me?' <span class="muted">(vous)</span>':'')+'</td><td>'+esc(u.email)+'</td><td><select data-urole="'+esc(u.uid)+'"'+(me?' disabled':'')+'>'+['admin','adv','lecture'].map(function(r){ return '<option value="'+r+'"'+(u.role===r?' selected':'')+'>'+({admin:'Administrateur',adv:'ADV',lecture:'Lecture seule'})[r]+'</option>'; }).join('')+'</select></td><td><span class="pill '+(u.active?'p-ok':'p-info')+'">'+(u.active?'Actif':'Désactivé')+'</span></td><td class="muted">'+(u.lastLogin?esc(new Date(u.lastLogin).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})):'jamais')+'</td><td class="muted">'+(u.createdAt?esc(new Date(u.createdAt).toLocaleDateString('fr-FR')):'')+'</td><td class="row">'+
          (me ? '' : '<button class="btn sm" data-uact="'+esc(u.uid)+'">'+(u.active?'Désactiver':'Réactiver')+'</button>')+'<button class="btn sm" data-upw="'+esc(u.uid)+'">Mot de passe</button></td></tr>';
        if (ST.pwFor === u.uid) h += '<tr class="det"><td colspan="7"><div class="row"><label class="lbl" for="pw_'+esc(u.uid)+'">Nouveau mot de passe pour '+esc(u.email)+'</label><input id="pw_'+esc(u.uid)+'" type="text" value="'+esc(genPassword())+'" style="font-family:var(--f-num);min-width:220px"><button class="btn pri sm" data-upwok="'+esc(u.uid)+'">Définir</button><span class="muted">Ses sessions ouvertes sont fermées.</span></div></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
  } else if (ST.admTab === 'logs'){
    h += '<div class="panel"><div class="ph"><h2>Journal</h2><span class="muted">Écrit côté serveur : horodatage, adresse IP et navigateur non modifiables · 500 derniers événements</span><div class="sp"><button class="btn sm" data-a="admReload">Actualiser</button><button class="btn sm" data-a="xlsLog"'+(canSave()&&ST.logs?'':' disabled')+'>Exporter (.xlsx)</button></div></div>';
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
    var ms = ST.months.slice().sort(function(a,b){ return b.id.localeCompare(a.id); }), keep = last18();
    h += '<div class="panel"><div class="ph"><h2>Mois enregistrés</h2><span class="muted">Conservation : 18 mois glissants. Les mois plus anciens (exports, PDF, décisions) sont supprimés automatiquement le 1er de chaque mois à 3 h.</span></div><div class="tw"><table><thead><tr><th>Mois</th><th>Statut</th><th class="n">Exports</th><th class="n">Total HT</th><th>Dernière modification</th><th>Conservation</th></tr></thead><tbody>'+
      ms.map(function(m){ return '<tr><td>'+monthLabel(m.id)+'</td><td>'+STATUS[m.status||'ouvert']+'</td><td class="n">'+((m.files||[]).length)+'</td><td class="n">'+(m.summary?n2(m.summary.HT):'—')+'</td><td class="muted">'+esc(m.updatedAt?new Date(m.updatedAt).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'')+' '+esc(m.updatedBy||'')+'</td><td>'+(keep.indexOf(m.id)>=0?'<span class="pill p-ok">conservé</span>':'<span class="pill p-verifier">purge au prochain passage</span>')+'</td></tr>'; }).join('')+
      (ms.length?'':'<tr><td colspan="6" class="empty">Aucun mois enregistré.</td></tr>')+'</tbody></table></div></div>';
    h += '<div class="panel pb note">Stockage : exports Odoo et PDF dans Cloud Storage (Europe), décisions de l\'ADV, clôtures, grilles et journal dans Firestore (Europe). Rien n\'est conservé dans le navigateur.</div>';
  }
  return h + '</section>';
}
function exportLogs(){ var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((ST.logs||[]).map(function(l){ return { 'Date':l.at, 'Utilisateur':l.email, 'Événement':LOGT[l.type]||l.type, 'Détail':l.detail, 'Mois':l.month||'', 'IP':l.ip||'', 'Navigateur':l.ua||'' }; })), 'Journal'); saveXlsx(wb, 'Journal plateforme OTIS.xlsx'); }

/* ---------- Mon compte ---------- */
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

/* ---------- événements ---------- */
document.addEventListener('click', function(e){
  var t = e.target.closest('[data-v],[data-go],[data-a],[data-inv],[data-line],[data-anom],[data-more],[data-sugg],[data-i],[data-trm],[data-merge],[data-ag],[data-done],[data-xinv],[data-pdf],[data-pdfrm],[data-adm],[data-urole],[data-uact],[data-upw],[data-upwok],[data-synag]');
  if (!t || t.disabled) return;
  if (t.dataset.v || t.dataset.go){ ST.view = t.dataset.v || t.dataset.go; if (ST.view==='adm' && !isAdmin()) ST.view = 'fac'; renderTop(); render(); window.scrollTo(0,0); if (ST.view==='adm') loadAdmin(); return; }
  if (t.dataset.ag){ ST.ag = t.dataset.ag; ST.openLine = null; render(); return; }
  if (t.dataset.synag){ ST.synAg = t.dataset.synag; render(); return; }
  if (t.dataset.adm){ ST.admTab = t.dataset.adm; render(); loadAdmin(); return; }
  if (t.dataset.xinv){ exportOne(t.dataset.xinv); return; }
  if (t.dataset.inv){ ST.inv = t.dataset.inv; ST.openLine = null; render(); return; }
  if (t.dataset.line){ ST.openLine = ST.openLine === t.dataset.line ? null : t.dataset.line; render(); return; }
  if (t.dataset.anom){ ST.openAnom[t.dataset.anom] = !ST.openAnom[t.dataset.anom]; render(); return; }
  if (t.dataset.more){ ST.lim[t.dataset.more] = (ST.lim[t.dataset.more]||150) + 500; render(); return; }
  if (t.dataset.pdf){ ST.openPdf = ST.openPdf === t.dataset.pdf ? null : t.dataset.pdf; render(); return; }
  if (t.dataset.pdfrm){ removePdf(t.dataset.pdfrm); return; }
  if (t.dataset.urole !== undefined && t.tagName === 'BUTTON'){ return; }
  if (t.dataset.uact){ var u = (ST.users||[]).filter(function(x){ return x.uid === t.dataset.uact; })[0]; if (u) adminAct(STORE.updateUser(u.uid, { active: !u.active }), (u.active?'Compte désactivé : ':'Compte réactivé : ')+u.email); return; }
  if (t.dataset.upw){ ST.pwFor = ST.pwFor === t.dataset.upw ? null : t.dataset.upw; render(); return; }
  if (t.dataset.upwok){ var pw = ($('pw_'+t.dataset.upwok)||{}).value || ''; adminAct(STORE.setPassword(t.dataset.upwok, pw), 'Mot de passe défini'); ST.pwFor = null; return; }
  if (!canEdit() && (t.dataset.done || t.dataset.sugg || t.dataset.merge || t.dataset.trm)) return;
  if (t.dataset.done){ var dk = t.dataset.done, on = !ST.done[dk]; if (on) ST.done[dk] = 1; else delete ST.done[dk]; render(); persist((on?'Facture éditée ':'Facture à rééditer ')+(ST.R.invoices.filter(function(I){ return I.key===dk; })[0]||{}).num); return; }
  if (t.dataset.sugg){ var r = ST.R.byKey[t.dataset.sugg]; if (r && r.suggest){ var s = r.suggest.t; ST.ov.assign[r.key] = { ag:s.ag, agLabel:s.agLabel, cm:s.cm, cmCode:s.cmCode }; delete ST.ov.exclude[r.key]; rebuild(); persist('Rattachement '+r.file+' l.'+r.line+' → '+s.cm); toast('Ligne rattachée à '+s.cm); } return; }
  if (t.dataset.merge){ var mp = t.dataset.merge.split('|'); if (ST.ov.affMap[mp[0]]===mp[1]) delete ST.ov.affMap[mp[0]]; else { ST.ov.affMap[mp[0]] = mp[1]; delete ST.ov.affMap[mp[1]]; } rebuild(); persist('Affaire '+mp[0]+' facturée sur '+mp[1]); toast('Correction d\'affaire appliquée'); return; }
  if (t.dataset.trm){ ST.transport.splice(+t.dataset.trm,1); render(); persist('Transport retiré'); return; }
  var a = t.dataset.a;
  if (a === 'rm' && canEdit()){ var f = ST.files[+t.dataset.i]; if (f && f.meta){ ST.busy = 'Suppression…'; render(); STORE.deleteImport(ST.month, f.meta).then(function(){ ST.busy=''; refreshMonths(); loadMonth(ST.month); }, function(e){ ST.busy=''; toast('Suppression impossible : '+e.message); render(); }); } }
  else if (a === 'pendGo'){ var items = ST.pending, m = t.dataset.m; upload(items, m); }
  else if (a === 'pendHere'){ upload(ST.pending, ST.month); }
  else if (a === 'pendNo'){ ST.pending = null; render(); }
  else if (a === 'close'){ ST.confirmClose = true; render(); }
  else if (a === 'closeNo'){ ST.confirmClose = false; render(); }
  else if (a === 'closeOk'){ closeMonth(); }
  else if (a === 'reopen' && isAdmin()){ reopenMonth(); }
  else if (a === 'xlsAll') exportAll();
  else if (a === 'xlsAg') exportAll(ST.ag);
  else if (a === 'xlsTr') exportTr();
  else if (a === 'xlsSyn') exportSynth();
  else if (a === 'xlsLog') exportLogs();
  else if (a === 'pdfRerun') rerunPdfs();
  else if (a === 'reset' && isAdmin()){ ST.cfg = clone(E.DEFAULT_CONFIG); saveCfg('Retour aux valeurs contractuelles'); }
  else if (a === 'addTr' && LAST_Q && canEdit()){ ST.transport.push({ date:tv('t_date'), ag:tv('t_ag'), cm:tv('t_cm'), cmd:tv('t_cmd'), cp:tv('t_cp'), ville:tv('t_ville'), zone:LAST_Q.zone, veh:LAST_Q.veh, detail:LAST_Q.detail, total:LAST_Q.total }); render(); persist('Transport ajouté '+tv('t_cp')+' '+LAST_Q.veh); toast('Transport ajouté'); }
  else if (a === 'ucreate') createUserFromForm();
  else if (a === 'genpw'){ var g = genPassword(), inp = $('nu_pw'); if (inp){ inp.value = g; inp.type = 'text'; } }
  else if (a === 'admReload') { ST.users = null; ST.logs = null; loadAdmin(); }
  else if (a === 'logout') logout('Déconnexion');
  else if (a === 'mypw') changeMyPassword();
});
document.addEventListener('change', function(e){
  var t = e.target;
  if (t.id === 'month'){ loadMonth(t.value); return; }
  if (t.id === 'lf_type' || t.id === 'lf_q'){ ST.logF.type = $('lf_type').value; ST.logF.q = $('lf_q').value; render(); return; }
  if (t.dataset.urole){ adminAct(STORE.updateUser(t.dataset.urole, { role: t.value }), 'Rôle modifié'); return; }
  if (t.dataset.aff || t.dataset.excl || t.dataset.assign){ if (!canEdit()){ render(); return; } }
  if (t.dataset.aff){ var ka = t.dataset.aff; delete ST.ov.affaire[ka]; delete ST.ov.exclude[ka]; if (t.value==='__EXCL__') ST.ov.exclude[ka]='Affaire inconnue : non facturée'; else if (t.value) ST.ov.affaire[ka]=t.value; rebuild(); persist('Affaire '+(t.value||'retirée')+' pour '+ka); return; }
  if (t.dataset.excl){ if (t.checked) ST.ov.exclude[t.dataset.excl] = 'Exclu par l\'ADV ('+(ST.user?ST.user.email:'')+')'; else delete ST.ov.exclude[t.dataset.excl]; rebuild(); persist((t.checked?'Exclusion ':'Réintégration ')+t.dataset.excl); return; }
  if (t.dataset.assign){ var k = t.dataset.assign, v = t.value; delete ST.ov.assign[k]; delete ST.ov.exclude[k];
    if (v === '__EXCL__') ST.ov.exclude[k] = 'Non rattachée : non facturée';
    else if (v){ var p = v.split('|'), ref = ST.R.records.filter(function(r){ return r.ag===p[0] && r.cm===p[1]; })[0]; ST.ov.assign[k] = { ag:p[0], agLabel:ref.agLabel, cm:p[1], cmCode:ref.cmCode }; }
    rebuild(); persist('Rattachement '+k+' → '+(v||'aucun')); return; }
  if (!isAdmin() || monthClosed()){ if (t.dataset.agcfg || t.dataset.g || t.dataset.gp || t.dataset.gc || t.dataset.rule){ render(); return; } }
  if (t.dataset.agcfg){ var ac = ST.cfg.agencies[t.dataset.agcfg] = ST.cfg.agencies[t.dataset.agcfg] || { grid:'STD', split:'cm' }; ac[t.dataset.f] = t.dataset.f==='cas' ? +t.value : t.dataset.f==='annexe' ? t.value==='1' : t.value; saveCfg('AG '+t.dataset.agcfg+' : '+t.dataset.f+' = '+t.value); return; }
  if (t.dataset.g){ var q = t.dataset.g.split('|'), x = parseFloat(t.value); if (!isNaN(x)){ ST.cfg.grids[q[0]][q[1]] = x; saveCfg(q[0]+' '+q[1]+' = '+x); } return; }
  if (t.dataset.gp){ var q2 = t.dataset.gp.split('|'), y = parseFloat(t.value); if (!isNaN(y)){ ST.cfg.grids[q2[0]].prices[q2[1]][q2[2]] = y; saveCfg(q2.join(' ')+' = '+y); } return; }
  if (t.dataset.gc){ var q3 = t.dataset.gc.split('|'), z = parseFloat(t.value); if (!isNaN(z)){ ST.cfg.grids[q3[0]].coefs[+q3[1]].coef = z; saveCfg('Coefficient '+q3.join(' ')+' = '+z); } return; }
  if (t.dataset.rule){ ST.cfg.rules[t.dataset.rule] = t.type==='checkbox' ? t.checked : t.value; saveCfg('Règle '+t.dataset.rule+' = '+(t.type==='checkbox' ? t.checked : t.value)); return; }
  if (t.closest('#tform')) calcTransport();
});
document.addEventListener('input', function(e){ if (e.target.closest && e.target.closest('#tform')) calcTransport(); });
document.addEventListener('submit', function(e){ e.preventDefault(); if (e.target.id === 'loginForm') doLogin(); });

/* ---------- session : connexion, inactivité ---------- */
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
  STORE.getConfig().then(function(c){ ST.globalCfg = c ? deepMerge(E.DEFAULT_CONFIG, c) : clone(E.DEFAULT_CONFIG); ST.cfg = ST.globalCfg; return STORE.listMonths(); })
    .then(function(L){
      ST.months = L;
      var withData = L.filter(function(m){ return (m.files||[]).length; }).map(function(m){ return m.id; }).sort();
      var d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1);
      var prev = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      loadMonth(withData.indexOf(prev) >= 0 ? prev : (withData[withData.length-1] || prev));
    }, function(e){ toast('Base de données inaccessible : '+e.message); });
}
STORE.onAuth(function(profile, msg){ if (profile) start(profile); else { ST.user = null; showLogin(msg); } });
if (window.claude && window.claude.use) window.claude.use('downloads').then(function(d){ dl = d; if (ST.view==='fac'||ST.view==='trp'||ST.view==='syn') render(); }, function(){ dl = null; });
})();
