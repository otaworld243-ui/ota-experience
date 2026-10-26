// Tâche automatique GitHub (toutes les 5 minutes) :
// 1) applique les réinitialisations de mot de passe demandées par les admins
// 2) envoie une notification aux appareils admin quand il y a de nouvelles inscriptions
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

async function resets() {
  const rs = await db.collection('pwresets').get();
  for (const d of rs.docs) {
    const r = d.data();
    try { await admin.auth().updateUser(r.uid, { password: r.pass + '#OTA26' }); await d.ref.delete(); console.log('Mot de passe réinitialisé :', r.code); }
    catch (e) { console.error('Réinitialisation échouée', r.code, e.message); }
  }
}

async function notifier() {
  const ps = await db.collection('players').where('status', '==', 'pending').get();
  const fresh = ps.docs.filter(d => !d.data().notified);
  if (!fresh.length) return console.log('Rien de nouveau.');
  const ts = await db.collection('adminTokens').get();
  const tokens = ts.docs.map(d => d.id);
  if (!tokens.length) return console.log('Aucun appareil admin enregistré.');
  const names = fresh.slice(0, 3).map(d => d.data().pseudo).join(', ');
  const body = fresh.length === 1 ? names + " vient de s'inscrire." : fresh.length + ' nouvelles inscriptions : ' + names + (fresh.length > 3 ? '…' : '');
  const base = process.env.SITE_URL;
  const r = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: '🔔 OtaExperience', body },
    webpush: { fcmOptions: { link: base + '/' + process.env.ADMIN_FOLDER + '/' }, notification: { icon: base + '/admin-192.png' } }
  });
  await Promise.all(r.responses.map((x, i) => (!x.success && /not-registered|invalid/.test((x.error && x.error.code) || '')) ? db.collection('adminTokens').doc(tokens[i]).delete() : null));
  if (r.successCount > 0) { const b = db.batch(); fresh.forEach(d => b.update(d.ref, { notified: true })); await b.commit(); }
  console.log('Inscriptions:', fresh.length, '| appareils notifiés:', r.successCount, '/', tokens.length);
}

(async () => { await resets(); await notifier(); })().catch(e => { console.error(e); process.exit(1); });
