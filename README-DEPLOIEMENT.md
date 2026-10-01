# Plateforme de facturation OTIS — mise en production

Pile technique : Firebase (même famille que le dashboard pricing).
- **Hébergement** : Firebase Hosting (HTTPS, domaine `legaa-facturation-otis.web.app`, pas de dépôt public).
- **Comptes** : Firebase Authentication, e-mail + mot de passe, comptes créés uniquement par un administrateur.
- **Base de données** : Firestore (Europe) — mois de facturation, décisions de l'ADV, clôtures, grilles, comptes, journal.
- **Fichiers** : Cloud Storage (Europe) — exports Odoo et factures PDF contrôlées.
- **Traitements serveur** : Cloud Functions — création de comptes et mots de passe, journal horodaté avec IP, purge des mois de plus de 18 mois.

Rien n'est stocké dans le navigateur : un ADV qui change de poste retrouve tout.

## Coût
Offre **Blaze** obligatoire (Cloud Storage et Cloud Functions l'exigent depuis 2024). Aux volumes OTIS
(≈ 5 Mo d'exports et quelques dizaines de PDF par mois, une poignée d'utilisateurs), la consommation reste
dans les quotas gratuits ou à quelques centimes par mois. Poser une **alerte budgétaire à 10 €** (étape 2).

## Contenu du dossier
```
public/                 application web (index.html, css/, js/)
  js/config.js          ← à compléter avec la configuration du projet Firebase
  js/engine.js          moteur de calcul (règles contractuelles)
  js/pdfcheck.js        contrôle des factures PDF
  js/store-firebase.js  accès base de données / fichiers / comptes
  js/app.js             interface
functions/              Cloud Functions (comptes, journal, purge)
firestore.rules         droits d'accès base de données
storage.rules           droits d'accès fichiers
firebase.json, .firebaserc
cors.json               autorisation de lecture des fichiers par le site
```

## Étapes (≈ 45 min, une seule fois)

### 1. Créer le projet
1. https://console.firebase.google.com → **Ajouter un projet** → nom : `legaa-facturation-otis`.
   Google Analytics : inutile.
2. Si l'identifiant proposé diffère, reporter l'identifiant réel dans `.firebaserc` et `public/js/config.js`.

### 2. Passer en Blaze et poser l'alerte budget
1. Console → roue crantée → **Utilisation et facturation** → **Modifier l'offre** → Blaze, compte de facturation LEGAA.
2. Google Cloud Console → **Facturation → Budgets et alertes** → budget 10 €/mois, alertes à 50 %, 90 %, 100 %.

### 3. Activer les services (région Europe)
1. **Authentication** → Commencer → fournisseur **E-mail/Mot de passe** : activer.
   Puis **Paramètres → Actions utilisateur** : **décocher « Autoriser la création de comptes »** (sinon n'importe qui pourrait s'inscrire).
   Puis **Paramètres → Domaines autorisés** : vérifier `legaa-facturation-otis.web.app`.
2. **Firestore Database** → Créer → mode production → emplacement **europe-west9 (Paris)**.
3. **Storage** → Commencer → mode production → emplacement **europe-west9 (Paris)**.
   ⚠ La région Firestore / Storage ne peut plus être changée ensuite.

### 4. Récupérer la configuration web
Console → roue crantée → **Paramètres du projet** → **Vos applications** → icône `</>` → nom « Plateforme OTIS »
(ne pas cocher Hosting ici). Copier l'objet `firebaseConfig` dans `public/js/config.js`.

### 5. Déployer depuis un poste (Windows)
Prérequis : Node.js 20 LTS (https://nodejs.org).
```bash
npm install -g firebase-tools
firebase login
cd chemin\vers\legaa-facturation-otis
cd functions && npm install && cd ..
firebase deploy
```
`firebase deploy` publie en une fois : l'application, les règles Firestore et Storage, les Cloud Functions.
Au premier déploiement des fonctions planifiées, accepter l'activation de Cloud Scheduler si demandé.

### 5 bis. Autoriser le site à relire ses fichiers (CORS, une seule fois)
Sans cette étape, les exports Odoo et les PDF s'enregistrent mais ne se rechargent pas.
1. Ouvrir https://console.cloud.google.com, projet `legaa-facturation-otis`, puis **Cloud Shell** (icône `>_` en haut à droite).
2. Importer le fichier `cors.json` (menu ⋮ → Importer), puis exécuter :
```bash
gcloud storage buckets update gs://legaa-facturation-otis.firebasestorage.app --cors-file=cors.json
```
(adapter le nom du bucket s'il diffère : il figure dans `storageBucket` de `config.js`).

### 6. Créer le premier administrateur
1. Console → **Authentication → Utilisateurs → Ajouter un utilisateur** : `alexandre.chantry@…` + mot de passe (12 caractères min.).
2. Ouvrir `https://legaa-facturation-otis.web.app` et se connecter avec ce compte.
   Au tout premier accès, s'il n'existe **aucun** administrateur, ce compte le devient automatiquement
   (fonction `bootstrapAdmin`, refusée dès qu'un administrateur existe).
3. Onglet **Administration → Utilisateurs** : créer les comptes ADV (rôle ADV) et lecture seule.
   Les comptes suivants se créent tous depuis l'outil, sans repasser par la console.

### 7. Charger les grilles et le premier mois
1. Onglet **Grilles & règles** : les valeurs contractuelles sont chargées par défaut. Toute modification
   est enregistrée en base et tracée au journal.
2. Choisir la période (ex. septembre 2026) → **Imports Odoo** → déposer les exports.

## Rôles
| Rôle | Peut |
|---|---|
| Administrateur | tout, dont grilles et règles, comptes, journal, réouverture d'un mois clôturé |
| ADV | importer, traiter les anomalies, éditer et contrôler les factures, clôturer un mois |
| Lecture seule | consulter factures, synthèse, contrôles ; exporter |

## Cycle mensuel
1. Sélectionner la période → importer les exports Odoo (un fichier de même nom remplace le précédent).
   Si les données portent sur un autre mois, l'outil le signale et propose la bonne période.
2. **Anomalies Odoo** : traiter les lignes bloquantes (sans client, sans affaire).
3. **Factures logistiques** : éditer les factures, cocher « Éditée ».
4. **Contrôle factures** : déposer les PDF émis → comparaison automatique avec le calcul.
5. **Clôturer le mois** : montants, décisions et grilles sont figés. Seul un administrateur peut rouvrir.

## Sécurité
- Accès uniquement pour les comptes actifs, vérifié par les règles Firestore et Storage (pas seulement par l'interface).
- Comptes créés, désactivés et mots de passe définis uniquement côté serveur (Cloud Functions, contrôle du rôle admin).
- Désactiver un compte ou changer son mot de passe ferme ses sessions ouvertes.
- Journal écrit côté serveur (horodatage, IP, navigateur) : connexions, échecs de connexion, imports, modifications,
  clôtures, exports, contrôles PDF, changements de grilles, gestion des comptes. Non modifiable, y compris par un admin.
- Déconnexion automatique après 30 min d'inactivité.
- Mot de passe : 12 caractères minimum. À communiquer par un autre canal que l'e-mail (SMS, oral).

## Conservation
- 18 mois glissants : le 1er de chaque mois à 3 h, la fonction `purgeOldMonths` supprime les mois plus anciens
  (exports, PDF, décisions) et les entrées de journal de plus de 18 mois.
- Sauvegarde recommandée : Firestore → **Sauvegardes planifiées** (quotidienne, 7 jours).

## Mises à jour
Modifier les fichiers puis `firebase deploy --only hosting` (interface seule) ou `firebase deploy` (tout).
