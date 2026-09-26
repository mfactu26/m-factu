# M FactU — sécurité

## État de cette version

- Les pages `/admin`, `/orchestrateur`, `/espace-client`, `/dossier` et `/onboarding` passent par une fonction serveur qui vérifie une session signée.
- Le cookie de session est `HttpOnly`, `Secure` et `SameSite=Lax`.
- Les pages internes sont `noindex, nofollow` et servies avec `Cache-Control: private, no-store`.
- En l'absence de configuration d'authentification, aucun accès administrateur valide ne peut être créé.
- Les données visibles dans l'interface restent des données de démonstration tant que la base dédiée n'est pas branchée.

## Variables Vercel requises

Pour le compte propriétaire initial :

- `AUTH_SECRET` : secret aléatoire d'au moins 32 caractères.
- `OWNER_EMAIL` : email de connexion propriétaire.
- `OWNER_PASSWORD` **ou** `OWNER_PASSWORD_HASH`.
- `DATABASE_URL` : sera ajouté lorsque la base M FactU dédiée sera créée.

## Données de santé

Ne pas déposer de prescription, feuille de soins, justificatif patient ou autre donnée de santé réelle dans cette version.
Le stockage de données de santé doit être activé uniquement après validation de l'architecture d'hébergement et des obligations applicables.
