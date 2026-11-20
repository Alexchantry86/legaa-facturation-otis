# Plateforme de facturation OTIS — mise en ligne (GitHub Pages + Firebase)

Même principe que le dashboard pricing : aucun terminal, aucun outil à installer.
- Site : GitHub Pages, `https://alexchantry86.github.io/legaa-facturation-otis/`
- Comptes : Firebase Authentication (e-mail + mot de passe, inscription libre désactivée)
- Données : Firestore (europe-west9, Paris) — grilles, mois, décisions ADV, clôtures, transports, journal,
  et les fichiers eux-mêmes (exports Odoo, PDF, documents d'agence) conservés à l'identique avec leur empreinte SHA-256.
- Pas de Cloud Storage, pas de Cloud Functions : l'offre gratuite Spark suffit.

La sécurité repose sur les règles Firestore (`firestore.rules`), pas sur le code du site.

## Contenu
```
index.html, css/, js/     le site (publié par GitHub Pages)
js/config.js              ← configuration Firebase à compléter (étape 2)
firestore.rules           ← à coller dans la console Firebase (étape 3)
```

## 1. Firebase — réglages console (une fois)
1. Authentication → Méthodes de connexion : E-mail/Mot de passe activé.
2. Authentication → Paramètres → Actions des utilisateurs : création (inscription) décochée.
3. Authentication → Paramètres → Domaines autorisés → Ajouter : `alexchantry86.github.io`.
4. Firestore → collection `users` → document dont l'ID est exactement votre UID (Authentication → Utilisateurs) :
   `role` = `admin` (string) · `active` = `true` (boolean) · `email` = votre e-mail (string).

## 2. Compléter `js/config.js`
Remplacer les 3 valeurs `À_REMPLACER` (apiKey, messagingSenderId, appId) par celles du bloc `firebaseConfig`
(Paramètres du projet → Général → Vos applications → plateforme-otis → Configuration du SDK).
Sur GitHub : ouvrir le fichier → icône crayon → modifier → Commit changes.

## 3. Publier les règles Firestore
Console Firebase → Firestore → Règles → remplacer tout le contenu par celui de `firestore.rules` → Publier.

## 4. GitHub Pages
1. Dépôt `legaa-facturation-otis` → Add file → Upload files → glisser `index.html`, `css`, `js`,
   `firestore.rules`, `README-DEPLOIEMENT.md` (le contenu du dossier, pas le dossier) → Commit changes.
2. Settings → Pages → Source : Deploy from a branch → `main` / `(root)` → Save.
3. Après 1 à 2 minutes : `https://alexchantry86.github.io/legaa-facturation-otis/`.

Dépôt privé : nécessite GitHub Pro. Le site publié reste accessible à qui connaît l'adresse
(seul le code est privé) ; les données ne sont lisibles qu'après connexion d'un compte actif.

## 5. Créer les comptes ADV
1. Dans l'outil : Logistique → Administration → Utilisateurs → déclarer nom, e-mail, rôle → Enregistrer l'invitation.
2. Bouton « Ouvrir la console Firebase » → Ajouter un utilisateur : même e-mail, mot de passe de 12 caractères min.
   (bouton Générer dans l'outil).
3. Communiquer le mot de passe par un autre canal que l'e-mail. À sa première connexion, le compte prend le rôle déclaré.
Un compte créé dans la console sans invitation apparaît « En attente de validation » : bouton Activer.

Mot de passe oublié ou à changer : bouton « Réinitialiser le mot de passe » (e-mail Firebase envoyé à l'utilisateur).
Désactiver un compte coupe immédiatement l'accès aux données (règles Firestore).

## Rôles
| Rôle | Peut |
|---|---|
| Administrateur | tout : agences, grilles, comptes, journal, réouverture d'un mois clôturé |
| ADV | importer, traiter les anomalies, générer et contrôler les factures, clôturer un mois, valider des transports |
| Lecture seule | consulter et exporter |

## Journal
Connexions, déconnexions, imports (avec empreinte SHA-256), modifications, générations, clôtures, exports,
contrôles PDF, changements de grilles, gestion des comptes. Les règles imposent l'identité et l'horodatage serveur
et interdisent toute modification, y compris par un admin. L'adresse IP est relevée par le navigateur (indicative).
Les échecs de connexion ne sont pas journalisés (pas de serveur) ; Firebase bloque les tentatives répétées.

## Conservation
18 mois glissants. La purge (mois, fichiers, PDF, journal) se lance à la connexion d'un administrateur,
au plus une fois par jour.
Sauvegarde recommandée (nécessite l'offre Blaze) : Firestore → Reprise après sinistre → sauvegardes planifiées.

## Mises à jour
Remplacer les fichiers modifiés sur GitHub (Upload files → Commit). Si `firestore.rules` change, le recoller dans la console.

## v6.0 — navigation par usage et propositions d'amélioration
- Barre latérale : Accueil · Info OTIS · Transport · Facturer · Piloter · Savoir des experts · Paramétrage (admin) · Mon compte.
- Facturer : liste des entités du mois à gauche, parcours A → E avec étapes terminées cochées et bouton « Étape suivante » (bloqué tant qu'il reste des lignes bloquantes).
- Piloter : Volumes (tous les comptes), Qualité des données (ADV et admin), Suivi des anomalies (admin).
- Panneau Assistant & discussion : onglet « Améliorations » (proposer, soutenir ; l'admin retient, marque réalisée ou écarte).

**Règles Firestore** : ajouter le bloc `match /idees/{id}` de `firestore.rules` aux règles publiées
(Console Firebase → Firestore → Règles), sans remplacer le reste, puis Publier. Sans ce bloc, l'onglet
« Améliorations » affiche « Propositions inaccessibles ».

## v6.1 — écrans Facturer et Piloter
- Facturer : étapes en ligne compacte A → E + Clôture, entités « à traiter » / « clôturées » avec nombre de lignes bloquantes ou étape en cours, lien « KPI de l'entité » vers Piloter filtré.
- Piloter : barre de filtres pour tous les comptes (ADV réservé admin), filtre repris de Facturer, Suivi des anomalies ouvert aux ADV, nouveau tableau « Anomalies par nature et par mois » (6 mois) avec retour vers Facturer sur le mois cliqué.
- Gestion transporteurs : la grille achat transport sort de Paramétrage et devient une section de la barre latérale (administrateurs) : analyses, types de véhicules, destinations, fiches et grilles des transporteurs.
- Pas de changement de règles Firestore.

## v6.2 — application installable (PWA)
- Fichiers : `manifest.webmanifest`, `sw.js`, dossier `icons/` (à publier avec `index.html` et `config.js`).
- Installation : Chrome / Edge sur PC → bouton « Installer l'application » dans la barre latérale (ou icône d'installation de la barre d'adresse) ; Android → menu ⋮ › Installer l'application ; iPhone / iPad → Safari › Partager › « Sur l'écran d'accueil ».
- Mises à jour : la page est toujours rechargée depuis le réseau quand il est disponible ; rien à faire côté utilisateurs après une publication.
- Hors connexion : l'application s'ouvre (page et bibliothèques en cache) avec un bandeau « Hors connexion » ; les données Firebase ne sont pas conservées sur l'appareil.
