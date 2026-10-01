/* ==== STOCKAGE PRODUCTION — Firebase Auth + Firestore uniquement (offre Spark possible) ====
   Site statique (GitHub Pages) : ni Cloud Storage, ni Cloud Functions, ni CLI.
   Firestore :
     config/global · config/purge
     users/{uid} · invites/{email}
     months/{AGENCE}_{AAAA-MM}  (+ pdfs/{id}, files/{id}/chunks/{n})
     agencyFiles/{id}/chunks/{n}
     transports/{id} · logs/{id}
   Les fichiers (exports Odoo, PDF, documents d'agence) sont conservés à l'identique, découpés en blocs
   binaires de 900 Ko, avec leur empreinte SHA-256 : on peut prouver quel fichier a servi au calcul. */
var STORE = (function () {
  'use strict';
  var CHUNK = 900000;            // < 1 Mio par document Firestore
  var RETENTION_MONTHS = 18;
  var LOG_RETENTION_DAYS = 550;  // règle Firestore : suppression autorisée au-delà de 548 j
  firebase.initializeApp(window.FIREBASE_CONFIG);
  var auth = firebase.auth(), db = firebase.firestore();
  var FV = firebase.firestore.FieldValue, TS = FV.serverTimestamp, FBlob = firebase.firestore.Blob;
  var profile = null, loginPending = false, ipP = null, denyMsg = null;

  function tsToIso(t) { return t && t.toDate ? t.toDate().toISOString() : (t || null); }
  function clean(o) { return JSON.parse(JSON.stringify(o)); }
  function newId() { return Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
  function lower(s) { return String(s || '').trim().toLowerCase(); }

  /* ---- Journal (écrit par le navigateur ; règles : création seule, horodatage serveur imposé, jamais modifiable) ---- */
  function myIp() {
    if (!ipP) ipP = Promise.race([
      fetch('https://api.ipify.org?format=json').then(function (r) { return r.json(); }).then(function (j) { return String(j.ip || ''); }),
      new Promise(function (res) { setTimeout(function () { res(''); }, 3000); })
    ]).catch(function () { return ''; });
    return ipP;
  }
  function log(type, detail, month) {
    var u = auth.currentUser; if (!u) return Promise.resolve();
    return myIp().then(function (ip) {
      return db.collection('logs').add({
        at: TS(), uid: u.uid, email: u.email || null, type: String(type),
        detail: String(detail || '').slice(0, 480),
        month: typeof month === 'string' && /^[0-9A-Za-z_-]{1,13}_\d{4}-\d{2}$/.test(month) ? month : null,
        ip: ip.slice(0, 64), ua: String(navigator.userAgent || '').slice(0, 200)
      });
    }).catch(function () {});
  }
  function listLogs(limit) {
    return db.collection('logs').orderBy('at', 'desc').limit(limit || 500).get().then(function (q) {
      return q.docs.map(function (d) { var x = d.data(); x.id = d.id; x.at = tsToIso(x.at); return x; });
    });
  }

  /* ---- Fichiers en blocs binaires ---- */
  function sha256(buf) {
    return crypto.subtle.digest('SHA-256', buf).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  // Écrit le fichier sous docPath (blocs puis document descriptif) et renvoie la fiche
  function putBlob(docPath, file, extra) {
    return file.arrayBuffer().then(function (buf) {
      return sha256(buf).then(function (hash) {
        var u8 = new Uint8Array(buf), n = Math.max(1, Math.ceil(u8.length / CHUNK)), chain = Promise.resolve();
        for (var i = 0; i < n; i++) (function (i) {
          chain = chain.then(function () {
            return db.doc(docPath + '/chunks/' + String(i).padStart(4, '0')).set({ i: i, b: FBlob.fromUint8Array(u8.subarray(i * CHUNK, (i + 1) * CHUNK)) });
          });
        })(i);
        var meta = Object.assign({ name: file.name, path: docPath, size: file.size, type: file.type || '', sha256: hash, chunks: n, at: new Date().toISOString(), by: profile.email }, extra || {});
        return chain.then(function () { return db.doc(docPath).set(meta); }).then(function () { return meta; });
      });
    });
  }
  function getFileBytes(meta) {
    return db.collection(meta.path + '/chunks').orderBy('i').get().then(function (q) {
      if (meta.chunks && q.size !== meta.chunks) throw new Error('Fichier incomplet en base (' + q.size + ' / ' + meta.chunks + ' blocs) : ' + meta.name);
      var parts = q.docs.map(function (d) { return d.data().b.toUint8Array(); });
      var len = parts.reduce(function (s, p) { return s + p.length; }, 0), out = new Uint8Array(len), o = 0;
      parts.forEach(function (p) { out.set(p, o); o += p.length; });
      return out.buffer;
    });
  }
  function deleteFile(meta) {
    if (!meta || !meta.path) return Promise.resolve();
    return db.collection(meta.path + '/chunks').get().then(function (q) {
      return Promise.all(q.docs.map(function (d) { return d.ref.delete(); }));
    }).then(function () { return db.doc(meta.path).delete(); }).catch(function () {});
  }

  /* ---- Authentification ---- */
  // Premier accès d'un compte créé dans la console : activé avec le rôle de son invitation, sinon mis en attente.
  function ensureProfile(u) {
    var ref = db.doc('users/' + u.uid);
    return ref.get().then(function (d) {
      if (d.exists) return d;
      var em = lower(u.email), inv = db.doc('invites/' + em);
      return inv.get().then(function (i) {
        var doc = i.exists
          ? { email: em, name: i.data().name || em, role: i.data().role, active: true, createdAt: TS(), createdBy: i.data().by || 'invitation', lastLogin: null }
          : { email: em, name: em, role: 'lecture', active: false, pending: true, createdAt: TS(), createdBy: 'premier accès', lastLogin: null };
        return ref.set(doc).then(function () { return i.exists ? inv.delete().catch(function () {}) : null; }).then(function () { return ref.get(); });
      });
    });
  }
  function onAuth(cb) {
    var first = true;
    auth.onAuthStateChanged(function (u) {
      if (!u) {
        // La restauration de session émet d'abord null : on attend avant de conclure.
        if (first) { first = false; setTimeout(function () { if (!auth.currentUser) { profile = null; cb(null); } }, 1500); return; }
        // Après un refus, la déconnexion forcée ne doit pas effacer le motif affiché
        var m = denyMsg; denyMsg = null; profile = null; cb(null, m || undefined); return;
      }
      first = false;
      function deny(m) { denyMsg = m; loginPending = false; cb(null, m); auth.signOut(); }
      ensureProfile(u).then(function (d) {
        var x = d.data();
        if (x.pending) { deny('Compte en attente de validation par un administrateur.'); return; }
        if (x.active !== true) { deny('Compte inactif. Contacter un administrateur.'); return; }
        profile = { uid: u.uid, email: u.email, name: x.name || u.email, role: x.role };
        if (loginPending) {
          loginPending = false;
          log('login', 'Connexion');
          db.doc('users/' + u.uid).update({ lastLogin: TS() }).catch(function () {});
        }
        if (x.role === 'admin') purge();
        cb(profile);
      }, function (e) { deny('Accès refusé : ' + e.message); });
    });
  }
  function signIn(email, pw) {
    loginPending = true;
    return auth.signInWithEmailAndPassword(email, pw).catch(function (e) { loginPending = false; throw e; });
  }
  function signOut(reason) {
    var p = profile ? log('logout', reason || 'Déconnexion') : Promise.resolve();
    return p.then(function () { profile = null; return auth.signOut(); });
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
  function saveMonth(id, patch) {
    var p = clean(patch); p.updatedAt = TS(); p.updatedBy = profile.email;
    if (patch.status === 'clos') { p.closedAt = TS(); p.closedBy = profile.email; }
    return db.doc('months/' + id).set(p, { mergeFields: Object.keys(p) });
  }

  /* ---- Exports Odoo ---- */
  function uploadImport(month, file) {
    var ref = db.doc('months/' + month), existed = false, meta;
    return ref.get().then(function (d) {
      if (d.exists && d.data().status === 'clos') throw new Error('Mois clôturé : le rouvrir avant d\'importer.');
      existed = d.exists;
      var id = newId();
      return putBlob('months/' + month + '/files/' + id, file, { id: id, kind: 'import' });
    }).then(function (m) {
      meta = m;
      var p = { files: FV.arrayUnion(meta), updatedAt: TS(), updatedBy: profile.email };
      if (!existed) { p.status = 'ouvert'; p.ov = {}; p.ag = month.split('_')[0]; p.month = month.split('_')[1]; }
      return ref.set(p, { merge: true });
    }).then(function () { return log('import', file.name + ' · SHA-256 ' + meta.sha256.slice(0, 16), month); }).then(function () { return meta; });
  }
  function loadImportRows(meta) {
    return getFileBytes(meta).then(function (buf) {
      var wb = XLSX.read(new Uint8Array(buf), { type: 'array', raw: false, cellDates: false });
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    });
  }
  function deleteImport(month, meta) {
    return deleteFile(meta).then(function () {
      return db.doc('months/' + month).update({ files: FV.arrayRemove(meta), updatedAt: TS(), updatedBy: profile.email });
    }).then(function () { return log('import_delete', meta.name, month); });
  }

  /* ---- Factures PDF (contrôle) ---- */
  function listPdfs(month) {
    return db.collection('months/' + month + '/pdfs').orderBy('at').get().then(function (q) { return q.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }); });
  }
  function uploadPdf(month, file) {
    var id = newId();
    return putBlob('months/' + month + '/files/' + id, file, { id: id, kind: 'pdf' });
  }
  function getPdfBytes(meta) { return getFileBytes(meta); }
  function savePdfResult(month, meta, result) {
    var doc = clean(meta); doc.result = clean(result);
    if (doc.result.lines && doc.result.lines.length > 400) doc.result.lines = doc.result.lines.slice(0, 400);
    return db.doc('months/' + month + '/pdfs/' + meta.id).set(doc).then(function () { return log('pdf_control', meta.name + ' : ' + result.status, month); });
  }
  function deletePdf(month, meta) {
    return deleteFile(meta).then(function () { return db.doc('months/' + month + '/pdfs/' + meta.id).delete(); })
      .then(function () { return log('pdf_delete', meta.name, month); });
  }

  /* ---- Documents de référence des agences ---- */
  function uploadAgencyDoc(code, kind, file) {
    var id = String(code).replace(/[^\w-]/g, '') + '_' + kind + '_' + newId();
    return putBlob('agencyFiles/' + id, file, { kind: kind, agency: String(code) });
  }

  /* ---- Transports ---- */
  function listTransports() { return db.collection('transports').orderBy('createdAt', 'desc').limit(1000).get().then(function (q) { return q.docs.map(function (d) { var x = d.data(); x.id = d.id; x.createdAt = tsToIso(x.createdAt); return x; }); }); }
  function addTransport(t) { var x = clean(t); x.createdAt = TS(); x.createdBy = profile.email; return db.collection('transports').add(x).then(function (r) { return log('transport', (t.date || '') + ' ' + t.cp + ' ' + t.veh + ' ' + t.total + ' €').then(function () { return r.id; }); }); }
  function updateTransport(id, patch) { var x = clean(patch); x.updatedAt = TS(); x.updatedBy = profile.email; return db.doc('transports/' + id).update(x).then(function () { return log('transport', id + ' ' + JSON.stringify(patch)); }); }
  function deleteTransport(id) { return db.doc('transports/' + id).delete().then(function () { return log('transport', 'Suppression ' + id); }); }

  /* ---- Utilisateurs ----
     Création : l'admin déclare l'e-mail et le rôle (invitation), puis crée le compte dans la console Firebase
     (Authentication → Ajouter un utilisateur). Au premier accès, le compte prend le rôle de l'invitation. */
  function listUsers() {
    return Promise.all([db.collection('users').get(), db.collection('invites').get()]).then(function (r) {
      var U = r[0].docs.map(function (d) { var x = d.data(); x.uid = d.id; x.lastLogin = tsToIso(x.lastLogin); x.createdAt = tsToIso(x.createdAt); return x; });
      var known = U.map(function (u) { return lower(u.email); });
      r[1].docs.forEach(function (d) {
        if (known.indexOf(d.id) >= 0) return;
        var x = d.data(); U.push({ uid: 'invite:' + d.id, email: d.id, name: x.name || '', role: x.role, active: false, invite: true, createdAt: tsToIso(x.at) });
      });
      return U;
    });
  }
  function createUser(u) {
    var em = lower(u.email);
    return db.doc('invites/' + em).set({ name: String(u.name || '').slice(0, 80), role: u.role, at: TS(), by: profile.email })
      .then(function () { return log('user_create', 'Invitation ' + em + ' (' + u.role + ')'); });
  }
  function updateUser(uid, patch) {
    if (String(uid).indexOf('invite:') === 0) {
      var em = uid.slice(7);
      if (patch.remove || patch.active === true) return db.doc('invites/' + em).delete().then(function () { return log('user_update', 'Invitation supprimée ' + em); });
      var p = {}; if (patch.role) p.role = patch.role; if (patch.name !== undefined) p.name = String(patch.name).slice(0, 80);
      return db.doc('invites/' + em).update(p).then(function () { return log('user_update', 'Invitation ' + em + ' : ' + JSON.stringify(p)); });
    }
    if (profile && uid === profile.uid && (patch.role !== undefined || patch.active === false)) return Promise.reject(new Error('Un administrateur ne peut pas modifier son propre rôle ni se désactiver'));
    var q = {};
    if (patch.role !== undefined) q.role = patch.role;
    if (patch.active !== undefined) { q.active = !!patch.active; if (patch.active) q.pending = false; }
    if (patch.name !== undefined) q.name = String(patch.name).slice(0, 80);
    var ref = db.doc('users/' + uid);
    return ref.get().then(function (d) {
      if (!d.exists) throw new Error('Utilisateur inconnu');
      return ref.update(q).then(function () { return log('user_update', d.data().email + ' : ' + JSON.stringify(q)); });
    });
  }
  // Sans serveur, l'admin ne fixe pas le mot de passe : il envoie l'e-mail de réinitialisation Firebase.
  function setPassword(uid) {
    return db.doc('users/' + uid).get().then(function (d) {
      if (!d.exists) throw new Error('Utilisateur inconnu');
      return auth.sendPasswordResetEmail(d.data().email).then(function () { return log('password_set', 'E-mail de réinitialisation envoyé à ' + d.data().email); });
    });
  }

  /* ---- Conservation 18 mois : lancée à la connexion d'un administrateur, au plus une fois par jour ---- */
  function purge() {
    var ref = db.doc('config/purge');
    return ref.get().then(function (d) {
      var last = d.exists && d.data().lastRun && d.data().lastRun.toDate ? d.data().lastRun.toDate() : null;
      if (last && Date.now() - last.getTime() < 86400000) return;
      var c = new Date(); c.setDate(1); c.setMonth(c.getMonth() - (RETENTION_MONTHS - 1));
      var cutoff = c.getFullYear() + '-' + String(c.getMonth() + 1).padStart(2, '0');
      return ref.set({ lastRun: TS(), by: profile.email }).then(function () { return db.collection('months').get(); }).then(function (q) {
        var old = q.docs.filter(function (m) { return String(m.data().month || m.id.split('_').pop()) < cutoff; });
        return old.reduce(function (p, m) {
          return p.then(function () { return db.collection('months/' + m.id + '/files').get(); })
            .then(function (f) { return Promise.all(f.docs.map(function (x) { return deleteFile({ path: x.ref.path }); })); })
            .then(function () { return db.collection('months/' + m.id + '/pdfs').get(); })
            .then(function (f) { return Promise.all(f.docs.map(function (x) { return x.ref.delete(); })); })
            .then(function () { return m.ref.delete(); })
            .then(function () { return log('purge', 'Mois ' + m.id + ' supprimé (conservation ' + RETENTION_MONTHS + ' mois)', m.id); });
        }, Promise.resolve());
      }).then(function () {
        var lim = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - LOG_RETENTION_DAYS * 86400000));
        return db.collection('logs').where('at', '<', lim).limit(400).get().then(function (q) {
          if (q.empty) return; var b = db.batch(); q.docs.forEach(function (x) { b.delete(x.ref); }); return b.commit();
        });
      });
    }).catch(function (e) { console.warn('Purge non effectuée : ' + e.message); });
  }

  return {
    mode: 'firebase', get profile() { return profile; },
    onAuth: onAuth, signIn: signIn, signOut: signOut, resetPasswordEmail: resetPasswordEmail, changeOwnPassword: changeOwnPassword,
    getConfig: getConfig, saveConfig: saveConfig,
    listMonths: listMonths, getMonth: getMonth, saveMonth: saveMonth,
    uploadImport: uploadImport, loadImportRows: loadImportRows, deleteImport: deleteImport,
    getFileBytes: getFileBytes, uploadAgencyDoc: uploadAgencyDoc, deleteFile: deleteFile,
    listTransports: listTransports, addTransport: addTransport, updateTransport: updateTransport, deleteTransport: deleteTransport,
    listPdfs: listPdfs, uploadPdf: uploadPdf, getPdfBytes: getPdfBytes, savePdfResult: savePdfResult, deletePdf: deletePdf,
    listUsers: listUsers, createUser: createUser, updateUser: updateUser, setPassword: setPassword,
    log: log, listLogs: listLogs, purge: purge
  };
})();
