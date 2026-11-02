# Règles Firebase — espace équipe

Les fichiers `firestore.rules` et `storage.rules` (à la racine, référencés par `firebase.json`)
sont une **proposition non déployée**. Les règles actuellement en ligne sont celles de la console
Firebase ; tant que rien n'est déployé, elles continuent de s'appliquer.

## 1. Avant tout : activer l'authentification e-mail

Console Firebase → **Authentication → Sign-in method** → activer **E-mail/Mot de passe**
(sans « lien e-mail »). Sans cela, l'inscription sur `/espace-equipe/inscription` échoue.

Dans **Authentication → Templates**, traduire en français l'e-mail « Réinitialisation du mot de
passe » (utilisé par « Mot de passe oublié » et « Changer mon mot de passe »).

Dans **Authentication → Settings → Authorized domains**, vérifier que `colocrew.com` et
`www.colocrew.com` sont présents.

## 2. Comment fonctionne l'accès équipe

1. La personne crée un compte (`/espace-equipe/inscription`) : compte Firebase Auth +
   document `staff_accounts/{uid}` avec `status: "pending"` et `memberId: ""`.
2. Un admin la valide dans le tableau de bord RH : `status: "approved"` et `memberId` = l'id de
   son dossier `staff_members`. Sur le dossier, `accountUid` = l'uid.
3. L'espace s'ouvre aussitôt (écoute en direct). Toutes les lectures sont filtrées sur le
   `memberId` : contrats, documents, convoyages (`staffMemberIds` contient le `memberId`),
   déroulés des sessions, réservations lues une par une pour l'appel des enfants.

Un compte `rejected` (ou `suspended`) voit un écran « Accès non disponible ». Un admin qui se
connecte sur l'espace équipe est renvoyé vers `/dashboard`.

## 3. Vérifier les règles avant de les déployer

1. Console → **Firestore → Règles** : coller `firestore.rules`, puis utiliser le
   **Rules Playground** pour simuler :
   - un visiteur anonyme : `get` sur `sejours/…` (autorisé), `get` sur `staff_members/…` (refusé) ;
   - un compte équipe approuvé : `get` sur son `staff_members/{memberId}` (autorisé), sur celui
     d'un autre (refusé), `list` de `staff_contracts` avec `where memberId == …` (autorisé) ;
   - un admin : tout autorisé.
2. Console → **Storage → Règles** : coller `storage.rules`, simuler un dépôt dans
   `staff-documents/{memberId}/identity/x.pdf` par le compte approuvé correspondant.
3. **Ne pas cliquer sur « Publier »** sans avoir fait le point du §5 sur les routes API.
4. Garder une copie des règles actuellement en ligne pour pouvoir revenir en arrière.

Déploiement en ligne de commande (depuis la racine du projet, une fois `firebase login` fait) :

```
npx firebase-tools deploy --only firestore:rules,storage --project <id-du-projet>
```

## 4. Ce que ces règles ferment

- Toute la RH (`staff_members`, `staff_contracts`, `staff_documents`, `staff_accounts`,
  `staff_public_profiles`, `salary_grid`) : admins seulement, sauf ses propres données pour un
  compte approuvé. Le dossier ne peut être modifié par la personne que sur : téléphone,
  adresse, date et lieu de naissance, nationalité.
- `day_plans` : lecture par les comptes approuvés, écriture par les admins.
- Storage : dépôt de pièces dans `staff-documents/{son memberId}/` seulement ; lecture de ses
  contrats signés `staff-contracts/{son memberId}/`. Le reste aux admins.
- Les anciennes pages d'administration hors `/dashboard` (`/admin`, `/editsejour`,
  `/uploadsejour`, `/photos`, `/retours`) n'écrivent plus que si un admin est connecté
  (passer par `/dashboard/login` avant, dans le même navigateur). Elles reposent encore sur un
  « mot de passe » stocké dans `ColoCrew/dMSwY57fd61hF8861MyW`, lisible par tous : à supprimer.

## 5. Les trous qui restent tant que les routes API n'utilisent pas `firebase-admin`

Les routes `app/api/**` utilisent le SDK client Firebase **sans utilisateur connecté** : pour
Firestore elles sont des visiteurs anonymes. Pour ne pas casser la réservation, le paiement et
les campagnes, les règles laissent donc ouvert :

| Collection | Ouvert | Utilisé par |
| --- | --- | --- |
| `reservations` | lecture (y compris liste), création, mise à jour | `api/reservation`, `api/find-reservation`, `api/stripe-webhook`, `api/convocations/j7-reminder`, page `/reservation/[token]` |
| `transports` | lecture ; mise à jour de `passengers`/`updatedAt` seulement | `api/reservation` (ajout du passager au convoyage) |
| `acompte_18_juin`, `campagne_*` | lecture, écriture | `api/acompte-18-juin`, `api/brevo/**`, `api/stripe-webhook` |
| `polls` | lecture, écriture | `/quizz`, `/resultats` |
| Storage `justificatifs/` | dépôt + lecture d'un fichier précis | `api/reservation` |

Conséquence principale : **n'importe qui connaissant l'identifiant du projet peut lister toutes
les réservations** (noms, e-mails, téléphones des familles) et les convoyages. C'est déjà le cas
aujourd'hui ; l'espace équipe n'aggrave rien, mais ne le corrige pas.

Pour fermer ces trous :

1. créer un compte de service Firebase et passer les routes API sur `firebase-admin`
   (qui ignore les règles) ;
2. remplacer la lecture directe de `/reservation/[token]` par un appel à une route API ;
3. puis remplacer dans `firestore.rules` les blocs marqués « OUVERTURE TEMPORAIRE » par les
   règles « Cible » écrites en commentaire (réservations lisibles une par une par l'équipe
   approuvée, convoyages lisibles et pointables par leurs seuls convoyeurs).

## 6. Index

Les requêtes de l'espace équipe sont des égalités simples (`memberId ==`, `sessionId ==`,
`stayId ==`, `staffMemberIds array-contains`) sans tri côté serveur : aucun index composite
n'est nécessaire.
