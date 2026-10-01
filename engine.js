/* ==== MOTEUR DE CALCUL — Facturation logistique OTIS / LEGAA ====
   Fonctions pures, sans DOM. Toute règle est paramétrée dans CONFIG. */
var ENGINE = (function () {
  'use strict';

  var DEFAULT_CONFIG = {
    grids: {
      STD: {
        label: 'Grille OTIS 2022 (01/04/2022)',
        rate: 9.2664, minChariot: 4.888, minManuel: 3.796,
        storeMode: 'volume', // surface facturable = volume × coef(tranche)
        coefs: [ { min: 1, coef: 2.6832, label: '≥ 1,000 m³' }, { min: 0.5, coef: 3.224, label: '0,500 – 0,999 m³' },
                 { min: 0.25, coef: 3.744, label: '0,250 – 0,499 m³' }, { min: 0, coef: 4.2952, label: '< 0,250 m³' } ],
        coefSurface: null,
        prices: { 'Intérieur': { mois: 6.76, quinz: 3.38, sem: 1.768 } },
        min30: 30
      },
      TOURS: {
        label: 'Grille Tours The Link (01/01/2023)',
        rate: 8.71, minChariot: 4.65, minManuel: 3.68,
        storeMode: 'surface', // surface facturable = surface au sol × 1,50
        coefs: [], coefSurface: 1.5,
        prices: { 'Intérieur': { mois: 6.44, quinz: 3.30, sem: 1.73 }, 'Extérieur': { mois: 4.95, quinz: 2.54, sem: 1.33 } },
        min30: 0
      }
    },
    agencies: {
      '495': { grid: 'STD', split: 'affaire', cas: 2, annexe: false },
      '496': { grid: 'STD', split: 'affaire', cas: 2, annexe: false },
      '58':  { grid: 'STD', split: 'cm', cas: 1, annexe: false }
    },
    rules: {
      upMode: 'max',       // unité payante manutention : 'max' = max(m³, tonnes) | 'vol' = m³
      min30: true,         // minimum 30 m² / appareil / mois
      tiers: { mois: 22, quinzSem: 15, quinz: 8 } // J≥22 mois ; 15–21 quinzaine+semaine ; 8–14 quinzaine ; 1–7 semaine
    }
  };

  function r2(x) { return Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
  function num(v) { if (v === null || v === undefined || v === '') return NaN; if (typeof v === 'number') return v; return parseFloat(String(v).replace(',', '.')); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseDate(v) {
    if (v === null || v === undefined || v === '' || v === false) return null;
    if (v instanceof Date) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    if (typeof v === 'number') { var d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    var s = String(v).trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(+m[2]) + '-' + pad(+m[1]); }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    return null;
  }
  function dayNum(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000; }
  function monthBounds(ym) { var p = ym.split('-'), y = +p[0], m = +p[1]; var last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { start: ym + '-01', end: ym + '-' + pad(last), len: last }; }
  function frDate(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

  var HEAD = {
    client: ['client'], cmCode: ['code contremaitre'], br: ['n de br'], cmd: ['n de commande'], colis: ['n de colis', 'n colis'],
    date: ['date'], op: ['type d operation'], produit: ['produit'], L: ['longueur mm'], l: ['largeur mm'], h: ['hauteur mm'],
    kg: ['poids brut kg'], surf: ['surface m2'], vol: ['volume m3'], prix: ['prix'], stype: ['type de stockage'],
    de: ['date d entree'], ds: ['date de sortie'], jours: ['nombre de jour en stock']
  };

  function parseClient(v) {
    if (v === false || v === null || v === undefined || String(v).trim() === '' || String(v).trim().toLowerCase() === 'false') return null;
    var s = String(v).trim(), m = s.match(/AG\s*(\d+)\s*([^,]*),\s*(.+)$/i);
    if (!m) return { ag: null, agLabel: s, cm: s };
    return { ag: m[1], agLabel: ('AG ' + m[1] + ' ' + m[2]).trim(), cm: m[3].trim() };
  }
  function normCmd(v) {
    var s = String(v === null || v === undefined ? '' : v).trim().toUpperCase().replace(/\s+/g, ' ');
    var m = s.match(/^([0-9A-Z]{6,})\s*[\/\-]\s*([0-9A-Z]{5,})$/);
    return m ? m[1] + ' / ' + m[2] : (s || '(sans n° de commande)');
  }
  // N° de commande Odoo = « APPAREIL / AFFAIRE » (ex. 45K1BZY5 / 45KRXI9F), suffixes éventuels ignorés
  function parseCmd(raw) {
    var s = String(raw === null || raw === undefined ? '' : raw).trim().toUpperCase().replace(/\s+/g, ' ');
    var m = s.match(/^(.+?)\s*[\/\-]\s*([0-9A-Z]{6,10})\b\s*(.*)$/);
    if (m && !/^RETOUR/.test(s)) return { appareil: m[1].trim(), affaire: m[2], suffix: m[3].replace(/^[\/\s(]+|[)\s]+$/g, ''), fmt: /^[0-9A-Z]{6,}$/.test(m[1].trim()) };
    if (/^[0-9A-Z]{7,10}$/.test(s)) return { appareil: s, affaire: null, suffix: '', fmt: true };
    return { appareil: null, affaire: null, suffix: s, fmt: false };
  }
  function isAppareil(c) { return /^[0-9A-Z]{6,} \/ [0-9A-Z]{5,}$/.test(c) || /^[0-9A-Z]{8,}$/.test(c); }

  /* ---- Lecture d'un fichier Odoo (tableau de lignes, 1re ligne = en-têtes) ---- */
  function parseFile(name, rows) {
    var hdr = (rows[0] || []).map(norm), idx = {};
    Object.keys(HEAD).forEach(function (k) { idx[k] = -1; HEAD[k].forEach(function (h) { var i = hdr.indexOf(h); if (i >= 0 && idx[k] < 0) idx[k] = i; }); });
    var kind = idx.op >= 0 ? 'manut' : (idx.jours >= 0 ? 'stock' : null);
    if (!kind) return { name: name, error: 'Format non reconnu : ni colonne « type d\'opération » (Manutention) ni « Nombre de jour en stock » (Stockage).' };
    var fmt = kind === 'stock' ? (idx.de >= 0 && idx.ds >= 0 ? 'A' : 'B') : 'A';
    var missing = [];
    ['client', 'cmCode', 'br', 'cmd', 'colis', 'produit', 'L', 'l', 'h', 'kg', 'surf', 'vol'].forEach(function (k) { if (idx[k] < 0) missing.push(HEAD[k][0]); });
    if (kind === 'manut') { if (idx.date < 0) missing.push('date'); }
    var recs = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i]; if (!r || r.every(function (x) { return x === null || x === undefined || x === ''; })) continue;
      var g = function (k) { return idx[k] >= 0 ? r[idx[k]] : null; };
      var c = parseClient(g('client'));
      var rec = {
        key: name + '#' + (i + 1), file: name, line: i + 1, kind: kind, fmt: fmt,
        clientRaw: g('client') === false ? 'False' : String(g('client') === null ? '' : g('client')),
        ag: c ? c.ag : null, agLabel: c ? c.agLabel : null, cm: c ? c.cm : null,
        cmCode: g('cmCode') === null || g('cmCode') === undefined ? '' : String(g('cmCode')).replace(/\.0$/, ''),
        br: String(g('br') === null || g('br') === undefined ? '' : g('br')), cmdRaw: String(g('cmd') === null || g('cmd') === undefined ? '' : g('cmd')), cmd: normCmd(g('cmd')),
        colis: g('colis') === null || g('colis') === undefined || g('colis') === '' ? '' : String(g('colis')),
        produit: String(g('produit') || ''), L: num(g('L')), l: num(g('l')), h: num(g('h')), kg: num(g('kg')), surf: num(g('surf')), vol: num(g('vol')),
        odooPrix: num(g('prix'))
      };
      var pc = parseCmd(g('cmd')); rec.appareil = pc.appareil; rec.affaireCmd = pc.affaire; rec.cmdSuffix = pc.suffix;
      if (kind === 'manut') { rec.date = parseDate(g('date')); var o = norm(g('op')); rec.op = o.indexOf('entree') >= 0 ? 'E' : (o.indexOf('sortie') >= 0 ? 'S' : '?'); rec.opRaw = String(g('op') || ''); }
      else { rec.stype = g('stype') ? String(g('stype')).trim() : 'Intérieur'; rec.de = parseDate(g('de')); rec.ds = parseDate(g('ds')); rec.odooJours = num(g('jours')); }
      recs.push(rec);
    }
    return { name: name, kind: kind, fmt: fmt, records: recs, missing: missing, agences: uniq(recs.map(function (x) { return x.agLabel; }).filter(Boolean)) };
  }
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  function detectMonth(files) {
    var c = {};
    files.forEach(function (f) { (f.records || []).forEach(function (r) { var d = r.date || r.ds || r.de; if (d) { var k = d.slice(0, 7); c[k] = (c[k] || 0) + 1; } }); });
    var best = null; Object.keys(c).forEach(function (k) { if (!best || c[k] > c[best]) best = k; }); return best;
  }

  function coefFor(grid, vol) { for (var i = 0; i < grid.coefs.length; i++) if (vol >= grid.coefs[i].min) return grid.coefs[i]; return grid.coefs[grid.coefs.length - 1]; }
  function tierFor(days, t) { return days >= t.mois ? 'mois' : days >= t.quinzSem ? 'quinzSem' : days >= t.quinz ? 'quinz' : days >= 1 ? 'sem' : 'none'; }
  var TIER_LABEL = { mois: 'Mois', quinzSem: 'Quinzaine + semaine', quinz: 'Quinzaine', sem: 'Semaine', none: 'Non facturé (0 j)' };
  function tierPrice(p, tier) { return tier === 'mois' ? p.mois : tier === 'quinzSem' ? r4(p.quinz + p.sem) : tier === 'quinz' ? p.quinz : tier === 'sem' ? p.sem : 0; }
  function r4(x) { return Math.round(x * 10000) / 10000; }

  /* ---- Calcul complet d'un mois ---- */
  function build(files, cfg, ov, month) {
    ov = ov || { assign: {}, exclude: {} };
    var mb = monthBounds(month), m0 = dayNum(mb.start), m1 = dayNum(mb.end);
    var all = [], anomalies = [], A = {};
    function anom(code, sev, title, explain) { if (!A[code]) { A[code] = { code: code, sev: sev, title: title, explain: explain, keys: [], note: '' }; anomalies.push(A[code]); } return A[code]; }

    files.forEach(function (f) { if (f.records) f.records.forEach(function (r) { all.push(r); }); });

    // Référentiel contremaîtres (code -> agence/nom) et BR -> contremaître
    var byCode = {}, byBR = {}, nameCodes = {};
    all.forEach(function (r) {
      if (!r.ag) return;
      if (r.cmCode) { byCode[r.cmCode] = byCode[r.cmCode] || { ag: r.ag, agLabel: r.agLabel, cm: r.cm, cmCode: r.cmCode }; }
      if (r.br) byBR[r.br] = byBR[r.br] || { ag: r.ag, agLabel: r.agLabel, cm: r.cm, cmCode: r.cmCode };
      var nk = r.ag + '|' + r.cm; nameCodes[nk] = nameCodes[nk] || {}; nameCodes[nk][r.cmCode || '(vide)'] = (nameCodes[nk][r.cmCode || '(vide)'] || 0) + 1;
    });

    // Application des rattachements manuels + détection des lignes non rattachées
    all.forEach(function (r) {
      r.assigned = null; r.suggest = null; r.excluded = !!ov.exclude[r.key]; r.exclReason = ov.exclude[r.key] || '';
      var a = ov.assign[r.key];
      if (a) { r.assigned = a; r.eff = { ag: a.ag, agLabel: a.agLabel, cm: a.cm, cmCode: a.cmCode }; }
      else if (r.ag) r.eff = { ag: r.ag, agLabel: r.agLabel, cm: r.cm, cmCode: r.cmCode };
      else {
        r.eff = null;
        var s = (r.cmCode && byCode[r.cmCode]) ? { via: 'code contremaître ' + r.cmCode, t: byCode[r.cmCode] } : (r.br && byBR[r.br]) ? { via: 'N° de BR ' + r.br, t: byBR[r.br] } : null;
        r.suggest = s;
        anom('NON_RATTACHE', 'bloquant', 'Lignes sans client (Client = « False » dans Odoo)',
          'Odoo n\'a pas renseigné le client. Ces lignes sont exclues des factures tant qu\'elles ne sont pas rattachées à une agence et un contremaître.').keys.push(r.key);
      }
    });

    // Code contremaître incohérent : même nom, plusieurs codes
    Object.keys(nameCodes).forEach(function (nk) {
      var codes = Object.keys(nameCodes[nk]); if (codes.length > 1) {
        var a = anom('CODE_CM', 'verifier', 'Contremaître avec plusieurs codes', 'Un même contremaître apparaît avec des codes différents selon les lignes. La facture est regroupée par nom ; corriger la fiche dans Odoo.');
        a.note += (a.note ? ' · ' : '') + nk.split('|')[1] + ' : ' + codes.map(function (c) { return c + ' (' + nameCodes[nk][c] + ' l.)'; }).join(', ');
        var major = codes.sort(function (x, y) { return nameCodes[nk][y] - nameCodes[nk][x]; })[0];
        all.forEach(function (r) { if (r.ag && r.ag + '|' + r.cm === nk && (r.cmCode || '(vide)') !== major) a.keys.push(r.key); });
      }
    });

    var M = all.filter(function (r) { return r.kind === 'manut'; });
    var S = all.filter(function (r) { return r.kind === 'stock'; });

    // ---- AFFAIRE / APPAREIL ----
    var apToAff = {}, colisToAff = {}, affAg = {};
    all.forEach(function (r) {
      if (r.appareil && r.affaireCmd) { var o = apToAff[r.appareil] = apToAff[r.appareil] || {}; o[r.affaireCmd] = (o[r.affaireCmd] || 0) + 1; }
      if (r.colis && r.affaireCmd) colisToAff[r.colis] = r.affaireCmd;
    });
    function topKey(o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; })[0]; }
    Object.keys(apToAff).forEach(function (ap) {
      var ks = Object.keys(apToAff[ap]); if (ks.length < 2) return; var maj = topKey(apToAff[ap]);
      var a = anom('AFFAIRE_MULTI', 'verifier', 'Même appareil rattaché à plusieurs affaires', 'Un n° d\'appareil apparaît avec deux n° d\'affaire différents : probable faute de saisie dans Odoo. Les lignes sont facturées sur l\'affaire indiquée ; corriger la commande si besoin.');
      a.note += (a.note ? ' · ' : '') + ap + ' : ' + ks.map(function (k) { return k + ' (' + apToAff[ap][k] + ' l.)'; }).join(', ');
      a.merge = a.merge || []; a.merge.push(ks);
      all.forEach(function (r) { if (r.appareil === ap && r.affaireCmd !== maj) a.keys.push(r.key); });
    });
    var ovAff = ov.affaire || {}, affMap = ov.affMap || {};
    all.forEach(function (r) {
      r.affSrc = '';
      if (ovAff[r.key]) { r.affaire = ovAff[r.key]; r.affSrc = 'Saisie ADV'; }
      else if (r.affaireCmd) { r.affaire = r.affaireCmd; r.affSrc = 'N° de commande'; }
      else if (r.appareil && apToAff[r.appareil]) { r.affaire = topKey(apToAff[r.appareil]); r.affSrc = 'Déduite de l\'appareil'; }
      else if (r.colis && colisToAff[r.colis]) { r.affaire = colisToAff[r.colis]; r.affSrc = 'Déduite du n° de colis'; }
      else r.affaire = null;
      if (r.affaire && affMap[r.affaire] && r.affSrc !== 'Saisie ADV') { r.affaire = affMap[r.affaire]; r.affSrc = 'Corrigée ADV (' + r.affSrc + ')'; }
      if (r.affaireCmd && !/^[0-9A-Z]{8}$/.test(r.affaireCmd)) { var af = anom('AFFAIRE_FORMAT', 'verifier', 'N° d\'affaire au format anormal', 'Les n° d\'affaire OTIS comptent 8 caractères. Un code plus court ou plus long signale une saisie tronquée dans Odoo, qui éclate l\'affaire sur deux factures.'); af.keys.push(r.key); if (af.note.indexOf(r.affaireCmd) < 0) af.note += (af.note ? ' · ' : '') + r.affaireCmd; }
      r.apLabel = r.appareil || r.cmdSuffix || '(sans n° de commande)';
      if (r.affSrc.indexOf('Déduite') === 0) anom('AFFAIRE_DEDUITE', 'info', 'Affaire déduite (absente du n° de commande)', 'Le n° de commande ne porte pas l\'affaire (retour chantier, saisie incomplète) : elle est retrouvée par l\'appareil ou par l\'historique du colis.').keys.push(r.key);
      if (r.eff && r.affaire) { affAg[r.affaire] = affAg[r.affaire] || {}; affAg[r.affaire][r.eff.agLabel] = 1; }
      if (r.cmdSuffix && r.appareil) { var an = anom('CMD_SUFFIXE', 'info', 'N° de commande avec mention complémentaire', 'Texte ajouté après l\'affaire dans Odoo (repère, lot…). Ignoré pour le rattachement.'); an.keys.push(r.key); if (an.note.indexOf(r.cmdRaw) < 0 && an.note.length < 300) an.note += (an.note ? ' · ' : '') + r.cmdRaw; }
    });
    Object.keys(affAg).forEach(function (af) { var ags = Object.keys(affAg[af]); if (ags.length > 1) { var a = anom('AFFAIRE_MULTI_AG', 'info', 'Affaire présente sur plusieurs agences', 'Une facture est émise par agence ; l\'affaire apparaît donc sur plusieurs factures.'); a.note += (a.note ? ' · ' : '') + af + ' : ' + ags.join(', '); all.forEach(function (r) { if (r.affaire === af) a.keys.push(r.key); }); } });
    function needsAff(r) { return r.eff && (cfg.agencies[r.eff.ag] || {}).split === 'affaire'; }

    // Contrôles dimensionnels communs
    all.forEach(function (r) {
      var v = r.L * r.l * r.h / 1e9, s = r.L * r.l / 1e6;
      if (!(r.vol > 0) || !(r.L > 0) || !(r.l > 0) || !(r.h > 0)) anom('DIM_NULLE', 'bloquant', 'Dimensions ou volume nuls', 'Impossible de calculer un montant sans volume. Corriger la fiche colis dans Odoo.').keys.push(r.key);
      else if (Math.abs(v - r.vol) > 0.0005 || Math.abs(s - r.surf) > 0.0005) anom('DIM_INCOH', 'verifier', 'Volume ou surface ≠ L × l × h', 'Le volume Odoo ne correspond pas aux dimensions. Le calcul utilise le volume Odoo.').keys.push(r.key);
      if (!(r.kg >= 0)) anom('POIDS', 'verifier', 'Poids absent', 'Poids non renseigné : le minimum « chariot » et l\'unité payante tonnes ne peuvent pas être vérifiés.').keys.push(r.key);
    });

    // ---- MANUTENTION ----
    var mvByColis = {};
    M.forEach(function (r) {
      if (!r.colis) anom('COLIS_VIDE', 'verifier', 'Mouvement sans N° de colis', 'Mouvement facturé mais non traçable jusqu\'au colis ; impossible de le rapprocher du stock.').keys.push(r.key);
      else { mvByColis[r.colis] = mvByColis[r.colis] || []; mvByColis[r.colis].push(r); }
      if (!r.date || r.date.slice(0, 7) !== month) anom('HORS_MOIS', 'verifier', 'Mouvement hors du mois facturé', 'La date du mouvement n\'est pas dans la période. Ligne non facturée.').keys.push(r.key);
      if (r.op === '?') anom('OP_INCONNUE', 'bloquant', 'Type d\'opération non reconnu', 'Ni « Entrée » ni « Sortie ».').keys.push(r.key);
    });
    Object.keys(mvByColis).forEach(function (c) {
      var L = mvByColis[c], e = L.filter(function (x) { return x.op === 'E'; }), s = L.filter(function (x) { return x.op === 'S'; });
      if (e.length > 1 || s.length > 1) { var a = anom('DOUBLE_MVT', 'verifier', 'Même colis, même opération, plusieurs fois dans le mois', 'Deux entrées ou deux sorties du même colis sans mouvement inverse. Vérifier s\'il s\'agit d\'un retour (à facturer) ou d\'un doublon Odoo (à exclure).'); (e.length > 1 ? e : []).concat(s.length > 1 ? s : []).forEach(function (x) { a.keys.push(x.key); }); }
    });
    M.forEach(function (r) {
      var agc = r.eff && cfg.agencies[r.eff.ag]; var grid = cfg.grids[(agc && agc.grid) || 'STD'];
      r.grid = (agc && agc.grid) || 'STD';
      r.t = (r.kg >= 0 ? r.kg : 0) / 1000;
      r.up = cfg.rules.upMode === 'max' ? Math.max(r.vol, r.t) : r.vol;
      r.upBy = cfg.rules.upMode === 'max' && r.t > r.vol ? 't' : 'm³';
      r.minCat = (r.vol < 0.25 && r.kg <= 20) ? 'manuel' : 'chariot';
      r.minVal = r.minCat === 'manuel' ? grid.minManuel : grid.minChariot;
      r.base = r2(r.up * grid.rate); r.rate = grid.rate;
      r.amount = r2(Math.max(r.base, r.minVal)); r.applied = r.base >= r.minVal ? 'taux' : 'minimum';
      r.billable = !!r.eff && !r.excluded && r.op !== '?' && r.date && r.date.slice(0, 7) === month && r.vol > 0;
      r.formula = r.applied === 'taux' ? grid.rate + ' × ' + fmt3(r.up) + ' ' + r.upBy + ' = ' + r.base.toFixed(2)
        : 'max(' + grid.rate + ' × ' + fmt3(r.up) + ' ' + r.upBy + ' = ' + r.base.toFixed(2) + ' ; min. ' + r.minCat + ' ' + r.minVal + ')';
    });

    // Écart tarifaire Odoo (manutention)
    var odooM = M.filter(function (r) { return r.billable && r.odooPrix >= 0; });
    if (odooM.length) {
      var rates = {}, mins = {};
      odooM.forEach(function (r) { if (r.vol > 0) { var q = Math.round(r.odooPrix / r.vol * 100) / 100; if (r.odooPrix !== 0 && Math.abs(r.odooPrix / r.vol - q) < 1e-6 && r.vol >= 0.5) rates[q] = (rates[q] || 0) + 1; else mins[r2(r.odooPrix)] = (mins[r2(r.odooPrix)] || 0) + 1; } });
      var diff = odooM.filter(function (r) { return Math.abs(r.odooPrix - r.amount) > 0.005; });
      if (diff.length) {
        var at = anom('TARIF_ODOO', 'info', 'Prix Odoo ≠ grille contractuelle (manutention)', 'Odoo valorise les mouvements avec un paramétrage différent de la grille. La plateforme applique la grille ; la colonne « Prix Odoo » reste visible pour contrôle.');
        var topMin = Object.keys(mins).sort(function (x, y) { return mins[y] - mins[x]; })[0];
        at.note = 'Odoo : ' + Object.keys(rates).map(function (k) { return k.replace('.', ',') + ' €/m³'; }).join(', ') + (topMin ? ', minimum ' + String(topMin).replace('.', ',') + ' € (' + mins[topMin] + ' l.)' : '') + ', unité = m³ seul. Grille : 9,2664 €/m³ (m³/t), minimum 4,89 € (chariot) / 3,80 € (manuel).';
        diff.forEach(function (r) { at.keys.push(r.key); });
      }
    }

    // ---- STOCKAGE ----
    var stockByFileColis = {};
    S.forEach(function (r) { var k = r.file + '|' + r.colis; stockByFileColis[k] = (stockByFileColis[k] || 0) + 1; });
    S.forEach(function (r) {
      var agc = r.eff && cfg.agencies[r.eff.ag]; var gk = (agc && agc.grid) || 'STD', grid = cfg.grids[gk]; r.grid = gk;
      var start, end, src;
      if (r.fmt === 'A') {
        if (!r.de) { anom('DATE_ENTREE', 'bloquant', 'Date d\'entrée absente', 'Durée de stockage incalculable.').keys.push(r.key); r.days = 0; src = '—'; }
        else {
          start = r.de < mb.start ? mb.start : r.de; end = r.ds ? (r.ds > mb.end ? mb.end : r.ds) : mb.end;
          r.days = Math.max(0, dayNum(end) - dayNum(start) + 1); src = 'Dates Odoo';
          r.pStart = start; r.pEnd = end;
          if (r.ds && r.ds < r.de) anom('SORTIE_AVANT_ENTREE', 'bloquant', 'Date de sortie antérieure à l\'entrée', 'Données Odoo incohérentes.').keys.push(r.key);
          // sortie datée en stock mais aucun mouvement de sortie dans le fichier Manutention
          if (r.ds && r.ds >= mb.start && r.ds <= mb.end) {
            var mv = (mvByColis[r.colis] || []).filter(function (x) { return x.op === 'S'; });
            if (!mv.length) anom('SORTIE_NON_MVT', 'verifier', 'Sortie de stock sans mouvement de sortie facturé', 'Le fichier Stockage indique une sortie dans le mois, mais le fichier Manutention ne contient aucune sortie pour ce colis : sortie non facturée en manutention, ou date de sortie erronée dans Odoo.').keys.push(r.key);
          }
        }
      } else {
        var multi = stockByFileColis[r.file + '|' + r.colis] > 1;
        var mv2 = mvByColis[r.colis] || [];
        var e = mv2.filter(function (x) { return x.op === 'E' && x.date && x.date.slice(0, 7) === month; }).map(function (x) { return x.date; }).sort();
        var s = mv2.filter(function (x) { return x.op === 'S' && x.date && x.date.slice(0, 7) === month; }).map(function (x) { return x.date; }).sort();
        start = e.length ? e[0] : mb.start; end = s.length ? s[s.length - 1] : mb.end;
        if (multi || end < start) {
          r.days = Math.min(isNaN(r.odooJours) ? 0 : r.odooJours, mb.len); src = 'Jours Odoo (non vérifiables)';
          anom('STOCK_MULTI', 'verifier', 'Colis présent sur plusieurs lignes de stock sans dates', 'Export sans dates d\'entrée/sortie et plusieurs périodes pour le même colis : la durée Odoo est reprise (plafonnée au mois) sans pouvoir être vérifiée.').keys.push(r.key);
        } else { r.days = dayNum(end) - dayNum(start) + 1; src = 'Reconstruit (mouvements)'; r.pStart = start; r.pEnd = end; }
      }
      r.daysSrc = src;
      if (!isNaN(r.odooJours) && r.odooJours > mb.len) anom('JOURS_SUP_MOIS', 'verifier', 'Jours Odoo supérieurs à la durée du mois', 'Odoo compte plus de jours que le mois n\'en contient. Valeur remplacée par le calcul.').keys.push(r.key);
      if (!isNaN(r.odooJours) && r.daysSrc.indexOf('Jours Odoo') < 0 && r.odooJours !== r.days) {
        var tO = tierFor(Math.min(r.odooJours, mb.len), cfg.rules.tiers), tC = tierFor(r.days, cfg.rules.tiers);
        anom(tO !== tC ? 'JOURS_TRANCHE' : 'JOURS_ECART', tO !== tC ? 'verifier' : 'info',
          tO !== tC ? 'Jours Odoo faux, avec changement de tranche tarifaire' : 'Jours Odoo faux, sans impact tarifaire',
          'Le nombre de jours Odoo diffère du calcul par dates (' + (r.fmt === 'A' ? 'entrée → sortie, bornes incluses' : 'reconstruit depuis les mouvements') + '). La plateforme retient le calcul.').keys.push(r.key);
      }
      r.tier = tierFor(r.days, cfg.rules.tiers);
      var p = grid.prices[r.stype] || grid.prices['Intérieur'];
      if (!grid.prices[r.stype]) anom('TYPE_STOCK', 'info', 'Type de stockage absent ou non tarifé', 'Tarif « Intérieur » appliqué par défaut.').keys.push(r.key);
      r.pu = tierPrice(p, r.tier);
      if (grid.storeMode === 'volume') { var c = coefFor(grid, r.vol); r.coef = c.coef; r.coefLabel = c.label; r.surfFact = r.vol * c.coef; r.surfFormula = fmt3(r.vol) + ' m³ × ' + c.coef; }
      else { r.coef = grid.coefSurface; r.coefLabel = 'surface × ' + grid.coefSurface; r.surfFact = r.surf * grid.coefSurface; r.surfFormula = fmt3(r.surf) + ' m² × ' + grid.coefSurface; }
      r.amount = r2(r.surfFact * r.pu);
      r.formula = r.surfFormula + ' = ' + fmt3(r.surfFact) + ' m² × ' + r.pu + ' (' + TIER_LABEL[r.tier] + ', ' + r.days + ' j)';
      r.billable = !!r.eff && !r.excluded && r.days > 0 && r.vol > 0;
    });

    // Affaire obligatoire quand l'agence est facturée par affaire
    M.concat(S).forEach(function (r) {
      if (needsAff(r) && !r.affaire) { anom('AFFAIRE_INCONNUE', 'bloquant', 'Affaire non identifiée', 'L\'agence est facturée par affaire, mais ni le n° de commande, ni l\'appareil, ni le colis ne permettent de retrouver l\'affaire. Choisir l\'affaire, sinon la ligne n\'est pas facturée.').keys.push(r.key); r.billable = false; }
    });

    // ---- MINIMUM 30 m² / appareil / mois ----
    var mins = [];
    if (cfg.rules.min30) {
      var grp = {};
      S.forEach(function (r) {
        if (!r.billable || r.tier !== 'mois') return; var g = cfg.grids[r.grid]; if (!g.min30) return;
        var k = r.eff.ag + '|' + r.apLabel; grp[k] = grp[k] || { ag: r.eff.ag, agLabel: r.eff.agLabel, apLabel: r.apLabel, affaire: r.affaire, cmd: r.cmd, surf: 0, byCm: {}, keys: [], grid: r.grid };
        grp[k].surf += r.surfFact; grp[k].keys.push(r.key);
        var ck = r.eff.cm; grp[k].byCm[ck] = grp[k].byCm[ck] || { s: 0, eff: r.eff }; grp[k].byCm[ck].s += r.surfFact;
      });
      Object.keys(grp).forEach(function (k) {
        var g = grp[k], G = cfg.grids[g.grid]; if (g.surf >= G.min30) return;
        var best = null; Object.keys(g.byCm).forEach(function (c) { if (!best || g.byCm[c].s > best.s) best = g.byCm[c]; });
        var comp = G.min30 - g.surf, pu = (G.prices['Intérieur']).mois;
        mins.push({ key: 'MIN30|' + k, kind: 'min30', eff: best.eff, cmd: g.cmd, apLabel: g.apLabel, affaire: g.affaire, surf: g.surf, comp: comp, pu: pu, amount: r2(comp * pu), keys: g.keys, billable: true,
          formula: '(' + G.min30 + ' − ' + fmt3(g.surf) + ') m² × ' + pu + ' = ' + r2(comp * pu).toFixed(2) });
        if (Object.keys(g.byCm).length > 1) anom('MIN30_MULTI_CM', 'info', 'Appareil réparti sur plusieurs contremaîtres', 'Le complément minimum 30 m² est affecté au contremaître qui porte la plus grande surface.').keys = anom('MIN30_MULTI_CM').keys.concat(g.keys);
      });
    }

    // ---- FACTURES ----
    var inv = {};
    function getInv(r) {
      var eff = r.eff, agc = cfg.agencies[eff.ag] || { split: 'cm', grid: 'STD', cas: 2, annexe: true };
      var sub = agc.split === 'affaire' ? r.affaire : agc.split === 'cm' ? eff.cm : agc.split === 'appareil' ? r.apLabel : 'Agence';
      var k = eff.ag + '||' + sub;
      if (!inv[k]) inv[k] = { key: k, ag: eff.ag, agLabel: eff.agLabel, split: agc.split, grid: agc.grid || 'STD', cas: agc.cas || 2, annexe: !!agc.annexe, sub: sub, cmCodes: {}, cms: {}, appareils: {}, lines: {}, totals: { E: 0, S: 0, STK: 0, MIN: 0, HT: 0 }, odoo: { M: 0, S: 0, sHas: false }, count: 0 };
      var I = inv[k]; if (eff.cmCode) I.cmCodes[eff.cmCode] = 1; I.cms[eff.cm] = 1; I.appareils[r.apLabel] = 1;
      return I;
    }
    function addLine(I, fam, cmd, r, qty) {
      var lk = fam + '|' + cmd; var L = I.lines[lk] = I.lines[lk] || { fam: fam, cmd: cmd, affaire: r.affaire, n: 0, qty: 0, amount: 0, keys: [] };
      L.n++; L.qty += qty; L.amount = r2(L.amount + r.amount); L.keys.push(r.key);
      I.totals[fam] = r2(I.totals[fam] + r.amount); I.totals.HT = r2(I.totals.HT + r.amount); I.count++;
    }
    M.forEach(function (r) { if (!r.billable) return; var I = getInv(r); addLine(I, r.op, r.apLabel, r, r.up); if (r.odooPrix >= 0) I.odoo.M = r2(I.odoo.M + r.odooPrix); });
    S.forEach(function (r) { if (!r.billable) return; var I = getInv(r); addLine(I, 'STK', r.apLabel, r, r.surfFact); if (r.odooPrix >= 0) { I.odoo.S = r2(I.odoo.S + r.odooPrix); I.odoo.sHas = true; } });
    mins.forEach(function (m) { var I = getInv(m); addLine(I, 'MIN', m.apLabel, m, m.comp); });

    var invoices = Object.keys(inv).map(function (k) { var I = inv[k]; I.lineList = Object.keys(I.lines).map(function (x) { return I.lines[x]; }); return I; })
      .sort(function (a, b) { return a.ag === b.ag ? a.sub.localeCompare(b.sub) : a.ag.localeCompare(b.ag); });
    invoices.forEach(function (I, i) { I.num = 'PRO-' + month.replace('-', '').slice(2) + '-' + I.ag + '-' + pad(i + 1); });

    var sevOrder = { bloquant: 0, verifier: 1, info: 2 };
    anomalies.forEach(function (a) { a.keys = uniq(a.keys); });
    anomalies.sort(function (a, b) { return sevOrder[a.sev] - sevOrder[b.sev] || b.keys.length - a.keys.length; });
    var byKey = {}; all.forEach(function (r) { byKey[r.key] = r; }); mins.forEach(function (m) { byKey[m.key] = m; });
    var tot = { E: 0, S: 0, STK: 0, MIN: 0, HT: 0 }; invoices.forEach(function (I) { Object.keys(tot).forEach(function (k) { tot[k] = r2(tot[k] + I.totals[k]); }); });
    return { month: month, mb: mb, records: all, M: M, S: S, mins: mins, anomalies: anomalies, invoices: invoices, byKey: byKey, totals: tot, byCode: byCode };
  }
  function fmt3(x) { return (Math.round(x * 1000) / 1000).toString(); }

  return { DEFAULT_CONFIG: DEFAULT_CONFIG, parseFile: parseFile, build: build, detectMonth: detectMonth, r2: r2, frDate: frDate, TIER_LABEL: TIER_LABEL, parseCmd: parseCmd, monthBounds: monthBounds, normCmd: normCmd };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
