# Deploy DonutRush on Railway

DonutRush uses a Node.js backend; GitHub Pages alone will not run accounts, Mines game state, or leaderboards.

1. In Railway, create a project and choose **Deploy from GitHub repo**.
2. Select your `DonutRush` repository and its `main` branch.
3. Leave the root directory at `/`. The included `railway.json` declares `npm start` and `/api/health`.
4. Set `NODE_ENV=production` under Railway variables.
5. Add a persistent volume for the accounts and scoreboard (the app stores these in `data/db.json`). Mount the volume at a path suitable for your Railway app, e.g. `/app/data` if Railway reports `/app` as the project working directory. To avoid uncertainty, mount the volume at `/data` and set `DONUTRUSH_DATA_DIR=/data`.
6. Under your service settings/networking, generate a public domain and confirm the website loads.
7. Visit `https://YOUR-DOMAIN/api/health`; the response should be `{"ok":true,"service":"DonutRush"}`.

Caution: The JSON-based database is for small-scale testing. Treat this as a limited friend-group beta, not a production-audited auth system. Use a secure managed database, user moderation, backups, recovery, and abuse prevention before broader use. Do not use Minecraft passwords, payments, tradable currency, or wagers here.
