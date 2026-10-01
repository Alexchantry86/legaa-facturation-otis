/* ==== CONTRÔLE DES FACTURES PDF ====
   Extrait le texte des PDF (pdf.js), lit n° de facture, affaire, appareils et montants,
   puis compare à la facture calculée par le moteur. Aucune dépendance au DOM. */
var PDFCHECK = (function () {
  'use strict';
  var TOL = 0.01; // tolérance d'écart en euros

  function lib() {
    var p = window.pdfjsLib || (window['pdfjs-dist/build/pdf']);
    if (!p) throw new Error('Lecteur PDF indisponible');
    return p;
  }

  // Texte du PDF regroupé en lignes (tri par position verticale puis horizontale)
  function extractLines(buffer) {
    var pdfjs = lib();
    return pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise.then(function (doc) {
      var pages = [];
      for (var i = 1; i <= doc.numPages; i++) pages.push(i);
      return Promise.all(pages.map(function (n) {
        return doc.getPage(n).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var rows = [];
          tc.items.forEach(function (it) {
            if (!it.str || !it.str.trim()) return;
            var y = Math.round(it.transform[5]), x = it.transform[4];
            var row = null;
            for (var k = 0; k < rows.length; k++) if (Math.abs(rows[k].y - y) <= 2) { row = rows[k]; break; }
            if (!row) { row = { y: y, items: [] }; rows.push(row); }
            row.items.push({ x: x, s: it.str });
          });
          rows.sort(function (a, b) { return b.y - a.y; });
          return rows.map(function (r) { r.items.sort(function (a, b) { return a.x - b.x; }); return r.items.map(function (i) { return i.s.trim(); }).join('  '); });
        });
      })).then(function (all) { return { pages: doc.numPages, lines: [].concat.apply([], all) }; });
    });
  }

  var AMT = /-?\d{1,3}(?:[   .]\d{3})*,\d{2}(?!\d)|-?\d+[.,]\d{2}(?!\d)/g;
  function toNum(s) {
    s = s.replace(/[   ]/g, '');
    if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s);
  }
  function amounts(line) { return (line.match(AMT) || []).map(toNum).filter(function (x) { return !isNaN(x); }); }
  var MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* Lecture structurée. known = { affaires:{code:1}, appareils:{code:1} } issus du mois calculé */
  function parse(lines, known) {
    var txt = lines.join('\n'), n = norm(txt), out = { numero: '', agence: '', affaires: [], appareils: [], periodes: [], fam: { E: null, S: null, STK: null }, famLines: { E: [], S: [], STK: [] }, totalHT: null, tva: null, ttc: null, warnings: [] };
    var m = txt.match(/(?:facture|invoice)\s*(?:n[°o]\.?|num[ée]ro)?\s*[:#]?\s*([A-Z]{2,5}[\/\-]?\d{2,4}[\/\-]?\d{2,6}[A-Z0-9\/\-]*)/i);
    if (m) out.numero = m[1];
    m = txt.match(/\bAG\s*(\d{2,3})\b/i); if (m) out.agence = m[1];
    var codes = uniq(txt.toUpperCase().match(/\b[0-9A-Z]{7,10}\b/g) || []);
    codes.forEach(function (c) { if (known.affaires[c]) out.affaires.push(c); else if (known.appareils[c]) out.appareils.push(c); });
    if (!out.affaires.length) codes.forEach(function (c) { if (/^45[KN](RX|F4|A2)[0-9A-Z]{2,4}$/.test(c)) out.affaires.push(c); });
    MOIS.forEach(function (mo, i) { var re = new RegExp(mo + '\\s+(20\\d{2})', 'g'), r; while ((r = re.exec(n))) out.periodes.push(r[1] + '-' + String(i + 1).padStart(2, '0')); });
    (n.match(/\b(0[1-9]|1[0-2])[\/.](20\d{2})\b/g) || []).forEach(function (p) { var q = p.split(/[\/.]/); out.periodes.push(q[1] + '-' + q[0]); });
    out.periodes = uniq(out.periodes);
    lines.forEach(function (l) {
      var nl = norm(l), a = amounts(l); if (!a.length) return;
      var last = a[a.length - 1];
      if (/total\s*h\.?\s*t|montant\s*h\.?\s*t|total\s*hors\s*tax/.test(nl)) { out.totalHT = last; return; }
      if (/\btva\b/.test(nl) && !/total\s*ttc/.test(nl)) { out.tva = last; return; }
      if (/total\s*t\.?\s*t\.?\s*c|net\s*a\s*payer|montant\s*ttc/.test(nl)) { out.ttc = last; return; }
      var f = /\bentree/.test(nl) ? 'E' : /\bsortie/.test(nl) ? 'S' : /stockage|minimum\s*30/.test(nl) ? 'STK' : null;
      if (f) { out.famLines[f].push({ line: l, amount: last }); out.fam[f] = r2((out.fam[f] || 0) + last); }
    });
    if (out.totalHT === null && (out.fam.E !== null || out.fam.S !== null || out.fam.STK !== null)) out.warnings.push('Total HT introuvable dans le PDF');
    return out;
  }
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }
  function r2(x) { return Math.round((x + 1e-9) * 100) / 100; }

  /* Rapprochement avec les factures calculées */
  function match(parsed, invoices) {
    var cands = invoices.filter(function (I) { return I.split === 'affaire' ? parsed.affaires.indexOf(I.sub) >= 0 : false; });
    if (cands.length > 1 && parsed.agence) cands = cands.filter(function (I) { return I.ag === parsed.agence; }).length ? cands.filter(function (I) { return I.ag === parsed.agence; }) : cands;
    if (cands.length > 1 && parsed.totalHT !== null) { var x = cands.filter(function (I) { return Math.abs(I.totals.HT - parsed.totalHT) <= TOL; }); if (x.length) cands = x; }
    if (!cands.length && parsed.totalHT !== null) cands = invoices.filter(function (I) { return Math.abs(I.totals.HT - parsed.totalHT) <= TOL; }).length === 1 ? invoices.filter(function (I) { return Math.abs(I.totals.HT - parsed.totalHT) <= TOL; }) : [];
    return cands.length === 1 ? cands[0] : null;
  }

  function compare(parsed, I, month, famTotals) {
    var checks = [];
    function chk(label, pdfV, calcV, ok, note) { checks.push({ label: label, pdf: pdfV, calc: calcV, ok: ok, note: note || '' }); }
    var fam = famTotals(I);
    chk('Affaire', parsed.affaires.join(', ') || '—', I.sub, parsed.affaires.indexOf(I.sub) >= 0);
    if (parsed.agence) chk('Agence', 'AG ' + parsed.agence, I.agLabel, parsed.agence === I.ag);
    else chk('Agence', '—', I.agLabel, false, 'Agence non trouvée dans le PDF');
    chk('Période', parsed.periodes.join(', ') || '—', month, parsed.periodes.indexOf(month) >= 0, parsed.periodes.length ? '' : 'Mois de facturation non trouvé dans le PDF');
    var apsCalc = Object.keys(I.appareils).filter(function (a) { return /^[0-9A-Z]{7,10}$/.test(a); }).sort();
    var miss = apsCalc.filter(function (a) { return parsed.appareils.indexOf(a) < 0; });
    var extra = parsed.appareils.filter(function (a) { return apsCalc.indexOf(a) < 0; });
    chk('N° d\'appareils', parsed.appareils.length + ' trouvé(s)', apsCalc.length + ' attendu(s)', !miss.length && !extra.length,
      (miss.length ? 'Absents du PDF : ' + miss.join(', ') + '. ' : '') + (extra.length ? 'En trop : ' + extra.join(', ') : ''));
    [['E', 'Entrées'], ['S', 'Sorties'], ['STK', 'Stockage']].forEach(function (p) {
      var v = parsed.fam[p[0]], c = fam[p[0]];
      if (v === null && c === 0) return;
      chk(p[1], v, c, v !== null && Math.abs(v - c) <= TOL, v === null ? 'Ligne absente du PDF' : '');
    });
    chk('Total HT', parsed.totalHT, I.totals.HT, parsed.totalHT !== null && Math.abs(parsed.totalHT - I.totals.HT) <= TOL);
    if (parsed.tva !== null) chk('TVA 20 %', parsed.tva, r2(I.totals.HT * 0.2), Math.abs(parsed.tva - r2(I.totals.HT * 0.2)) <= TOL);
    if (parsed.ttc !== null) chk('Total TTC', parsed.ttc, r2(I.totals.HT * 1.2), Math.abs(parsed.ttc - r2(I.totals.HT * 1.2)) <= TOL);
    if (parsed.totalHT !== null && (parsed.fam.E !== null || parsed.fam.S !== null || parsed.fam.STK !== null)) {
      var s = r2((parsed.fam.E || 0) + (parsed.fam.S || 0) + (parsed.fam.STK || 0));
      chk('Cohérence interne du PDF (Σ lignes = total HT)', s, parsed.totalHT, Math.abs(s - parsed.totalHT) <= TOL);
    }
    return checks;
  }

  /* Analyse complète d'un PDF */
  function analyse(buffer, ctx) {
    return extractLines(buffer).then(function (ex) {
      if (!ex.lines.length) return { status: 'illisible', lines: [], parsed: null, checks: [], note: 'Aucun texte dans le PDF (document scanné) : il faut le PDF généré par le logiciel de facturation, pas un scan.' };
      var parsed = parse(ex.lines, ctx.known);
      var I = match(parsed, ctx.invoices);
      if (!I) return { status: 'non_rapprochee', lines: ex.lines, parsed: parsed, checks: [], note: 'Aucune facture calculée ne correspond (affaire ' + (parsed.affaires.join(', ') || 'introuvable') + ', total HT ' + (parsed.totalHT === null ? 'introuvable' : parsed.totalHT) + ').' };
      var checks = compare(parsed, I, ctx.month, ctx.famTotals);
      var bad = checks.filter(function (c) { return !c.ok; });
      return { status: bad.length ? 'ecart' : 'conforme', invKey: I.key, invNum: I.num, lines: ex.lines, parsed: parsed, checks: checks, note: bad.length ? bad.length + ' point(s) en écart' : 'Tous les contrôles sont conformes' };
    });
  }

  return { extractLines: extractLines, parse: parse, match: match, compare: compare, analyse: analyse, TOL: TOL };
})();
if (typeof module !== 'undefined') module.exports = PDFCHECK;
