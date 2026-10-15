const $ = id => document.getElementById(id);
let current = { user: null, leaderboard: [], game: null, totalPlayers: 0 };
let showing = 'mines';
let authMode = 'login';
let flagging = false;
let boardBusy = false;
let coinBusy = false;
let guestCoins = { tosses: 0, correct: 0 };
try { guestCoins = JSON.parse(localStorage.getItem('dr_guest_coins') || 'null') || guestCoins; } catch { /* No local storage available. */ }

async function request(path, body) {
  const init = body === undefined ? { credentials: 'same-origin' } : {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  };
  const response = await fetch(path, init);
  let data;
  try { data = await response.json(); } catch { throw Error('Server is not responding correctly.'); }
  if (!response.ok) throw Error(data.error || 'Something went wrong.');
  return data;
}
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add('hidden'), 3600);
}
function displayError(err) { toast(err instanceof Error ? err.message : 'Something went wrong.'); }
function updateState(data) {
  current = data;
  renderAccount();
  renderMines();
  renderLeaderboard();
  renderCoinStats();
}
function renderAccount() {
  const user = current.user;
  $('authButton').classList.toggle('hidden', Boolean(user));
  $('profileButton').classList.toggle('hidden', !user);
  if (user) $('profileButton').textContent = `✦ ${user.username} · ${user.points.toLocaleString()} PTS`;
}
function renderLeaderboard() {
  $('totalPlayers').textContent = `${current.totalPlayers} PLAYER${current.totalPlayers === 1 ? '' : 'S'} REGISTERED`;
  const node = $('leaderboardRows'); node.replaceChildren();
  if (!current.leaderboard.length) {
    const empty = document.createElement('div'); empty.className = 'empty-leaderboard';
    const title = document.createElement('strong'); title.textContent = 'The top spot is wide open.';
    empty.append(title, document.createTextNode('Beat a Mines Puzzle board while logged in to claim the first spot.'));
    node.append(empty); return;
  }
  for (const item of current.leaderboard) {
    const row = document.createElement('div'); row.className = 'leaderboard-row';
    const rankUser = document.createElement('div'); rankUser.className = 'rank-user';
    const rank = document.createElement('span'); rank.className = `rank-number ${item.rank <= 3 ? 'top-rank' : ''}`; rank.textContent = `#${item.rank}`;
    const avatar = document.createElement('span'); avatar.className = 'user-avatar'; avatar.textContent = item.username.slice(0, 1).toUpperCase();
    const info = document.createElement('div'); info.className = 'user-info';
    const name = document.createElement('strong'); name.textContent = item.username;
    const gameName = document.createElement('small'); gameName.textContent = item.minecraftName ? `MC: ${item.minecraftName}` : 'DonutRush player';
    info.append(name, gameName); rankUser.append(rank, avatar, info);
    const wins = document.createElement('span'); wins.textContent = `${item.wins}`;
    const points = document.createElement('span'); points.className = 'points'; points.textContent = `${item.points.toLocaleString()} PTS`;
    row.append(rankUser, wins, points); node.append(row);
  }
}
function renderMines() {
  const game = current.game;
  const board = $('minesBoard'); board.replaceChildren();
  if (!game) { $('minesRemaining').textContent = '—'; $('minesSafe').textContent = '—'; return; }
  board.style.setProperty('--cols', game.size);
  $('difficulty').value = game.difficulty;
  $('minesRemaining').textContent = String(Math.max(0, game.mineCount - game.flags)).padStart(2, '0');
  const safeCount = game.size * game.size - game.mineCount;
  $('minesSafe').textContent = `${game.revealed} / ${safeCount}`;
  $('minesFace').textContent = game.status === 'won' ? '✦' : game.status === 'lost' ? '×' : '◡';
  const result = $('minesResult'); result.classList.remove('won', 'lost');
  if (game.status === 'won') {
    result.textContent = `✦ Perfect clear! ${current.user ? `+${game.pointReward} skill points awarded.` : 'Create an account to earn skill points next time.'}`;
    result.classList.add('won');
  } else if (game.status === 'lost') { result.textContent = '✹ Mine hit! New board, new chance. The clues were there!'; result.classList.add('lost'); }
  else result.textContent = `Clear all ${safeCount} safe tiles to finish. This board is worth ${game.pointReward} skill points for signed-in players.`;
  game.tiles.forEach((value, i) => {
    const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'tile'; tile.dataset.index = i;
    const col = (i % game.size) + 1, row = Math.floor(i / game.size) + 1;
    if (value === null) { tile.setAttribute('aria-label', `Hidden tile row ${row}, column ${col}`); }
    else if (value === 'flag') { tile.classList.add('flagged'); tile.textContent = '⚑'; tile.setAttribute('aria-label', `Flagged tile row ${row}, column ${col}`); }
    else if (value === 'hit' || value === 'mine') { tile.classList.add(value); tile.textContent = '✹'; tile.setAttribute('aria-label', `${value === 'hit' ? 'Hit' : 'Hidden'} mine row ${row}, column ${col}`); }
    else { tile.classList.add('revealed'); tile.textContent = value || ''; tile.setAttribute('aria-label', `Revealed tile row ${row}, column ${col}, ${value} neighboring mines`); if (value > 0) tile.classList.add(`n${value}`); }
    if (game.status !== 'playing' || typeof value === 'number') tile.disabled = true;
    board.appendChild(tile);
  });
}
async function tileAction(index, action) {
  if (boardBusy || !current.game || current.game.status !== 'playing') return;
  boardBusy = true;
  try {
    const state = await request(`/api/mines/${action}`, { index });
    const previousStatus = current.game?.status;
    updateState(state);
    if (previousStatus === 'playing' && state.game?.status === 'won') toast(`PUZZLE CLEARED! ${state.user ? `+${state.game.pointReward} points!` : 'Nice work!'}`);
    if (previousStatus === 'playing' && state.game?.status === 'lost') toast('You hit a mine! Try another board.');
  } catch (err) { displayError(err); }
  finally { boardBusy = false; }
}
$('minesBoard').addEventListener('click', ev => {
  const tile = ev.target.closest('.tile');
  if (!tile) return;
  tileAction(Number(tile.dataset.index), flagging ? 'flag' : 'reveal');
});
$('minesBoard').addEventListener('contextmenu', ev => {
  const tile = ev.target.closest('.tile');
  if (!tile) return;
  ev.preventDefault(); tileAction(Number(tile.dataset.index), 'flag');
});
$('flagMode').addEventListener('click', () => {
  flagging = !flagging;
  $('flagMode').textContent = `⚑ FLAG MODE: ${flagging ? 'ON' : 'OFF'}`;
  $('flagMode').classList.toggle('is-on', flagging);
  $('flagMode').setAttribute('aria-pressed', String(flagging));
});
$('newMines').addEventListener('click', async () => {
  if (boardBusy) return;
  boardBusy = true;
  $('newMines').disabled = true;
  try { updateState(await request('/api/mines/start', { difficulty: $('difficulty').value })); toast('New puzzle generated. Good luck!'); }
  catch (err) { displayError(err); }
  finally { boardBusy = false; $('newMines').disabled = false; }
});
function showGame(game) {
  showing = game;
  document.querySelectorAll('button.game-card[data-game]').forEach(node => node.classList.toggle('active', node.dataset.game === game));
  $('minesPanel').classList.toggle('hidden', game !== 'mines');
  $('coinPanel').classList.toggle('hidden', game !== 'coin');
  if (window.innerWidth < 730) $('gamePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.querySelectorAll('button.game-card[data-game]').forEach(node => node.addEventListener('click', () => showGame(node.dataset.game)));
function renderCoinStats() {
  const user = current.user;
  $('coinFlips').textContent = String(user ? user.coinTosses : guestCoins.tosses);
  $('coinCorrect').textContent = String(user ? user.coinCorrect : guestCoins.correct);
}
async function flipCoin(guess) {
  if (coinBusy) return;
  coinBusy = true;
  $('flipHeads').disabled = $('flipTails').disabled = true;
  const coin = $('animatedCoin');
  $('coinStatus').textContent = 'FLIPPING...';
  coin.classList.remove('tossing', 'show-tails');
  void coin.offsetWidth;
  coin.classList.add('tossing');
  try {
    const [result] = await Promise.all([request('/api/coin/flip', { guess }), new Promise(r => setTimeout(r, 1670))]);
    coin.classList.remove('tossing');
    coin.classList.toggle('show-tails', result.side === 'tails');
    $('coinStatus').textContent = `${result.side.toUpperCase()}! ${result.correct ? 'YOU CALLED IT ✦' : 'TRY ANOTHER!'}`;
    if (result.user) current.user = result.user;
    else {
      guestCoins.tosses++; if (result.correct) guestCoins.correct++;
      try { localStorage.setItem('dr_guest_coins', JSON.stringify(guestCoins)); } catch { /* localStorage can be disabled */ }
    }
    renderCoinStats(); renderAccount();
  } catch (err) { coin.classList.remove('tossing'); displayError(err); $('coinStatus').textContent = 'FLIP AGAIN'; }
  finally { $('flipHeads').disabled = $('flipTails').disabled = false; coinBusy = false; }
}
$('flipHeads').addEventListener('click', () => flipCoin('heads'));
$('flipTails').addEventListener('click', () => flipCoin('tails'));
const dialog = $('accountDialog');
function setAuthMode(mode) {
  authMode = mode;
  $('loginTab').classList.toggle('active', mode === 'login');
  $('registerTab').classList.toggle('active', mode === 'register');
  $('authTitle').textContent = mode === 'login' ? 'Welcome back.' : 'Join the rush.';
  $('submitAuth').textContent = mode === 'login' ? 'LOG IN ↗' : 'CREATE ACCOUNT ↗';
  $('signForm').elements.password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('authError').classList.add('hidden');
}
function openAccount() {
  $('authForm').classList.toggle('hidden', Boolean(current.user));
  $('profileForm').classList.toggle('hidden', !current.user);
  if (current.user) {
    $('profileHeading').textContent = `${current.user.username}'s player card.`;
    $('mcName').value = current.user.minecraftName || '';
    $('publicRank').checked = current.user.showLeaderboard;
    $('profilePoints').textContent = current.user.points.toLocaleString();
    $('profileWins').textContent = current.user.minesWins;
  }
  dialog.showModal();
}
$('authButton').addEventListener('click', openAccount);
$('profileButton').addEventListener('click', openAccount);
$('closeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', ev => { if (ev.target === dialog) dialog.close(); });
$('loginTab').addEventListener('click', () => setAuthMode('login'));
$('registerTab').addEventListener('click', () => setAuthMode('register'));
$('signForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const form = ev.currentTarget;
  const submit = $('submitAuth'); submit.disabled = true;
  const error = $('authError'); error.classList.add('hidden');
  try {
    const result = await request(authMode === 'login' ? '/api/login' : '/api/register', {
      username: form.elements.username.value.trim(), password: form.elements.password.value
    });
    updateState(result.game ? result : await request('/api/mines/start', { difficulty: $('difficulty').value || 'easy' }));
    form.reset(); dialog.close(); toast(`Welcome ${result.user.username}! You're in.`);
  } catch (err) { error.textContent = err.message; error.classList.remove('hidden'); }
  finally { submit.disabled = false; }
});
$('saveProfile').addEventListener('submit', async ev => {
  ev.preventDefault();
  const error = $('profileError'); error.classList.add('hidden');
  try {
    updateState(await request('/api/profile', { minecraftName: $('mcName').value.trim(), showLeaderboard: $('publicRank').checked }));
    dialog.close(); toast('Profile updated!');
  } catch (err) { error.textContent = err.message; error.classList.remove('hidden'); }
});
$('logoutButton').addEventListener('click', async () => {
  try {
    await request('/api/logout', {});
    updateState(await request('/api/state'));
    if (!current.game) updateState(await request('/api/mines/start', { difficulty: 'easy' }));
    dialog.close(); toast('Logged out. See you again!');
  } catch (err) { displayError(err); }
});
(async () => {
  try {
    const state = await request('/api/state');
    updateState(state);
    if (!state.game) updateState(await request('/api/mines/start', { difficulty: 'easy' }));
  } catch (err) {
    displayError(err);
    $('minesResult').textContent = 'Could not reach the game server. Launch DonutRush through the Node.js server to play.';
    $('leaderboardRows').textContent = 'Could not load leaderboard.';
  }
})();
