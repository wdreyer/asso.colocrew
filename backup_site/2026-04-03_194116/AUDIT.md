# AUDIT.md — ColoCrew (v1)

## 0) Contexte d'audit
- **Stack réelle détectée** : **Next.js 15 App Router** (`app/`), pas un projet React Router classique avec `main.jsx`.
- **Conséquence** : les futures étapes du dashboard devront être adaptées au modèle Next.js (routes `app/dashboard/...`) même si la demande mentionne `main.jsx`.
- **Note routes admin** : le projet contient `/editsejour` (singulier), pas `/editsejours`.
- **Périmètre audité** : routes publiques, routes API, pages admin existantes (`/admin`, `/editsejour`), sources de données, dépendances, et proposition d’architecture Firebase.
- **Point demandé inclus** : le script/outil photos créé récemment est présent via la route **`/photos`** (`app/photos/route.js`) et intégré à l’audit.

---

## 1.1 Cartographie des pages et routes

### A. Routes pages (App Router)

| Path | Fichier / composant rendu | Source de données | Authentification | État |
|---|---|---|---|---|
| `/` | `app/page.js` → `app/components/homepage/Home2026.js` | Principalement en dur (constantes JS) + images `public/banqueimage/*` | Non | Fonctionnel |
| `/sejours` | `app/sejours/page.js` | Firestore `sejours` (lecture client) | Non | Fonctionnel |
| `/sejours/[sejourname]` | `app/sejours/[sejourname]/page.js` | Firestore `sejours` + `retours` | Non | **Partiel** (si doc absent : spinner persistant, pas de fallback explicite) |
| `/reserver` | `app/reserver/page.js` | Firestore `sejours` + `fetch('/api/reservation')` | Non | **Partiel** (résolution du séjour via slug dérivé du nom) |
| `/reservation` | `app/reservation/page.js` | `POST /api/find-reservation` | Non | Fonctionnel |
| `/reservation/[token]` | `app/reservation/[token]/page.js` | Firestore `reservations` + `POST /api/create-stripe-session` | Non | Fonctionnel |
| `/admin` | `app/admin/page.js` | Firestore `reservations` + doc `ColoCrew/dMSw...` | Mot de passe (localStorage + Firestore) | Fonctionnel |
| `/editsejour` | `app/editsejour/page.js` | Firestore `sejours` + Storage `sejours/...` + doc `ColoCrew/dMSw...` | Mot de passe (localStorage + Firestore) | Fonctionnel |
| `/uploadsejour` | `app/uploadsejour/page.js` | Upload JSON vers Firestore `sejours` | Non | Fonctionnel |
| `/retours` | `app/retours/page.js` | Firestore `retours` + doc `ColoCrew/dMSw...` | Mot de passe (localStorage + Firestore) | Fonctionnel |
| `/photos` | `app/photos/route.js` (HTML/JS généré) | Firestore `photos`,`albums` + Storage `banqueimage/...` + fallback local `public/banqueimage` | Non (dépend de config Firebase) | Fonctionnel (lecture locale), écriture dispo si config remplie |
| `/souvenirs` | `app/souvenirs/page.js` → `src/pages/Souvenirs/index.jsx` | `src/data/souvenirs.js` | Non | Fonctionnel |
| `/souvenirs/[slug]` | `app/souvenirs/[slug]/page.js` → `src/pages/Souvenirs/SouvenirArticle.jsx` | `src/data/souvenirs.js` | Non | Fonctionnel |
| `/aide-financement` | `app/aide-financement/page.js` | Contenu en dur + `POST /api/send-email` | Non | Fonctionnel |
| `/anims` | `app/anims/page.js` | Contenu en dur + modal candidature (`/api/send-email`) | Non | Fonctionnel |
| `/soutenir` | `app/soutenir/page.js` | Contenu en dur + modal contact (`/api/send-email`) | Non | **Partiel** (payload contact sans `formType` côté modal) |
| `/quizz` | `app/quizz/page.js` | Firestore `polls/quiz1` (vote transactionnel) | Non | Fonctionnel |
| `/resultats` | `app/resultats/page.js` | Firestore `polls/quiz1` (onSnapshot + reset) | Non | Fonctionnel |
| `/reunionS1` | `app/reunionS1/page.js` | Liste PDF statique (`public/CR-Réunion/*`) | Non | Fonctionnel (si fichiers présents) |
| `/reunionS2` | `app/reunionS2/page.js` | Liste PDF statique (`public/CR-Réunion2007/*`) | Non | Fonctionnel (si fichiers présents) |
| `/conditions-generales-de-ventes` | `app/conditions-generales-de-ventes/page.js` | Texte en dur (via `StaticPageShell`) | Non | Fonctionnel |
| `/mentions-legales` | `app/mentions-legales/page.js` | Texte en dur (via `StaticPageShell`) | Non | Fonctionnel |
| `/rgpd` | `app/rgpd/page.js` | Texte en dur (via `StaticPageShell`) | Non | Fonctionnel |
| `/qui-sommes-nous` | `app/qui-sommes-nous/page.js` | Texte en dur (via `StaticPageShell`) | Non | Fonctionnel |

