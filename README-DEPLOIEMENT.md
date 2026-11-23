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

## v6.3 — mobile
- Sous 900 px : bouton menu (☰) à gauche de l'en-tête ; la barre latérale s'ouvre en tiroir (fermeture : choix d'un module, clic sur le fond, touche Échap).
- Accueil compact sur téléphone (tuiles sur une colonne, recherche en 16 px pour éviter le zoom iOS).
- Prénom affiché à partir de l'e-mail quand le compte n'a pas de nom.
- Gestion transporteurs sur mobile : deux menus déroulants (« Vue » : analyses, référentiels, transporteurs, + nouveau ; « Section » : fiche, grilles, + ajouter, commentaires) à la place des rangées d'onglets.

## v6.4 — Gestion transporteurs
- Accueil de la section en 4 blocs : Analyses, Types de véhicules, Destinations, Transporteurs (+ dépôt de grilles).
- Transporteurs : une carte par transporteur (statut, grilles, points à vérifier) et une carte « + Ajouter un transporteur ».
- Fil d'Ariane avec retour (Gestion transporteurs › Transporteurs › CCE) et sélecteur de transporteur sur la fiche ; les rangées d'onglets du haut disparaissent.
- Flux A → A (livraison directe) / A → B (livraison 1ère heure, « débord ») : par grille, supplément A → B en € HT ou « A → B non proposé » ; grille normée affichable en A → A ou A → B ; type de flux choisi dans les contraintes de la demande de transport ; filtre de flux dans les deux onglets d'Analyses. Débord non renseigné : prix A → A signalé « * à confirmer ».
- Demande de transport : 3 solutions d'achat en blocs simplifiés (rang, transporteur, prix, marge, véhicule) avec picto (i) ouvrant le détail du calcul ; tableau des solutions classé (rang 1, 2, 3…).
- Facturer : sélecteur de période sur fond blanc.

## v7.5 — Devis transport et chargement
- Devis transport : page d'accueil (nouveau devis, continuer le devis en cours, reprendre un devis existant avec recherche) ; enregistrement en brouillon (collection `transports`, statut « Brouillon ») et reprise d'un transport validé.
- Demande : entité choisie dans le bloc 1 (toutes les entités), plus dans le bandeau ; contremaître et appareil seulement pour une entité OTIS ; « Quel chantier » devient « Lieu de livraison ».
- Entité OTIS : case « OTIS » dans Paramétrage › Paramétrage (par défaut : parcours Logistique activé ou « OTIS » dans le nom ou le client Odoo).
- Hors OTIS : pas d'étape Vente ; en synthèse, prix de vente préconisé entre ×1,20 et ×1,40 de l'achat retenu (×1,30 par défaut), modifiable.
- Chargement : types écartés pour hayon ou grue sélectionnables ; gerbage par colis sur 2, 3 ou 4 (Excel : colonne Gerbable = oui, 2, 3 ou 4) ; vue 3D refaite (cabine, roues, portes arrière ouvertes, hayon, grue, plateau, cotes L × l × H) ; déplacement manuel des colis (glisser, double-clic pour tourner, contrôle hauteur, appui et gerbage), conservé à l'enregistrement.

## v7.4 — Chargements : identification et recherche
- Chaque chargement porte : client (propriétaire du stock, repris du bon), N° PO, N° bon de préparation (repris du bon, cumulé si plusieurs), N° bon de livraison, référence (références OTIS du bon par défaut), un ID (CH-AAMMJJ-XXXX) et son auteur (créé par / modifié par).
- Liste : tri par colonne, filtres client et utilisateur, recherche libre (ID, PO, BL, BP, client, utilisateur, référence). L'administrateur voit les chargements de tous les utilisateurs ; s'il enregistre le plan d'un autre, une copie à son nom est créée (règle inchangée).

## v7.3 — Correctif bon de préparation
- Lecture du PDF : utilise le lecteur PDF déjà chargé par la page (pdf.js 3.11) au lieu d'en charger un second (conflit de versions « API 4.10.38 / Worker 3.11.174 »).

## v7.2 — Menu
- Gestion transporteurs rejoint la section Transport (administrateurs).

## v7.1 — Véhicules des plans de chargement
- Les camions possibles (Devis et Chargement) suivent exactement Gestion des transporteurs › Types de véhicules : toute modification (libellé, dimensions, charge utile, hayon, grue) est prise en compte immédiatement, et relue à l'entrée du module si elle a été faite depuis un autre poste.
- Longueur intérieure absente : déduite des mètres linéaires. Source affichée sous la liste, avec les types non retenus et leur raison (sans hayon, porteur grue, colis hors gabarit…). Lien « modifier » pour l'administrateur.

## v7.0 — Mes chargements, dépôt de fichiers
- Chargement et Devis : le choix d'un autre camion met à jour le plan et la 3D (le clic sur la ligne suffit).
- Chargement : bouton Enregistrer et onglet « Mes chargements » (liste, ouverture, suppression). Collection Firestore `chargements`.
- Colis : zone de dépôt (glisser-déposer ou clic) acceptant indifféremment les bons de préparation PDF et les fichiers Excel, plusieurs à la fois ; modèle Excel via le picto à droite. + Palette Europe, + Ligne, Vider conservés.
- **Règles Firestore** : ajouter le bloc `match /chargements/{id}` de `firestore.rules` aux règles publiées (Console Firebase › Firestore › Règles › Publier). Sans ce bloc, l'enregistrement échoue avec « permissions ».

## v6.9 — Rubrique Transport, Chargement, bon de préparation
- Menu : rubrique « Transport » avec Devis transport (ex-Transport) et Chargement.
- Chargement : plan de chargement sans devis (colis, camions possibles, 3D, PDF du plan), puis « Faire un devis avec ces colis ».
- Import du bon de préparation Odoo (PDF) dans Devis et Chargement : colis (dimensions, poids, lignes identiques regroupées), et pour le devis contremaître, n° de bon, entité, commune et code postal, observation (adresse, contact). Lecture via pdf.js (CDN jsDelivr).

## v6.8 — Info OTIS dans Logistique
- Menu de gauche : Info OTIS rejoint la section Logistique (en tête).

## v6.7 — Menu Logistique
- Menu de gauche : nouvelle section « Logistique » regroupant Facturer, Piloter et Qualité des données.

## v6.6 — Transport en 6 étapes
- Devis transport devient un parcours : 1 Demande (client, adresse, flux, hayon, grue, manutention) · 2 Colis (saisie, palette Europe, import Excel au modèle ToolBox) · 3 Chargement (plan 3D repris du module Chargement de ToolBox, camions possibles classés par coût d'achat estimé, plusieurs camions si besoin) · 4 Vente (grille de vente, additionnée par camion) · 5 Achat (3 meilleures solutions transporteurs) · 6 Synthèse (marge, PDF à joindre au PO Odoo, validation).
- Onglet « Transports validés » : historique des transports validés.
- Données ajoutées sur chaque transport : colis, camions, flux, hayon, grue, manutention (collection `transports` existante, pas de changement de règles).

## v6.5 — KPI et Qualité des données
- Piloter : unité de mesure (Unité, m², m³) choisie dans chaque graphique Entrées, Sorties, Stockage ; tuiles et tableau suivent l'unité de chaque famille.
- Nouvelle section « Qualité des données » (ADV et administrateurs) : Contrôle des données Odoo + Suivi des anomalies, sortis de Piloter. Piloter ne garde que les volumes et le chiffre d'affaires.
