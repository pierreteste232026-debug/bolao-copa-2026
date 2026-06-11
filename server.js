const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_DIR = path.join(ROOT, 'database');
const DB_PATH = path.join(DB_DIR, 'bolao-copa-2026.sqlite');
const SEED_PATH = path.join(DATA_DIR, 'seed.json');
const ADMIN_KEY = process.env.ADMIN_KEY || 'copa2026-admin';
const DEFAULT_PORT = Number(process.env.PORT || 2026);
const AUTO_SYNC_RESULTS = process.env.AUTO_SYNC_RESULTS !== 'false';
const AUTO_SYNC_MINUTES = Math.max(1, Number(process.env.AUTO_SYNC_MINUTES || 10));

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

const stageNames = {
  'group-stage': 'Fase de grupos',
  'round-of-32': 'Fase de 32',
  'round-of-16': 'Oitavas',
  quarterfinals: 'Quartas',
  semifinals: 'Semifinais',
  '3rd-place-match': 'Terceiro lugar',
  final: 'Final'
};

const ptNames = {
  Mexico: 'Mexico',
  'South Africa': 'Africa do Sul',
  'South Korea': 'Coreia do Sul',
  Czechia: 'Tchequia',
  Canada: 'Canada',
  'Bosnia-Herzegovina': 'Bosnia e Herzegovina',
  'United States': 'Estados Unidos',
  Paraguay: 'Paraguai',
  Qatar: 'Catar',
  Switzerland: 'Suica',
  Brazil: 'Brasil',
  Morocco: 'Marrocos',
  Haiti: 'Haiti',
  Scotland: 'Escocia',
  Australia: 'Australia',
  'Türkiye': 'Turquia',
  Germany: 'Alemanha',
  'Curaçao': 'Curacao',
  Netherlands: 'Paises Baixos',
  Japan: 'Japao',
  'Ivory Coast': 'Costa do Marfim',
  Ecuador: 'Equador',
  Sweden: 'Suecia',
  Tunisia: 'Tunisia',
  Spain: 'Espanha',
  'Cape Verde': 'Cabo Verde',
  Belgium: 'Belgica',
  Egypt: 'Egito',
  'Saudi Arabia': 'Arabia Saudita',
  Uruguay: 'Uruguai',
  Iran: 'Ira',
  'New Zealand': 'Nova Zelandia',
  France: 'Franca',
  Senegal: 'Senegal',
  Iraq: 'Iraque',
  Norway: 'Noruega',
  Argentina: 'Argentina',
  Algeria: 'Argelia',
  Austria: 'Austria',
  Jordan: 'Jordania',
  Portugal: 'Portugal',
  'Congo DR': 'RD Congo',
  England: 'Inglaterra',
  Croatia: 'Croacia',
  Ghana: 'Gana',
  Panama: 'Panama',
  Uzbekistan: 'Uzbequistao',
  Colombia: 'Colombia'
};

const roundOrder = [
  'Rodada 1',
  'Rodada 2',
  'Rodada 3',
  'Fase de 32',
  'Oitavas',
  'Quartas',
  'Semifinais',
  'Terceiro lugar',
  'Final'
];