### B. Routes API

| Path | Fichier | Source/écriture données | État |
|---|---|---|---|
| `/api/reservation` | `app/api/reservation/route.js` | Crée Firestore `reservations`, upload Storage `justificatifs/`, appelle `/api/mail-resa` | Fonctionnel |
| `/api/find-reservation` | `app/api/find-reservation/route.js` | Query Firestore `reservations` (email + numéro) | Fonctionnel |
| `/api/mail-resa` | `app/api/mail-resa/route.js` | Envoi mails (nodemailer/Brevo) | Fonctionnel |
| `/api/send-email` | `app/api/send-email/route.js` | Envoi mails contact/candidature | Fonctionnel |
| `/api/create-stripe-session` | `app/api/create-stripe-session/route.js` | Session Stripe checkout | Fonctionnel |
| `/api/create-stripe-3x-checkout` | `app/api/create-stripe-3x-checkout/route.js` | Session Stripe abonnement 3x | **Partiel** (peu/pas raccordé au flux principal) |
| `/api/stripe-webhook` | `app/api/stripe-webhook/route.js` | Met à jour `reservations.payment.*` | Fonctionnel |

---

## 1.2 Cartographie des données

### A. Séjours (à venir / passés)
- **Stockage actuel** : Firestore `sejours` (principal), + données statiques locales pour homepage/souvenirs.
- **Shape observée (Firestore `sejours`)** :
```json
{
  "name": "My Creative Surf Camp",
  "heroSubtitle": "...",
  "heroImage": "https://...",
  "basePrice": 890,
  "environment": "mer",
  "ageGroups": ["11-13", "14-17"],
  "dates": [
    { "startDate": "2026-07-06", "endDate": "2026-07-17", "basePrice": 990 }
  ],
  "stations": [
    { "name": "Paris", "priceExtra": 120 }
  ],
  "summarySubsections": [
    { "title": "...", "text": "...", "imageSrc": "https://..." }
  ],
  "sections": [
    { "subSections": [ { "title": "...", "text": "...", "imageSrc": "https://..." } ] }
  ],
  "testimonials": [ { "quote": "...", "author": "..." } ],
  "galleryImages": ["/banqueimage/...jpg"]
}
```
- **Lecteurs** : `app/sejours/page.js`, `app/sejours/[sejourname]/page.js`, `app/reserver/page.js`, composants séjour.
- **Écrivains** : `app/editsejour/page.js`, `app/uploadsejour/page.js`, `app/components/UploadSejours.js`.

### B. Pages statiques (ColoCrew, Aides, Travailler, etc.)
- **Stockage actuel** : contenu **en dur** dans fichiers `app/*/page.js` et `app/components/homepage/Home2026.js`.
- **Shape** : objets JS/constantes locales (pas de schéma Firestore).
- **Lecteurs** : pages publiques.
- **Écrivains** : édition de code uniquement.

### C. Réservations
- **Stockage actuel** : Firestore `reservations` + fichiers justificatifs en Storage `justificatifs/*`.
- **Shape observée** :
```json
{
  "minor": {
    "numberOfChildren": "2",
    "children": [
      { "firstName": "...", "lastName": "...", "birthDate": "...", "birthPlace": "...", "address": "...", "city": "...", "postalCode": "..." }
    ]
  },
  "legal": {
    "firstName": "...", "lastName": "...", "phone": "...", "email": "...",
    "relation": "...", "addressDifferent": false, "address": "...", "city": "...",
    "postalCode": "...", "promoCode": "...", "cafOrSecu": "...", "qf": "...",
    "justificatifUrl": "https://...", "message": "..."
  },
  "options": {
    "insuranceOpted": false,
    "paymentMethod": "CB",
    "acceptedCGV": true,
    "acceptedDocs": false,
    "acceptedNoWithdrawal": false,
    "acceptedRGPD": true
  },
  "payment": {
    "totalPrice": 1234,
    "estimatedPriceString": "de 890 à 1100 €",
    "basePrice": 1234,
    "transportFee": 80,
    "insuranceFee": 0,
    "paymentStatus": "not_paid",
    "alreadyPaid": 0,
    "remainingValue": 1234
  },
  "sejour": { "name": "...", "startDate": "...", "endDate": "...", "ageGroup": "..." },
  "transport": { "departureCity": "...", "returnCity": "...", "fee": 80 },
  "tokenUnique": "hex...",
  "numeroDeReservation": "RES-...",
  "status": "pending",
  "createdAt": "ISO string"
}
```
- **Lecteurs** : `/admin`, `/reservation/[token]`, `/api/find-reservation`.
- **Écrivains** : `/api/reservation` (création), `/api/stripe-webhook` (maj paiement), `/admin` (édition/suppression).

