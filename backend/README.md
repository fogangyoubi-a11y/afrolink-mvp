# AfroLink — Backend API

API REST pour AfroLink : authentification, profils producteurs/boutiques, catalogue,
demandes d'achat, messagerie, commandes et paiement Stripe.

## Stack

- Node.js ≥ 22.5 (utilise `node:sqlite`, module intégré — pas de dépendance native à compiler)
- Express
- SQLite (fichier local, voir migration Postgres plus bas)
- `jsonwebtoken` + `bcryptjs` pour l'authentification
- `stripe` (SDK officiel) pour les paiements réels via Stripe Checkout

Toutes les dépendances sont en JS pur (aucune ne nécessite de compilation native),
ce qui rend l'installation fiable sur n'importe quel environnement.

## Installation

```bash
cd backend
npm install
cp .env.example .env
```

Puis remplis `.env` :

- `JWT_SECRET` — obligatoire. Génère une valeur avec :
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `PORT` — 4000 par défaut.
- `DATABASE_FILE` — optionnel, `./data/afrolink.db` par défaut. Le dossier `data/`
  est créé automatiquement et ignoré par git.
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — voir section Stripe ci-dessous.
  Laisse-les vides pour faire tourner l'API sans paiements (les routes de commande
  renverront une erreur 503 claire au lieu de planter).
- `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` — pages de retour après paiement,
  à pointer vers ton frontend déployé.

## Lancer le serveur

```bash
npm start        # production
npm run dev       # avec rechargement automatique (--watch)
```

Vérifie que ça tourne :

```bash
curl http://localhost:4000/api/health
```

## Tests

```bash
npm test
```

Ça boote l'API en mémoire (fichier SQLite temporaire, supprimé à la fin) et
exécute un test de bout en bout : auth, profils, catalogue, demandes,
messagerie, commandes. 28 vérifications, toutes doivent passer.

## Configurer Stripe (mode test)

1. Crée un compte sur [dashboard.stripe.com](https://dashboard.stripe.com) si ce
   n'est pas déjà fait.
2. Dans le Dashboard, active le **mode Test** (bouton en haut à droite).
3. Récupère ta clé secrète de test dans **Développeurs → Clés API**
   (commence par `sk_test_...`) → colle-la dans `STRIPE_SECRET_KEY`.
4. Pour tester les webhooks en local, installe la [Stripe CLI](https://docs.stripe.com/stripe-cli)
   puis lance :
   ```bash
   stripe listen --forward-to localhost:4000/api/stripe/webhook
   ```
   Cette commande affiche un secret `whsec_...` → colle-le dans `STRIPE_WEBHOOK_SECRET`.
5. Redémarre le serveur. Les commandes utiliseront désormais de vraies sessions
   Stripe Checkout (page de paiement hébergée par Stripe — aucune donnée de
   carte ne transite par ce backend).
6. Utilise une [carte de test Stripe](https://docs.stripe.com/testing) comme
   `4242 4242 4242 4242` pour simuler un paiement réussi.

Quand tu passes en production, remplace les clés `sk_test_...` par les clés
live (`sk_live_...`) et reconfigure un endpoint webhook réel dans le Dashboard
Stripe (Développeurs → Webhooks → Ajouter un endpoint) pointant vers
`https://ton-domaine.com/api/stripe/webhook`, avec l'événement
`checkout.session.completed` au minimum.

## Déploiement

L'app est un serveur Express classique sans dépendance native — elle tourne
sur n'importe quel hébergeur Node standard (Render, Railway, Fly.io, un VPS...).

Points d'attention :

- Définis toutes les variables de `.env.example` dans les variables d'environnement
  de l'hébergeur (ne commite jamais `.env`).
- Le fichier SQLite (`DATABASE_FILE`) doit vivre sur un disque persistant. Sur
  les plateformes à filesystem éphémère (ex. Render free tier), monte un volume
  persistant ou migre vers Postgres (voir ci-dessous) — sinon les données sont
  perdues à chaque redéploiement.
- Configure `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` avec l'URL publique du
  frontend déployé.
- Ajoute l'URL du frontend déployé aux origines autorisées si tu restreins CORS
  (actuellement `cors()` est ouvert à tout, à resserrer avant une vraie mise en prod).

### Migration vers Postgres (recommandé à l'échelle)

`node:sqlite` convient bien pour démarrer, mais SQLite ne gère pas bien les
écritures concurrentes à fort volume ni le multi-instance. Pour scaler :

1. Remplace `src/db.js` par un client Postgres (`pg`).
2. `src/schema.sql` est déjà écrit en SQL standard — il devrait se porter vers
   Postgres avec des ajustements mineurs (types `TEXT`/`INTEGER` restent
   compatibles, vérifie juste les contraintes `UNIQUE`/`FOREIGN KEY`).
3. Les fichiers de routes (`src/routes/*.js`) utilisent uniquement les helpers
   `run`/`get`/`all` de `db.js` — aucune requête SQL brute ailleurs — donc la
   migration se limite en théorie à réécrire `db.js`.

## Structure

```
src/
  server.js              point d'entrée Express
  db.js                   couche d'accès SQLite (node:sqlite)
  schema.sql              schéma de la base
  util.js                 helpers (id, dates, JSON)
  stripeWebhook.js         gestion du webhook Stripe
  middleware/auth.js       JWT (signToken, requireAuth, optionalAuth)
  routes/
    auth.js                signup / login / me
    producers.js            annuaire producteurs
    shops.js                annuaire boutiques
    products.js             catalogue produits
    requests.js              demandes d'achat
    conversations.js         messagerie
    orders.js                proposition / annulation / paiement de commande
test/test-api.js           test d'intégration de bout en bout
```

## Endpoints principaux

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | non | Créer un compte (`role`: `producer` ou `shop`) |
| POST | `/api/auth/login` | non | Connexion, renvoie un JWT |
| GET | `/api/auth/me` | oui | Profil du compte connecté |
| GET | `/api/producers` | non | Liste publique des producteurs |
| PUT | `/api/producers/me` | oui (producer) | Modifier son profil producteur |
| GET | `/api/shops` | non | Liste publique des boutiques |
| PUT | `/api/shops/me` | oui (shop) | Modifier son profil boutique |
| GET | `/api/products` | non | Catalogue produits |
| POST | `/api/products` | oui (producer) | Publier un produit |
| GET | `/api/requests` | non | Demandes d'achat publiques |
| POST | `/api/requests` | oui (shop) | Publier une demande d'achat |
| POST | `/api/conversations/find-or-create` | non (invité ok) | Démarrer/retrouver une conversation |
| GET | `/api/conversations/:id` | non | Détail d'une conversation |
| POST | `/api/conversations/:id/messages` | non (invité ok) | Envoyer un message |
| GET | `/api/conversations` | oui | Boîte de réception du compte connecté |
| POST | `/api/conversations/:id/order` | oui (propriétaire) | Proposer un montant de commande |
| POST | `/api/conversations/:id/order/cancel` | oui (propriétaire) | Annuler la commande |
| POST | `/api/conversations/:id/order/checkout` | non | Créer une session de paiement Stripe |
| POST | `/api/stripe/webhook` | signature Stripe | Confirmation de paiement |