function createSchema() {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      espn_id TEXT NOT NULL UNIQUE,
      abbreviation TEXT NOT NULL,
      name TEXT NOT NULL,
      source_name TEXT,
      logo TEXT,
      color TEXT,
      alternate_color TEXT,
      group_name TEXT,
      group_position INTEGER,
      is_placeholder INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      espn_id TEXT NOT NULL UNIQUE,
      match_number INTEGER NOT NULL UNIQUE,
      date_utc TEXT NOT NULL,
      stage_slug TEXT NOT NULL,
      stage_name TEXT NOT NULL,
      round_name TEXT NOT NULL,
      group_name TEXT,
      venue TEXT,
      status TEXT NOT NULL DEFAULT 'Scheduled',
      completed INTEGER NOT NULL DEFAULT 0,
      home_team_id INTEGER NOT NULL REFERENCES teams(id),
      away_team_id INTEGER NOT NULL REFERENCES teams(id),
      home_score INTEGER,
      away_score INTEGER
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, match_id)
    );
  `);
}

function seedDatabase() {
  const current = db.prepare('SELECT COUNT(*) AS total FROM matches').get().total;
  if (current > 0) return;
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Seed não encontrada em ${SEED_PATH}`);
  }

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const groupPositions = new Map();
  for (const group of seed.groups) {
    group.teams.forEach((team, index) => {
      groupPositions.set(String(team.espnId), index + 1);
    });
  }

  const insertTeam = db.prepare(`
    INSERT INTO teams (
      espn_id, abbreviation, name, source_name, logo, color, alternate_color,
      group_name, group_position, is_placeholder
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const teamId = db.prepare('SELECT id FROM teams WHERE espn_id = ?');
  const insertMatch = db.prepare(`
    INSERT INTO matches (
      espn_id, match_number, date_utc, stage_slug, stage_name, round_name,
      group_name, venue, status, completed, home_team_id, away_team_id,
      home_score, away_score
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const team of seed.teams) {
      insertTeam.run(
        String(team.espnId),
        team.abbreviation || 'TBD',
        team.name || team.sourceName || 'A definir',
        team.sourceName || team.name || 'A definir',
        team.logo || '',
        team.color || '1f2937',
        team.alternateColor || 'ffffff',
        team.groupName || null,
        groupPositions.get(String(team.espnId)) || null,
        team.isPlaceholder ? 1 : 0
      );
    }

    for (const match of seed.matches) {
      insertMatch.run(
        String(match.espnId),
        match.matchNumber,
        match.dateUtc,
        match.stageSlug,
        match.stageName,
        match.roundName,
        match.groupName,
        match.venue || '',
        match.status || 'Scheduled',
        match.completed ? 1 : 0,
        teamId.get(String(match.homeTeamId)).id,
        teamId.get(String(match.awayTeamId)).id,
        Number.isInteger(match.homeScore) ? match.homeScore : null,
        Number.isInteger(match.awayScore) ? match.awayScore : null
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto
    .pbkdf2Sync(String(password), salt, 120000, 64, 'sha512')
    .toString('hex');
  return { salt, passwordHash };
}

function verifyPassword(password, salt, storedHash) {
  const { passwordHash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(passwordHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    tokenHash,
    expiresAt
  );
  return { token, expiresAt };
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function getUserFromRequest(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = db.prepare(`
    SELECT u.id, u.name, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now')
  `).get(tokenHash);
  return row || null;
}

function requireUser(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: 'Entre ou cadastre-se para continuar.' });
    return null;
  }
  return user;
}

function requireAdmin(req, res, body) {
  const key = req.headers['x-admin-key'] || body?.adminKey;
  if (key !== ADMIN_KEY) {
    sendJson(res, 403, { error: 'Chave do organizador inválida.' });
    return false;
  }
  return true;
}

function isValidScore(value) {
  return Number.isInteger(value) && value >= 0 && value <= 99;
}

function isPredictionLocked(match) {
  return Boolean(match.completed) || Date.now() >= Date.parse(match.date_utc);
}

function getRounds() {
  const rows = db.prepare(`
    SELECT DISTINCT round_name AS name
    FROM matches
  `).all();
  return rows
    .map(row => row.name)
    .sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));
}

function getMatches() {
  return db.prepare(`
    SELECT
      m.id, m.espn_id AS espnId, m.match_number AS matchNumber, m.date_utc AS dateUtc,
      m.stage_slug AS stageSlug, m.stage_name AS stageName, m.round_name AS roundName,
      m.group_name AS groupName, m.venue, m.status, m.completed,
      m.home_score AS homeScore, m.away_score AS awayScore,
      ht.id AS homeId, ht.name AS homeName, ht.abbreviation AS homeAbbr,
      ht.logo AS homeLogo, ht.color AS homeColor, ht.is_placeholder AS homePlaceholder,
      at.id AS awayId, at.name AS awayName, at.abbreviation AS awayAbbr,
      at.logo AS awayLogo, at.color AS awayColor, at.is_placeholder AS awayPlaceholder
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    ORDER BY m.match_number
  `).all().map(row => ({
    id: row.id,
    espnId: row.espnId,
    matchNumber: row.matchNumber,
    dateUtc: row.dateUtc,
    stageSlug: row.stageSlug,
    stageName: row.stageName,
    roundName: row.roundName,
    groupName: row.groupName,
    venue: row.venue,
    status: row.status,
    completed: Boolean(row.completed),
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    home: {
      id: row.homeId,
      name: row.homeName,
      abbreviation: row.homeAbbr,
      logo: row.homeLogo,
      color: row.homeColor,
      isPlaceholder: Boolean(row.homePlaceholder)
    },
    away: {
      id: row.awayId,
      name: row.awayName,
      abbreviation: row.awayAbbr,
      logo: row.awayLogo,
      color: row.awayColor,
      isPlaceholder: Boolean(row.awayPlaceholder)
    }
  }));
}

