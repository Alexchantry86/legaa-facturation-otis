/* ==== STOCKAGE PRODUCTION — Firebase (Auth, Firestore, Storage, Functions) ====
   Toutes les données sont en base : aucun état métier en local.
   Firestore : config/global · months/{AAAA-MM} (+ sous-collection pdfs) · users/{uid} · logs/{id}
   Storage   : imports/{AAAA-MM}/… (exports Odoo) · invoices/{AAAA-MM}/… (factures PDF) */
var STORE = (function () {
  'use strict';
  var REGION = 'europe-west1';
  firebase.initializeApp(window.FIREBASE_CONFIG);
  var auth = firebase.auth(), db = firebase.firestore(), st = firebase.storage(), fns = firebase.app().functions(REGION);
  var TS = firebase.firestore.FieldValue.serverTimestamp;
  var profile = null;

  function call(name, data) { return fns.httpsCallable(name)(data || {}).then(function (r) { return r.data; }); }
  function tsToIso(t) { return t && t.toDate ? t.toDate().toISOString() : (t || null); }
  function clean(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---- Authentification ---- */
  function onAuth(cb) {
    var first = true;
    auth.onAuthStateChanged(function (u) {
      if (!u) {
        // La restauration de session émet d'abord null : on attend avant de conclure.
        if (first) { first = false; setTimeout(function () { if (!auth.currentUser) { profile = null; cb(null); } }, 1500); return; }
        profile = null; cb(null); return;
      }
      first = false;
      db.doc('users/' + u.uid).get().then(function (d) {
        // Premier démarrage : sans aucun administrateur, le premier compte connecté le devient (refusé sinon côté serveur).
        if (!d.exists) return call('bootstrapAdmin').then(function () { return db.doc('users/' + u.uid).get(); }, function () { return d; });
        return d;
      }).then(function (d) {
        if (!d.exists || d.data().active !== true) { cb(null, 'Compte inactif ou non autorisé. Contacter un administrateur.'); auth.signOut(); return; }
        var x = d.data();
        profile = { uid: u.uid, email: u.email, name: x.name || u.email, role: x.role };
        cb(profile);
      }, function (e) { cb(null, 'Accès refusé : ' + e.message); auth.signOut(); });
    });
  }
  function signIn(email, pw) {
    return auth.signInWithEmailAndPassword(email, pw).then(function () { return call('logEvent', { type: 'login', detail: 'Connexion' }).catch(function () {}); },
      function (e) { call('logLoginFailure', { email: email }).catch(function () {}); throw e; });
  }
  function signOut(reason) {
    var p = profile ? call('logEvent', { type: 'logout', detail: reason || 'Déconnexion' }).catch(function () {}) : Promise.resolve();
    return p.then(function () { return auth.signOut(); });
  }
  function resetPasswordEmail(email) { return auth.sendPasswordResetEmail(email); }
  function changeOwnPassword(oldPw, newPw) {
    var u = auth.currentUser, cred = firebase.auth.EmailAuthProvider.credential(u.email, oldPw);
    return u.reauthenticateWithCredential(cred).then(function () { return u.updatePassword(newPw); }).then(function () { return log('password_self', 'Changement de son mot de passe'); });
  }

  /* ---- Configuration (grilles, agences, règles) ---- */
  function getConfig() { return db.doc('config/global').get().then(function (d) { return d.exists ? d.data().cfg : null; }); }
  function saveConfig(cfg, what) {
    return db.doc('config/global').set({ cfg: clean(cfg), updatedAt: TS(), updatedBy: profile.email }).then(function () { return log('config', what || 'Modification des grilles / règles'); });
  }

  /* ---- Mois de facturation ---- */
  function listMonths() {
    return db.collection('months').get().then(function (q) {
      return q.docs.map(function (d) { var x = d.data(); x.id = d.id; x.updatedAt = tsToIso(x.updatedAt); x.closedAt = tsToIso(x.closedAt); delete x.ov; return x; });
    });
  }
  function getMonth(id) {
    return db.doc('months/' + id).get().then(function (d) {
      if (!d.exists) return null; var x = d.data(); x.id = d.id; x.updatedAt = tsToIso(x.updatedAt); x.closedAt = tsToIso(x.closedAt); return x;
    });
  }
  // patch : champs remplacés en entier (ov, done, transport, summary, status…)
  function saveMonth(id, patch) {
    var p = clean(patch); p.updatedAt = TS(); p.updatedBy = profile.email;
    if (patch.status === 'clos') { p.closedAt = TS(); p.closedBy = profile.email; }
    return db.doc('months/' + id).set(p, { mergeFields: Object.keys(p) });
  }

  /* ---- Exports Odoo ---- */
  function uploadImport(month, file) {
    var id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var path = 'imports/' + month + '/' + id + '_' + file.name.replace(/[^\w.\-]+/g, '_');
    var ref = db.doc('months/' + month), existed = false;
    return ref.get().then(function (d) {
      if (d.exists && d.data().status === 'clos') throw new Error('Mois clôturé : le rouvrir avant d\'importer.');
      existed = d.exists;
      return st.ref(path).put(file, { contentType: file.type || 'application/vnd.ms-excel', customMetadata: { originalName: file.name } });
    }).then(function () {
      var meta = { id: id, name: file.name, path: path, size: file.size, at: new Date().toISOString(), by: profile.email };
      var p = { files: firebase.firestore.FieldValue.arrayUnion(meta), updatedAt: TS(), updatedBy: profile.email };
      if (!existed) { p.status = 'ouvert'; p.ov = {}; p.done = {}; p.transport = []; }
      return ref.set(p, { merge: true })
        .then(function () { return log('import', file.name, month); }).then(function () { return meta; });
    });
  }
  function loadImportRows(meta) {
    return st.ref(meta.path).getDownloadURL().then(function (url) { return fetch(url); }).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var wb = XLSX.read(new Uint8Array(buf), { type: 'array', raw: false, cellDates: false });
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    });
  }
  function deleteImport(month, meta) {
    return st.ref(meta.path).delete().catch(function () {}).then(function () {
      return db.doc('months/' + month).update({ files: firebase.firestore.FieldValue.arrayRemove(meta), updatedAt: TS(), updatedBy: profile.email });
    }).then(function () { return log('import_delete', meta.name, month); });
  }

  /* ---- Factures PDF (contrôle) ---- */
  function listPdfs(month) {
    return db.collection('months/' + month + '/pdfs').orderBy('at').get().then(function (q) { return q.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }); });
  }
  function uploadPdf(month, file) {
    var id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var path = 'invoices/' + month + '/' + id + '.pdf';
    return st.ref(path).put(file, { contentType: 'application/pdf', customMetadata: { originalName: file.name } }).then(function () {
      return { id: id, name: file.name, path: path, size: file.size, at: new Date().toISOString(), by: profile.email };
    });
  }
  function getPdfBytes(meta) { return st.ref(meta.path).getDownloadURL().then(function (u) { return fetch(u); }).then(function (r) { return r.arrayBuffer(); }); }
  function savePdfResult(month, meta, result) {
    var doc = clean(meta); doc.result = clean(result);
    if (doc.result.lines && doc.result.lines.length > 400) doc.result.lines = doc.result.lines.slice(0, 400);
    return db.doc('months/' + month + '/pdfs/' + meta.id).set(doc).then(function () { return log('pdf_control', meta.name + ' : ' + result.status, month); });
  }
  function deletePdf(month, meta) {
    return st.ref(meta.path).delete().catch(function () {}).then(function () { return db.doc('months/' + month + '/pdfs/' + meta.id).delete(); })
      .then(function () { return log('pdf_delete', meta.name, month); });
  }

  /* ---- Utilisateurs (via Cloud Functions : l'admin reste connecté) ---- */
  function listUsers() {
    return db.collection('users').get().then(function (q) { return q.docs.map(function (d) { var x = d.data(); x.uid = d.id; x.lastLogin = tsToIso(x.lastLogin); x.createdAt = tsToIso(x.createdAt); return x; }); });
  }
  function createUser(u) { return call('adminCreateUser', u); }
  function updateUser(uid, patch) { return call('adminUpdateUser', Object.assign({ uid: uid }, patch)); }
  function setPassword(uid, pw) { return call('adminSetPassword', { uid: uid, password: pw }); }

  /* ---- Journal (écrit côté serveur : horodatage, IP et navigateur non falsifiables) ---- */
  function log(type, detail, month) { return call('logEvent', { type: type, detail: String(detail || '').slice(0, 480), month: month || null }).catch(function () {}); }
  function listLogs(limit) {
    return db.collection('logs').orderBy('at', 'desc').limit(limit || 500).get().then(function (q) {
      return q.docs.map(function (d) { var x = d.data(); x.id = d.id; x.at = tsToIso(x.at); return x; });
    });
  }

  return {
    mode: 'firebase', get profile() { return profile; },
    onAuth: onAuth, signIn: signIn, signOut: signOut, resetPasswordEmail: resetPasswordEmail, changeOwnPassword: changeOwnPassword,
    getConfig: getConfig, saveConfig: saveConfig,
    listMonths: listMonths, getMonth: getMonth, saveMonth: saveMonth,
    uploadImport: uploadImport, loadImportRows: loadImportRows, deleteImport: deleteImport,
    listPdfs: listPdfs, uploadPdf: uploadPdf, getPdfBytes: getPdfBytes, savePdfResult: savePdfResult, deletePdf: deletePdf,
    listUsers: listUsers, createUser: createUser, updateUser: updateUser, setPassword: setPassword,
    log: log, listLogs: listLogs
  };
})();
