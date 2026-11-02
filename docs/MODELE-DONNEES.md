# Modèle de données ColoCrew — saisons, réservations, convoyages, RH

Ce document est le contrat commun entre les modules du backoffice. Tout ce qui est
« par saison » s'appuie sur `src/lib/seasons.js` et `src/lib/sessions.js` ; plus aucun
module ne code en dur des semaines S1–S4 ou des dates.

## 1. Saison

- Une saison = une année civile (`"2026"`, `"2027"`), celle de la **date de début** de la session.
- `seasons/{année}` : `{ status: "open" | "archived", active?: true, archivedAt, archivedBy, stats }`.
  Absence de document = saison ouverte.
- `useSeasons()` → `{ activeSeason, archivedSeasons: Set, seasons }`. La saison active est celle
  ouverte par défaut dans tout le backoffice (2027 à partir de septembre 2026).
- Chaque enregistrement saisonnier porte `season: "2027"`. Les anciens n'ont pas ce champ :
  `seasonOfRecord(record)` le déduit de `sejour.startDate` / `startDate` / `date`.

## 2. Archivage

- On ne supprime ni ne déplace rien. Clôturer une saison :
  1. écrit `archived: true`, `season`, `archivedAt` sur chaque réservation, convoyage, contrat,
     déroulé (`day_plans`) de la saison ;
  2. écrit `seasons/{année}` avec `status: "archived"` et un résumé chiffré.
- Les écrans de travail filtrent `isArchivedRecord(record, archivedSeasons)` : rien d'archivé
  n'y apparaît. Les archives se consultent en lecture seule dans `/dashboard/archives`, et chaque
  membre de l'équipe retrouve son propre historique dans son espace.
- Les liens Stripe, DocuSign et les fichiers Storage restent valides (mêmes IDs de documents).

## 3. Séjour et session

- `sejours/{sejourId}` : la fiche produit. `code` (ex. `MCSC`) facultatif, sinon déduit.
- Une **session** = une entrée de `sejours/{id}.dates[]` (`startDate`, `endDate`, `basePrice`,
  `capacity`, `bookingOpen`, `availabilityStatus`). Elle n'a pas de document propre.
- `sessionId = "${sejourId}__${startDate}"` (`sessionIdFor`). Stable tant que la date de début
  ne change pas.
- `useSessionCatalog(season)` → sessions triées avec `week` (`S1`, `S2`… par séjour et saison),
  `label`, `capacity`, `stations`, `days`.
- `travelDaysFor(sessions)` → jours d'aller/retour d'une saison (unité des convoyages).

## 4. Réservation — `reservations/{id}`

Champs existants conservés (`minor`, `legal`, `options`, `payment`, `transport`, `status`,
`token`, `numeroDeReservation`…). Champs de liaison ajoutés à la création et lors de la reprise
des anciennes fiches :

```
season: "2027"
sejour: { id, name, startDate, endDate, ageGroup, sessionId }
transport: { departureCity, returnCity, fee, allerTransportId?, retourTransportId? }
```

Cycle de vie (`status`) : `pending` (demande reçue) → `validated` (place confirmée, acompte
attendu ou reçu) → `cancelled` | `waitlist`. Le paiement suit son propre statut dans
`payment.paymentStatus`. Une session est complète quand le nombre d'enfants des réservations
`validated` atteint `capacity`.

## 5. Convoyage — `transports/{id}`

```
season: "2027"
date: "2027-07-05", direction: "aller" | "retour"
sessionIds: [sessionId…]            // sessions desservies
passengers: [{ reservationId, pickupCity, childIndex? }]
staff: [{ memberId, name, role }]   // convoyeurs
staffMemberIds: [memberId…]         // copie à plat pour les requêtes du portail équipe
```

`week` (S1–S4) reste lisible sur les anciennes fiches 2026 uniquement.

## 6. RH

- `staff_members/{memberId}` : la personne (identité, coordonnées, documents). Ajout :
  `accountUid` (compte Firebase lié), `email`.
- `staff_accounts/{uid}` : la demande de compte de l'espace équipe.
  `{ uid, email, firstName, lastName, phone, requestedRole: "animateur" | "directeur",
     status: "pending" | "approved" | "rejected", memberId, createdAt, reviewedAt, reviewedBy }`.
  Créé par la personne à l'inscription (`status: "pending"`), validé par un admin qui le lie à
  un `staff_members` existant ou nouveau.
- `staff_contracts/{id}` : un contrat = une personne × une session.
  `{ memberId, season, sejourId, sessionId, stayName, stayCode, week, role, roleKey,
     startDate, endDate, … salaires, docusign… }`.
- `staff_documents/{id}` : pièces déposées (`memberId`, `documentType`, `status`, `storagePath`).
  Non saisonnières, jamais archivées.
- `day_plans/{sessionId}__{date}` : déroulé d'une journée d'une session
  `{ sessionId, season, date, … }`. Les anciens IDs `${stayId}-${date}` (2026) restent lisibles.

## 7. Espace équipe — `/espace-equipe`

Accessible uniquement avec un compte `staff_accounts` **approuvé**. La personne voit ses
contrats, ses sessions et leurs déroulés, ses convoyages (`transports` où
`staffMemberIds` contient son `memberId`), ses documents, et l'historique de toutes les saisons,
archivées comprises. Les anciennes pages publiques `/rh`, `/convoyages` et `/deroules`
redirigent vers cet espace.
