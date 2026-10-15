# DonutRush 🍩

A full-stack, original Minecraft-inspired web arcade. Orange/black design, playable Mines Puzzle with **server-side hidden mines**, a wager-free Coin Toss, Minecraft-style profiles, and a persistent skill leaderboard.

**Important:** DonutRush is **not** a gambling or DonutSMP-currency site. There are no real-money payments, bets, deposits, withdrawals, item transfers, or cash-out. Points are purely nonredeemable skill scores from completing Mines Puzzle boards. Coin Toss awards no points or prizes.

## Run on Windows

1. Install **Node.js 20+** (LTS recommended) from <https://nodejs.org/> if needed.
2. Extract this ZIP.
3. Double-click `START-WINDOWS.bat`.
4. Open <http://localhost:3000> in your browser.

No `npm install` is needed: this project uses Node's built-in modules only.

## Start from terminal

```sh
node server.mjs
```

For a different port, set the `PORT` environment variable, e.g. `PORT=8080 node server.mjs` on Linux/macOS, or `set PORT=8080 && node server.mjs` in Windows CMD.

## Main features

- **Mines Puzzle**: 5×5 / 6×6 / 8×8 boards. First click and its neighbors are safe. Left-click reveal, right-click flag, or toggle Flag Mode for mobile. A completed board awards 100/200/400 skill points to signed-in players; scores are determined by the server, not a browser value.
- **Coin Toss**: guess heads/tails, see a spinning coin, track your prediction accuracy. No betting or rewards.
- **Accounts**: DonutRush-specific username and password, hashed using Node `scrypt`, with HttpOnly session cookies. **Never reuse or submit a Minecraft/Microsoft password.**
- **Profiles**: optional Java display name, private leaderboard toggle, wins and score.
- **Leaderboard**: server-managed and persistent (JSON file).
- **Responsive layout**: desktop, tablet, and phone.

## Public deployment (Railway)

See [DEPLOY-TO-RAILWAY.md](DEPLOY-TO-RAILWAY.md) for the short deployment checklist and persistent database instructions.


To publish DonutRush on a real HTTPS domain, connect a Railway account and deploy this folder as a Node.js service. The included `railway.json` automatically selects the start command and `/api/health` health check.

1. Create a new GitHub repository and upload the project's files; do not commit `data/db.json` or secrets.
2. On Railway, create a project from your GitHub repository and deploy.
3. Add a **persistent volume mounted at `/app/data` only when the provider uses `/app` as the working directory**; otherwise mount a data volume and set `DONUTRUSH_DATA_DIR` to that mount's absolute path. Without a persistent volume, **accounts and scores can disappear after deployments or restarts**.
4. Set `NODE_ENV=production`. Use the HTTPS Railway domain. The app uses host-provided `PORT` automatically.
5. In Railway's networking settings generate a public HTTPS domain and check `/api/health`, `/`, and the Mines game.

Important: This starter is not production-security-audited; only launch to a limited test audience until you add a managed database, account recovery, moderation, backups, and rate limiting shared across instances. No Minecraft passwords, payments, trades, or real-money wagers.

## Hosting online

This project needs a Node.js hosting provider because accounts and the scoreboard are served by `server.mjs`. Upload the project to a provider that supports Node 20+, set the start command to `npm start`, and **configure a persistent disk for the `/data` folder**. Set `NODE_ENV=production` and serve it over HTTPS; use `COOKIE_SECURE=true` if TLS is in use. **A static-only hosting service, such as GitHub Pages, cannot run its multiplayer leaderboard or accounts.**

This is a functional starter web application, not a security-audited production service. Before opening it to a large public audience, add a managed database (rather than JSON file storage), moderation, a proper reverse proxy, account recovery, stronger abuse prevention, and backups. There is no email validation or Minecraft authentication.

## Files

- `server.mjs` — server, account management, mines game engine, and API
- `public/index.html` — website layout
- `public/style.css` — responsive orange-and-black styling
- `public/app.js` — game UI and networking
- `public/favicon.svg` — original logo
- `data/db.json` — automatically created player database; back this up on a real server
- `tests/game.test.mjs` — Node tests

## Test

```sh
npm test
```

This project is fan-made and is not affiliated with Mojang, Minecraft, or DonutSMP.