function getPredictions(userId) {
  if (!userId) return {};
  const rows = db.prepare(`
    SELECT match_id AS matchId, home_score AS homeScore, away_score AS awayScore
    FROM predictions
    WHERE user_id = ?
  `).all(userId);
  return Object.fromEntries(rows.map(row => [row.matchId, row]));
}

function getStandings() {
  const teams = db.prepare(`
    SELECT id, name, abbreviation, logo, color, group_name AS groupName, group_position AS groupPosition
    FROM teams
    WHERE is_placeholder = 0 AND group_name IS NOT NULL
    ORDER BY group_name, group_position
  `).all();
  const groups = new Map();

  for (const team of teams) {
    if (!groups.has(team.groupName)) groups.set(team.groupName, []);
    groups.get(team.groupName).push({
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      logo: team.logo,
      color: team.color,
      groupPosition: team.groupPosition || 99,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0
    });
  }

  const byId = new Map(teams.map(team => [team.id, groups.get(team.groupName).find(item => item.id === team.id)]));
  const completed = db.prepare(`
    SELECT home_team_id AS homeId, away_team_id AS awayId, home_score AS homeScore, away_score AS awayScore
    FROM matches
    WHERE stage_slug = 'group-stage' AND completed = 1
  `).all();

  for (const match of completed) {
    const home = byId.get(match.homeId);
    const away = byId.get(match.awayId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (match.homeScore < match.awayScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...groups.entries()].map(([name, entries]) => ({
    name,
    teams: entries
      .map(team => ({ ...team, goalDiff: team.goalsFor - team.goalsAgainst }))
      .sort((a, b) =>
        b.points - a.points ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor ||
        a.groupPosition - b.groupPosition
      )
  }));
}

function getLeaderboard() {
  const users = db.prepare(`
    SELECT id, name, email, created_at AS createdAt
    FROM users
    ORDER BY created_at
  `).all();
  const board = new Map(users.map(user => [
    user.id,
    {
      id: user.id,
      name: user.name,
      email: user.email,
      points: 0,
      exact: 0,
      predictions: 0
    }
  ]));

  const rows = db.prepare(`
    SELECT
      p.user_id AS userId, p.home_score AS predictedHome, p.away_score AS predictedAway,
      m.home_score AS actualHome, m.away_score AS actualAway, m.completed
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
  `).all();

  for (const row of rows) {
    const player = board.get(row.userId);
    if (!player) continue;
    player.predictions += 1;
    if (!row.completed) continue;

    if (row.predictedHome === row.actualHome && row.predictedAway === row.actualAway) {
      player.points += 1;
      player.exact += 1;
    }
  }

  return [...board.values()].sort((a, b) =>
    b.points - a.points ||
    b.exact - a.exact ||
    b.predictions - a.predictions ||
    a.name.localeCompare(b.name)
  ).map((player, index) => ({ ...player, position: index + 1 }));
}

function getStats() {
  const users = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  const predictions = db.prepare('SELECT COUNT(*) AS total FROM predictions').get().total;
  const completed = db.prepare('SELECT COUNT(*) AS total FROM matches WHERE completed = 1').get().total;
  return { users, predictions, completed, totalMatches: 104 };
}

function bootstrap(req) {
  const user = getUserFromRequest(req);
  return {
    user,
    rounds: getRounds(),
    matches: getMatches(),
    predictions: getPredictions(user?.id),
    standings: getStandings(),
    leaderboard: getLeaderboard(),
    stats: getStats()
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload muito grande.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function safePath(urlPath) {
  const requested = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  return filePath.startsWith(PUBLIC_DIR) ? filePath : null;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml; charset=utf-8'
  }[ext] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  const filePath = safePath(pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': filePath.endsWith('.html') ? 'no-store' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

function localTeamName(name) {
  if (ptNames[name]) return ptNames[name];
  return String(name || 'A definir')
    .replace(/Group ([A-L]) Winner/g, 'Vencedor do Grupo $1')
    .replace(/Group ([A-L]) 2nd Place/g, '2o do Grupo $1')
    .replace(/Third Place Group /g, '3o colocado Grupos ')
    .replace(/Round of 32 (\d+) Winner/g, 'Vencedor Fase de 32 - Jogo $1')
    .replace(/Round of 16 (\d+) Winner/g, 'Vencedor Oitavas - Jogo $1')
    .replace(/Quarterfinal (\d+) Winner/g, 'Vencedor Quartas - Jogo $1')
    .replace(/Semifinal (\d+) Winner/g, 'Vencedor Semi - Jogo $1')
    .replace(/Semifinal (\d+) Loser/g, 'Perdedor Semi - Jogo $1');
}

function roundNameFor(slug, matchNumber) {
  if (slug !== 'group-stage') return stageNames[slug] || slug;
  if (matchNumber <= 24) return 'Rodada 1';
  if (matchNumber <= 48) return 'Rodada 2';
  return 'Rodada 3';
}

function upsertTeamFromApi(team) {
  const existing = db.prepare('SELECT id FROM teams WHERE espn_id = ?').get(String(team.id));
  if (existing) {
    db.prepare(`
      UPDATE teams
      SET abbreviation = ?, name = ?, source_name = ?, logo = ?, color = ?, alternate_color = ?
      WHERE id = ?
    `).run(
      team.abbreviation || 'TBD',
      localTeamName(team.displayName),
      team.displayName || '',
      team.logo || '',
      team.color || '1f2937',
      team.alternateColor || 'ffffff',
      existing.id
    );
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO teams (
      espn_id, abbreviation, name, source_name, logo, color, alternate_color, is_placeholder
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(team.id),
    team.abbreviation || 'TBD',
    localTeamName(team.displayName),
    team.displayName || '',
    team.logo || '',
    team.color || '1f2937',
    team.alternateColor || 'ffffff',
    team.isActive === false ? 1 : 0
  );
  return Number(result.lastInsertRowid);
}

async function syncFromEspn() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const data = await fetch(seed.source.schedule, {
    headers: { 'user-agent': 'Mozilla/5.0 (Bolão Copa 2026)' }
  }).then(response => {
    if (!response.ok) throw new Error(`ESPN respondeu ${response.status}`);
    return response.json();
  });

  const update = db.prepare(`
    UPDATE matches
    SET date_utc = ?, stage_slug = ?, stage_name = ?, round_name = ?, group_name = ?,
        venue = ?, status = ?, completed = ?, home_team_id = ?, away_team_id = ?,
        home_score = ?, away_score = ?
    WHERE espn_id = ?
  `);

  let changed = 0;
  const events = data.events.sort((a, b) => new Date(a.date) - new Date(b.date));
  db.exec('BEGIN');
  try {
    events.forEach((event, index) => {
      const competition = event.competitions[0];
      const competitors = [...competition.competitors].sort((a, b) => (a.homeAway === 'home' ? -1 : 1));
      const [home, away] = competitors;
      const homeId = upsertTeamFromApi(home.team);
      const awayId = upsertTeamFromApi(away.team);
      const slug = event.season?.slug || 'group-stage';
      const completed = event.status?.type?.completed ? 1 : 0;
      const status = event.status?.type?.description || 'Scheduled';
      const venue = competition.venue?.fullName || competition.venue?.displayName || event.venue?.displayName || '';

      const result = update.run(
        event.date,
        slug,
        stageNames[slug] || slug,
        roundNameFor(slug, index + 1),
        slug === 'group-stage' ? db.prepare('SELECT group_name AS groupName FROM teams WHERE id = ?').get(homeId)?.groupName : null,
        venue,
        status,
        completed,
        homeId,
        awayId,
        completed ? Number(home.score || 0) : null,
        completed ? Number(away.score || 0) : null,
        String(event.id)
      );
      changed += result.changes;
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { changed, events: events.length };
}

async function runAutoSync(reason = 'intervalo') {
  if (!AUTO_SYNC_RESULTS) return;
  try {
    const result = await syncFromEspn();
    console.log(`[placares] Verificação ${reason}: ${result.events} jogos, ${result.changed} atualizados.`);
  } catch (error) {
    console.error(`[placares] Falha na verificação ${reason}:`, error.message);
  }
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      sendJson(res, 200, bootstrap(req));
      return;
    }

    const body = await readJson(req);

    if (req.method === 'POST' && pathname === '/api/admin/verify') {
      if (!requireAdmin(req, res, body)) return;
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/register') {
      const name = String(body.name || '').trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');

      if (name.length < 2) return sendJson(res, 400, { error: 'Informe um nome válido.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Informe um e-mail válido.' });
      if (password.length < 6) return sendJson(res, 400, { error: 'A senha precisa ter pelo menos 6 caracteres.' });

      const { salt, passwordHash } = hashPassword(password);
      try {
        const result = db.prepare(`
          INSERT INTO users (name, email, password_hash, salt)
          VALUES (?, ?, ?, ?)
        `).run(name, email, passwordHash, salt);
        const session = createSession(Number(result.lastInsertRowid));
        return sendJson(res, 201, { user: { id: Number(result.lastInsertRowid), name, email }, ...session });
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) return sendJson(res, 409, { error: 'Esse e-mail já está cadastrado.' });
        throw error;
      }
    }

    if (req.method === 'POST' && pathname === '/api/login') {
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
        return sendJson(res, 401, { error: 'E-mail ou senha inválidos.' });
      }
      const session = createSession(user.id);
      return sendJson(res, 200, {
        user: { id: user.id, name: user.name, email: user.email },
        ...session
      });
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
      const token = getBearerToken(req);
      if (token) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && pathname === '/api/predictions') {
      const user = requireUser(req, res);
      if (!user) return;

      const predictions = Array.isArray(body.predictions) ? body.predictions : [];
      const upsert = db.prepare(`
        INSERT INTO predictions (user_id, match_id, home_score, away_score, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, match_id)
        DO UPDATE SET home_score = excluded.home_score,
                      away_score = excluded.away_score,
                      updated_at = CURRENT_TIMESTAMP
      `);
      const findMatch = db.prepare('SELECT id, date_utc, completed FROM matches WHERE id = ?');

      db.exec('BEGIN');
      try {
        for (const prediction of predictions) {
          const matchId = Number(prediction.matchId);
          const homeScore = Number(prediction.homeScore);
          const awayScore = Number(prediction.awayScore);
          const match = findMatch.get(matchId);
          if (!match || !isValidScore(homeScore) || !isValidScore(awayScore)) {
            throw new Error('Palpite inválido.');
          }
          if (isPredictionLocked(match)) {
            throw new Error('Palpites bloqueados: o jogo já começou ou foi encerrado.');
          }
          upsert.run(user.id, matchId, homeScore, awayScore);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        return sendJson(res, 400, { error: error.message });
      }

      return sendJson(res, 200, { ok: true, saved: predictions.length, data: bootstrap(req) });
    }

    if (req.method === 'POST' && pathname === '/api/results') {
      if (!requireAdmin(req, res, body)) return;
      const results = Array.isArray(body.results) ? body.results : [];
      const update = db.prepare(`
        UPDATE matches
        SET home_score = ?, away_score = ?, completed = ?, status = ?
        WHERE id = ?
      `);
      db.exec('BEGIN');
      try {
        for (const item of results) {
          const matchId = Number(item.matchId);
          const completed = Boolean(item.completed);
          const homeScore = completed ? Number(item.homeScore) : null;
          const awayScore = completed ? Number(item.awayScore) : null;
          if (completed && (!isValidScore(homeScore) || !isValidScore(awayScore))) {
            throw new Error('Resultado inválido.');
          }
          update.run(homeScore, awayScore, completed ? 1 : 0, completed ? 'Completed' : 'Scheduled', matchId);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        return sendJson(res, 400, { error: error.message });
      }
      return sendJson(res, 200, { ok: true, saved: results.length, data: bootstrap(req) });
    }

    if (req.method === 'POST' && pathname === '/api/sync') {
      if (!requireAdmin(req, res, body)) return;
      const result = await syncFromEspn();
      return sendJson(res, 200, { ok: true, ...result, data: bootstrap(req) });
    }

    sendJson(res, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Erro interno.' });
  }
}

createSchema();
seedDatabase();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url.pathname);
    return;
  }
  serveStatic(req, res, url.pathname);
});

function listen(port) {
  server.once('error', error => {
    if (error.code === 'EADDRINUSE') {
      listen(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, () => {
    console.log(`Bolão Copa 2026 rodando em http://localhost:${port}`);
    console.log(`Banco SQLite: ${DB_PATH}`);
    if (AUTO_SYNC_RESULTS) {
      console.log(`Verificação automática de placares: a cada ${AUTO_SYNC_MINUTES} minuto(s).`);
      setTimeout(() => runAutoSync('inicial'), 5000);
      setInterval(() => runAutoSync(), AUTO_SYNC_MINUTES * 60 * 1000);
    }
  });
}

listen(DEFAULT_PORT);
