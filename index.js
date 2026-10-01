/* Cloud Functions — plateforme de facturation OTIS (LEGAA)
   - Gestion des comptes par l'administrateur (création, rôle, activation, mot de passe) sans le déconnecter
   - Journal d'activité écrit côté serveur (horodatage, IP, navigateur non falsifiables)
   - Purge mensuelle des données de plus de 18 mois */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const ROLES = ['admin', 'adv', 'lecture'];
const LOG_TYPES = ['login', 'logout', 'import', 'import_delete', 'modification', 'month_close', 'month_reopen', 'export', 'pdf_control', 'pdf_delete', 'config', 'password_self'];
const RETENTION_MONTHS = 18;

function ipOf(req) {
  const h = req.rawRequest && req.rawRequest.headers ? req.rawRequest.headers['x-forwarded-for'] : null;
  return (h ? String(h).split(',')[0].trim() : (req.rawRequest && req.rawRequest.ip)) || '';
}
function uaOf(req) { return String((req.rawRequest && req.rawRequest.headers && req.rawRequest.headers['user-agent']) || '').slice(0, 200); }
async function writeLog(req, type, detail, extra = {}) {
  await db.collection('logs').add({
    at: FieldValue.serverTimestamp(),
    uid: req && req.auth ? req.auth.uid : null,
    email: extra.email || (req && req.auth && req.auth.token.email) || null,
    type, detail: String(detail || '').slice(0, 500), month: extra.month || null,
    ip: req ? ipOf(req) : '', ua: req ? uaOf(req) : 'système'
  });
}
async function requireActive(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Connexion requise');
  const u = await db.doc(`users/${req.auth.uid}`).get();
  if (!u.exists || u.data().active !== true) throw new HttpsError('permission-denied', 'Compte inactif');
  return u.data();
}
async function requireAdmin(req) {
  const me = await requireActive(req);
  if (me.role !== 'admin') throw new HttpsError('permission-denied', 'Réservé aux administrateurs');
  return me;
}
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 12) throw new HttpsError('invalid-argument', 'Mot de passe : 12 caractères minimum');
}

exports.adminCreateUser = onCall(async (req) => {
  await requireAdmin(req);
  const { email, password, name, role } = req.data || {};
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Rôle inconnu');
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError('invalid-argument', 'E-mail invalide');
  checkPassword(password);
  let u;
  try { u = await admin.auth().createUser({ email: email.trim().toLowerCase(), password, displayName: name || '' }); }
  catch (e) { throw new HttpsError('already-exists', e.code === 'auth/email-already-exists' ? 'Cet e-mail a déjà un compte' : e.message); }
  await db.doc(`users/${u.uid}`).set({ email: u.email, name: name || '', role, active: true, createdAt: FieldValue.serverTimestamp(), createdBy: req.auth.token.email || req.auth.uid, lastLogin: null });
  await writeLog(req, 'user_create', `${u.email} (${role})`);
  return { uid: u.uid };
});

exports.adminUpdateUser = onCall(async (req) => {
  await requireAdmin(req);
  const { uid, role, active, name } = req.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'uid manquant');
  if (uid === req.auth.uid && (role !== undefined || active === false)) throw new HttpsError('failed-precondition', 'Un administrateur ne peut pas modifier son propre rôle ni se désactiver');
  const patch = {};
  if (role !== undefined) { if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Rôle inconnu'); patch.role = role; }
  if (active !== undefined) patch.active = !!active;
  if (name !== undefined) patch.name = String(name).slice(0, 80);
  const ref = db.doc(`users/${uid}`), cur = await ref.get();
  if (!cur.exists) throw new HttpsError('not-found', 'Utilisateur inconnu');
  await ref.update(patch);
  if (active !== undefined) { await admin.auth().updateUser(uid, { disabled: !active }); if (!active) await admin.auth().revokeRefreshTokens(uid); }
  await writeLog(req, 'user_update', `${cur.data().email} : ${JSON.stringify(patch)}`);
  return { ok: true };
});

exports.adminSetPassword = onCall(async (req) => {
  await requireAdmin(req);
  const { uid, password } = req.data || {};
  checkPassword(password);
  const cur = await db.doc(`users/${uid}`).get();
  if (!cur.exists) throw new HttpsError('not-found', 'Utilisateur inconnu');
  await admin.auth().updateUser(uid, { password });
  await admin.auth().revokeRefreshTokens(uid);
  await writeLog(req, 'password_set', cur.data().email);
  return { ok: true };
});

exports.logEvent = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Connexion requise');
  const { type, detail, month } = req.data || {};
  if (!LOG_TYPES.includes(type)) throw new HttpsError('invalid-argument', 'Type inconnu');
  if (type !== 'logout') await requireActive(req);
  await writeLog(req, type, detail, { month: typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) ? month : null });
  if (type === 'login') await db.doc(`users/${req.auth.uid}`).update({ lastLogin: FieldValue.serverTimestamp() });
  return { ok: true };
});

// Appelée sans authentification après un échec de connexion : e-mail tenté + IP
exports.logLoginFailure = onCall(async (req) => {
  const email = String((req.data && req.data.email) || '').slice(0, 120);
  await writeLog(req, 'login_failed', email, { email });
  return { ok: true };
});

// Premier démarrage : le premier compte connecté devient administrateur s'il n'en existe aucun
exports.bootstrapAdmin = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Connexion requise');
  const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  if (!admins.empty) throw new HttpsError('failed-precondition', 'Un administrateur existe déjà');
  await db.doc(`users/${req.auth.uid}`).set({ email: req.auth.token.email, name: req.auth.token.email, role: 'admin', active: true, createdAt: FieldValue.serverTimestamp(), createdBy: 'bootstrap', lastLogin: null });
  await writeLog(req, 'user_create', `${req.auth.token.email} (admin, premier démarrage)`);
  return { ok: true };
});

// Le 1er de chaque mois à 3 h (heure de Paris) : suppression des mois de plus de 18 mois
exports.purgeOldMonths = onSchedule({ schedule: '0 3 1 * *', timeZone: 'Europe/Paris' }, async () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (RETENTION_MONTHS - 1));
  const cutoff = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const old = await db.collection('months').where(admin.firestore.FieldPath.documentId(), '<', cutoff).get();
  const bucket = admin.storage().bucket();
  for (const m of old.docs) {
    await bucket.deleteFiles({ prefix: `imports/${m.id}/` }).catch(() => {});
    await bucket.deleteFiles({ prefix: `invoices/${m.id}/` }).catch(() => {});
    await db.recursiveDelete(m.ref);
    await writeLog(null, 'purge', `Mois ${m.id} supprimé (conservation ${RETENTION_MONTHS} mois)`, { month: m.id });
  }
  const oldLogs = await db.collection('logs').where('at', '<', admin.firestore.Timestamp.fromDate(d)).limit(5000).get();
  const batch = db.batch(); oldLogs.docs.forEach((x) => batch.delete(x.ref)); if (!oldLogs.empty) await batch.commit();
});