### D. Photos / médias
- **Stockage actuel** :
  - Fichiers locaux : `public/banqueimage/**`
  - Storage : `banqueimage/<album>/<fichier>` (utilisé par `/photos`)
  - Firestore : `photos`, `albums`
- **Shape Firestore `photos`** :
```json
{
  "nom": "ski_001.jpg",
  "album": "ski",
  "url": "https://firebasestorage...",
  "storagePath": "banqueimage/ski/ski_001.jpg",
  "dateAjout": "Timestamp",
  "taille": 1024000,
  "ordre": 3
}
```
- **Lecteurs** : `/photos` (route HTML/JS), homepage/séjours via chemins `public/banqueimage`.
- **Écrivains** : `/photos` (upload, rename, move, delete), `editsejour` (upload images séjour), scripts reorg (`scripts/banqueimage_reorg.py`).
- **Spécifique script photos inclus** : `app/photos/route.js` contient la logique photothèque complète (UI + Firebase) et le contrôle d’usage des images dans le code avant rename/move/delete.
- **Script de tri/réorganisation lié** : `scripts/banqueimage_reorg.py` (inventaire, normalisation noms, dédoublonnage, reclassement, mise à jour des URLs + logs `renommage_encodage.log`, `doublons_supprimes.log`, `reorganisation.log`, `rapport_final.txt`).

### E. Témoignages
- **Stockage actuel** :
  - Firestore `retours` (source principale structurée)
  - + tableaux statiques dans `Home2026.js` et `src/data/souvenirs.js`
- **Shape Firestore `retours`** (import script) :
```json
{
  "sourceType": "questionnaire_parent|questionnaire_jeune|avis_manuels",
  "respondentType": "parent|jeune",
  "sejourName": "...",
  "sejourPeriod": "...",
  "childName": "...",
  "respondentName": "...",
  "parentName": "...",
  "contactEmail": "...",
  "submittedAt": "ISO",
  "globalScoreNormalized": 9.5,
  "ratings": [
    { "key": "nourriture", "category": "Nourriture", "score": 5, "max": 5, "normalized": 10 }
  ],
  "comments": [ { "header": "...", "text": "..." } ],
  "highlights": ["..."]
}
```
- **Lecteurs** : `/retours`, `/sejours/[sejourname]` (agrégations), homepage (majoritairement statique).
- **Écrivains** : script `scripts/import-retours-firestore.mjs` (pas d’UI CRUD dédiée).

### F. Blog / Souvenirs
- **Stockage actuel** : statique dans `src/data/souvenirs.js`.
- **Shape** : objets `SOUVENIRS[]` (slug, hero, chapitres, temoignages, galerie, stats, couleurs).
- **Lecteurs** : `/souvenirs`, `/souvenirs/[slug]`.
- **Écrivains** : édition de code uniquement.

### G. Autres données trouvées
- **`polls`** (`quizz` / `resultats`) : votes A/B/C/D + total + resetVersion.
- **`ColoCrew/dMSwY57fd61hF8861MyW`** : utilisé comme source du mot de passe admin (legacy).
- **`retours_imports`** : métadonnées d’import des retours.
- **`localStorage.colocrew_auth`** : session admin locale (expiry timestamp).

---

## 1.3 État des pages admin existantes

### `/admin` (gestion réservations)
**Implémenté**
- Login par mot de passe (vérification Firestore `ColoCrew/...`).
- Session locale (expiry 7 jours).
- Lecture Firestore `reservations`.
- Tri multi-colonnes, filtre par séjour, résumé compteurs.
- MAJ paiement (`payment.totalPrice`, `payment.paymentStatus`).
- Suppression de réservation.

**Manquant / cassé / limites observées**
- Pas d’auth Firebase Auth, pas de rôles (`admins/{uid}` absent).
- Secret mot de passe côté client (document Firestore) + logique locale.
- Pas de pagination côté Firestore (tout chargé en client).
- Couche de permissions dépendante des règles Firestore, pas d’API intermédiaire.

