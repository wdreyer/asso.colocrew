# Accès au dashboard ColoCrew

Les administrateurs existants (`admins/{uid}`) gardent l’accès à l’ensemble du dashboard. Dans **Droits d’accès**, ils voient la liste des administrateurs et choisissent les sections attribuées à chaque compte équipe validé et rattaché. Les comptes équipe se gèrent dans **Ressources humaines → Comptes équipe**. Suspendre ou délier un compte retire aussi ses droits délégués.

Les droits sont enregistrés dans `staff_accounts/{uid}.dashboardSections`. Les règles Firestore et Storage, les routes API et la navigation utilisent les mêmes identifiants de section. Certaines sections utilisent des données communes. L’écran des droits indique ces dépendances. Par exemple, les convoyages consultent les données des familles nécessaires aux trajets et peuvent mettre à jour leurs coordonnées sans modifier les tarifs.

## Mise en ligne

1. Configurez le serveur avec `FIREBASE_SERVICE_ACCOUNT_JSON` ou les identifiants d’application Google (ADC) du même projet que `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. Vérifiez aussi le bucket Storage configuré. En hébergement, ces identifiants restent dans les variables serveur.
2. Déployez l’application Next.js et vérifiez sur le même environnement que les liens famille, les paiements Stripe, les campagnes et le rappel des convocations répondent. Ces routes utilisent désormais Firebase Admin.
3. Publiez les règles avec `firebase deploy --only firestore:rules,storage --project <id-du-projet>`. Les règles du dépôt ne s’appliquent en production qu’après cette étape.
4. Attribuez les sections depuis **Droits d’accès**.

## Réservations

Les dossiers restent dans la collection `reservations`. Les liens existants des familles consultent uniquement le dossier dont ils ont le jeton. Le pointage d’un convoyage utilise un endpoint qui vérifie le compte équipe et le périmètre du trajet.

L’historique est stocké dans `reservations/{id}/activity`. L’auteur et la date des activités saisies sont vérifiés par les règles. Le serveur journalise les emails acceptés par le transporteur SMTP. Les emails historiques envoyés avant cette évolution ne sont pas reconstitués.