**Transit des données**
- Front client → Firestore direct (`getDocs`, `updateDoc`, `deleteDoc`).

### `/editsejour` (édition séjours)
**Implémenté**
- Login legacy identique `/admin`.
- Chargement de tous les docs `sejours`.
- Création séjour (`addDoc`), édition générale, sections, sous-sections, dates, stations, tranches d’âge.
- Upload images vers Storage + sauvegarde URL dans Firestore.
- Sauvegarde globale séjour (`updateDoc`).
- Éditeur Markdown (`react-simplemde-editor`).

**Manquant / cassé / limites observées**
- Pas de suppression de séjour.
- IDs de séjour non systématiquement pilotés par slug (création via `addDoc` auto-ID).
- Pas de workflow brouillon/publié, ni historique/versionning.
- Validation de schéma partielle (beaucoup de champs optionnels hétérogènes).

**Transit des données**
- Front client → Firestore/Storage direct.

### Outil admin lié déjà présent : `/photos`
- Route autonome `app/photos/route.js` (HTML/CSS/JS vanilla injecté), avec upload Storage + CRUD Firestore `photos/albums`.
- Inclut désormais détection d’usages dans le code avant rename/move/delete (alerte utilisateur).

---

## 1.4 Dependencies installées (pertinentes)

| Catégorie | Dépendances observées | Notes |
|---|---|---|
| Framework / router | `next@15.3.6`, `react@18.2.0`, `react-dom@18.2.0` | **App Router** (`app/`), pas React Router |
| Firebase | `firebase@11.2.0` | Déjà installé et utilisé intensivement |
| Paiement | `stripe@17.6.0` | Checkout + webhook |
| Email backend | `nodemailer@6.9.15` | SMTP Brevo |
| UI / animation | `framer-motion`, `react-icons`, `@react-spring/web`, `swiper` | Utilisées sur homepage/séjours |
| Formulaires / édition | `react-datepicker`, `easymde`, `react-simplemde-editor`, `react-markdown`, `remark-breaks` | Édition séjour + rendu markdown |
| Utilitaires / fichiers | `axios`, `file-saver`, `formidable`, `pdf-lib`, `micro` | Usage ponctuel selon routes/scripts |
| Styling | `tailwindcss`, `postcss`, `autoprefixer` | Tailwind + CSS custom |
| State management global | *(aucun package dédié)* | `useState/useEffect` local, pas Redux/Zustand |

---

## 1.5 Recommandations architecture Firebase (cible dashboard v1+)

### A. Firestore recommandé (collections)
```txt
admins/{uid}
  - role, email, active, createdAt

sejours/{slug}
  - données éditoriales séjour + pricing dates/options

reservations/{id}
  - données réservation + statut paiement + audit

pages/{slug}
  - contenu éditable des pages statiques (future migration)

blog/{slug}
  - articles éditoriaux

souvenirs/{slug}
  - optionnel si migration depuis src/data/souvenirs.js

temoignages/{id}
  - témoignages sélectionnés publiables

retours/{id}
  - données brutes questionnaire (déjà existant)

medias/{id}
  - métadonnées fichiers (si unification avec photos)

photos/{id} et albums/{id}
  - conserver pour compatibilité immédiate avec /photos
```

### B. Storage recommandé (arborescence)
```txt
sejours/{slug}/hero/*
sejours/{slug}/sections/*
reservations/{reservationId}/justificatifs/*
banqueimage/{album}/*          (compat /photos existant)
blog/{slug}/*
souvenirs/{slug}/*
```

### C. Ordre de migration suggéré
1. **Auth admin Firebase** (`admins/{uid}`) + protection des routes dashboard.
2. **Médias** : brancher d’abord `/dashboard/medias` en réutilisant la logique éprouvée de `/photos` (upload + listing + alertes d’usage).
3. **Réservations** : vue dashboard read-only puis actions de statut.
4. **Séjours** : reprendre `/editsejour` dans le dashboard unifié (sans casser l’existant).
5. **Pages / Blog / Témoignages** : migrer progressivement le contenu actuellement en dur.

### D. Risques identifiés
- Auth legacy par mot de passe Firestore exposé côté client (à remplacer par Firebase Auth + `admins`).
- Mélange de sources (Firestore + constantes en dur) => risque de divergence de contenu.
- Hétérogénéité des schémas `sejours` (types/structures variables selon écrans).
- Couplage fort front↔Firestore direct : dépendance forte aux règles de sécurité.
- Route `/reserver` dépend d’un slug dérivé du nom du séjour (risque de “séjour non trouvé”).
- Encodage/accents incohérents dans plusieurs fichiers texte.

---

**AUDIT TERMINÉ — en attente de validation**
