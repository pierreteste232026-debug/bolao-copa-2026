const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@libsql/client/web');

const ADMIN_KEY = process.env.ADMIN_KEY || 'copa2026-admin';
const AUTO_SYNC_RESULTS = process.env.AUTO_SYNC_RESULTS !== 'false';
const AUTO_SYNC_MINUTES = Math.max(1, Number(process.env.AUTO_SYNC_MINUTES || 10));

const stageNames = {
  'group-stage': 'Fase de grupos',
  'round-of-32': 'Fase de 32',
  'round-of-16': 'Oitavas',
  quarterfinals: 'Quartas',
  semifinals: 'Semifinais',
  '3rd-place-match': 'Terceiro lugar',
  final: 'Final'
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

let client;
let readyPromise;

function getDb() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error('Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no Netlify.');
  }
  client = createClient({ url, authToken });
  return client;
}

async function execute(sql, args = []) {
  return getDb().execute({ sql, args });
}

async function one(sql, args = []) {
  const result = await execute(sql, args);
  return result.rows[0] || null;
}

async function all(sql, args = []) {
  const result = await execute(sql, args);
  return result.rows;
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

function readSeed() {
  const candidates = [
    path.join(process.cwd(), 'data', 'seed.json'),
    path.join(__dirname, '..', '..', 'data', 'seed.json')
  ];
  const seedPath = candidates.find(item => fs.existsSync(item));
  if (!seedPath) throw new Error('Seed não encontrada.');
  return JSON.parse(fs.readFileSync(seedPath, 'utf8'));
}

async function createSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS teams (
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
    )`,
    `CREATE TABLE IF NOT EXISTS matches (
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
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, match_id)
    )`,
    `CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`
  ];
  for (const statement of statements) await execute(statement);
}

async function seedDatabase() {
  const current = await one('SELECT COUNT(*) AS total FROM matches');
  if (Number(current?.total || 0) > 0) return;

  const seed = readSeed();
  const groupPositions = new Map();
  for (const group of seed.groups) {
    group.teams.forEach((team, index) => groupPositions.set(String(team.espnId), index + 1));
  }

  for (const team of seed.teams) {
    await execute(
      `INSERT INTO teams (
        espn_id, abbreviation, name, source_name, logo, color, alternate_color,
        group_name, group_position, is_placeholder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(espn_id) DO UPDATE SET
        abbreviation = excluded.abbreviation,
        name = excluded.name,
        source_name = excluded.source_name,
        logo = excluded.logo,
        color = excluded.color,
        alternate_color = excluded.alternate_color,
        group_name = excluded.group_name,
        group_position = excluded.group_position,
        is_placeholder = excluded.is_placeholder`,
      [
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
      ]
    );
  }

  for (const match of seed.matches) {
    const home = await one('SELECT id FROM teams WHERE espn_id = ?', [String(match.homeTeamId)]);
    const away = await one('SELECT id FROM teams WHERE espn_id = ?', [String(match.awayTeamId)]);
    await execute(
      `INSERT INTO matches (
        espn_id, match_number, date_utc, stage_slug, stage_name, round_name,
        group_name, venue, status, completed, home_team_id, away_team_id,
        home_score, away_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(espn_id) DO UPDATE SET
        match_number = excluded.match_number,
        date_utc = excluded.date_utc,
        stage_slug = excluded.stage_slug,
        stage_name = excluded.stage_name,
        round_name = excluded.round_name,
        group_name = excluded.group_name,
        venue = excluded.venue,
        status = excluded.status,
        completed = excluded.completed,
        home_team_id = excluded.home_team_id,
        away_team_id = excluded.away_team_id,
        home_score = excluded.home_score,
        away_score = excluded.away_score`,
      [
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
        Number(home.id),
        Number(away.id),
        Number.isInteger(match.homeScore) ? match.homeScore : null,
        Number.isInteger(match.awayScore) ? match.awayScore : null
      ]
    );
  }
}

async function ensureDatabase() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await createSchema();
      await seedDatabase();
    })();
  }
  return readyPromise;
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

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await execute('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [
    userId,
    tokenHash,
    expiresAt
  ]);
  return { token, expiresAt };
}

function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function getUserFromEvent(event) {
  const token = getBearerToken(event);
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return one(
    `SELECT u.id, u.name, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [tokenHash, new Date().toISOString()]
  );
}

async function requireUser(event) {
  const user = await getUserFromEvent(event);
  if (!user) {
    const error = new Error('Entre ou cadastre-se para continuar.');
    error.statusCode = 401;
    throw error;
  }
  return user;
}

function requireAdmin(body, event) {
  const key = event.headers['x-admin-key'] || event.headers['X-Admin-Key'] || body?.adminKey;
  if (key !== ADMIN_KEY) {
    const error = new Error('Chave do organizador inválida.');
    error.statusCode = 403;
    throw error;
  }
}

function isValidScore(value) {
  return Number.isInteger(value) && value >= 0 && value <= 99;
}

function isPredictionLocked(match) {
  return Boolean(match.completed) || Date.now() >= Date.parse(match.date_utc);
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

async function getRounds() {
  const rows = await all('SELECT DISTINCT round_name AS name FROM matches');
  return rows.map(row => row.name).sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));
}

async function getMatches() {
  const rows = await all(
    `SELECT
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
    ORDER BY m.match_number`
  );

  return rows.map(row => ({
    id: Number(row.id),
    espnId: row.espnId,
    matchNumber: Number(row.matchNumber),
    dateUtc: row.dateUtc,
    stageSlug: row.stageSlug,
    stageName: row.stageName,
    roundName: row.roundName,
    groupName: row.groupName,
    venue: row.venue,
    status: row.status,
    completed: Boolean(row.completed),
    homeScore: row.homeScore === null ? null : Number(row.homeScore),
    awayScore: row.awayScore === null ? null : Number(row.awayScore),
    home: {
      id: Number(row.homeId),
      name: row.homeName,
      abbreviation: row.homeAbbr,
      logo: row.homeLogo,
      color: row.homeColor,
      isPlaceholder: Boolean(row.homePlaceholder)
    },
    away: {
      id: Number(row.awayId),
      name: row.awayName,
      abbreviation: row.awayAbbr,
      logo: row.awayLogo,
      color: row.awayColor,
      isPlaceholder: Boolean(row.awayPlaceholder)
    }
  }));
}

async function getPredictions(userId) {
  if (!userId) return {};
  const rows = await all('SELECT match_id AS matchId, home_score AS homeScore, away_score AS awayScore FROM predictions WHERE user_id = ?', [userId]);
  return Object.fromEntries(rows.map(row => [Number(row.matchId), {
    matchId: Number(row.matchId),
    homeScore: Number(row.homeScore),
    awayScore: Number(row.awayScore)
  }]));
}

async function getPublicPredictions(userId) {
  if (!userId) return [];
  const rows = await all(
    `SELECT
      p.match_id AS matchId, p.user_id AS userId, u.name AS userName,
      p.home_score AS homeScore, p.away_score AS awayScore,
      m.date_utc AS dateUtc, m.completed
    FROM predictions p
    JOIN users u ON u.id = p.user_id
    JOIN matches m ON m.id = p.match_id
    ORDER BY m.match_number, u.name`
  );

  return rows
    .filter(row => Number(row.userId) === Number(userId) || isPredictionLocked({ date_utc: row.dateUtc, completed: row.completed }))
    .map(row => ({
      matchId: Number(row.matchId),
      userId: Number(row.userId),
      userName: row.userName,
      homeScore: Number(row.homeScore),
      awayScore: Number(row.awayScore),
      isMine: Number(row.userId) === Number(userId)
    }));
}

async function getStandings() {
  const teams = await all(
    `SELECT id, name, abbreviation, logo, color, group_name AS groupName, group_position AS groupPosition
     FROM teams
     WHERE is_placeholder = 0 AND group_name IS NOT NULL
     ORDER BY group_name, group_position`
  );
  const groups = new Map();

  for (const team of teams) {
    if (!groups.has(team.groupName)) groups.set(team.groupName, []);
    groups.get(team.groupName).push({
      id: Number(team.id),
      name: team.name,
      abbreviation: team.abbreviation,
      logo: team.logo,
      color: team.color,
      groupPosition: Number(team.groupPosition || 99),
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

  const byId = new Map();
  for (const entries of groups.values()) {
    for (const team of entries) byId.set(team.id, team);
  }

  const completed = await all(
    `SELECT home_team_id AS homeId, away_team_id AS awayId, home_score AS homeScore, away_score AS awayScore
     FROM matches
     WHERE stage_slug = 'group-stage' AND completed = 1`
  );

  for (const match of completed) {
    const home = byId.get(Number(match.homeId));
    const away = byId.get(Number(match.awayId));
    if (!home || !away) continue;
    const homeScore = Number(match.homeScore);
    const awayScore = Number(match.awayScore);
    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;
    if (homeScore > awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (homeScore < awayScore) {
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

async function getLeaderboard() {
  const users = await all('SELECT id, name, email, created_at AS createdAt FROM users ORDER BY created_at');
  const board = new Map(users.map(user => [
    Number(user.id),
    {
      id: Number(user.id),
      name: user.name,
      email: user.email,
      points: 0,
      exact: 0,
      predictions: 0
    }
  ]));

  const rows = await all(
    `SELECT
      p.user_id AS userId, p.home_score AS predictedHome, p.away_score AS predictedAway,
      m.home_score AS actualHome, m.away_score AS actualAway, m.completed
    FROM predictions p
    JOIN matches m ON m.id = p.match_id`
  );

  for (const row of rows) {
    const player = board.get(Number(row.userId));
    if (!player) continue;
    player.predictions += 1;
    if (!row.completed) continue;
    if (Number(row.predictedHome) === Number(row.actualHome) && Number(row.predictedAway) === Number(row.actualAway)) {
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

async function getStats() {
  const users = await one('SELECT COUNT(*) AS total FROM users');
  const predictions = await one('SELECT COUNT(*) AS total FROM predictions');
  const completed = await one('SELECT COUNT(*) AS total FROM matches WHERE completed = 1');
  return {
    users: Number(users?.total || 0),
    predictions: Number(predictions?.total || 0),
    completed: Number(completed?.total || 0),
    totalMatches: 104
  };
}

async function bootstrap(event, options = {}) {
  if (!options.skipAutoSync) await maybeAutoSync();
  const user = await getUserFromEvent(event);
  return {
    user,
    rounds: await getRounds(),
    matches: await getMatches(),
    predictions: await getPredictions(user?.id),
    publicPredictions: await getPublicPredictions(user?.id),
    standings: await getStandings(),
    leaderboard: await getLeaderboard(),
    stats: await getStats()
  };
}

async function upsertTeamFromApi(team) {
  const existing = await one('SELECT id FROM teams WHERE espn_id = ?', [String(team.id)]);
  if (existing) {
    await execute(
      `UPDATE teams
       SET abbreviation = ?, name = ?, source_name = ?, logo = ?, color = ?, alternate_color = ?
       WHERE id = ?`,
      [
        team.abbreviation || 'TBD',
        localTeamName(team.displayName),
        team.displayName || '',
        team.logo || '',
        team.color || '1f2937',
        team.alternateColor || 'ffffff',
        Number(existing.id)
      ]
    );
    return Number(existing.id);
  }

  await execute(
    `INSERT INTO teams (
      espn_id, abbreviation, name, source_name, logo, color, alternate_color, is_placeholder
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(team.id),
      team.abbreviation || 'TBD',
      localTeamName(team.displayName),
      team.displayName || '',
      team.logo || '',
      team.color || '1f2937',
      team.alternateColor || 'ffffff',
      team.isActive === false ? 1 : 0
    ]
  );
  const created = await one('SELECT id FROM teams WHERE espn_id = ?', [String(team.id)]);
  return Number(created.id);
}

async function syncFromEspn() {
  const seed = readSeed();
  const data = await fetch(seed.source.schedule, {
    headers: { 'user-agent': 'Mozilla/5.0 (Bolao Copa 2026)' }
  }).then(response => {
    if (!response.ok) throw new Error(`ESPN respondeu ${response.status}`);
    return response.json();
  });

  let changed = 0;
  const events = data.events.sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const [index, event] of events.entries()) {
    const competition = event.competitions[0];
    const competitors = [...competition.competitors].sort((a, b) => (a.homeAway === 'home' ? -1 : 1));
    const [home, away] = competitors;
    const homeId = await upsertTeamFromApi(home.team);
    const awayId = await upsertTeamFromApi(away.team);
    const slug = event.season?.slug || 'group-stage';
    const completed = event.status?.type?.completed ? 1 : 0;
    const status = event.status?.type?.description || 'Scheduled';
    const venue = competition.venue?.fullName || competition.venue?.displayName || event.venue?.displayName || '';
    const homeGroup = await one('SELECT group_name AS groupName FROM teams WHERE id = ?', [homeId]);

    const result = await execute(
      `UPDATE matches
       SET date_utc = ?, stage_slug = ?, stage_name = ?, round_name = ?, group_name = ?,
           venue = ?, status = ?, completed = ?, home_team_id = ?, away_team_id = ?,
           home_score = ?, away_score = ?
       WHERE espn_id = ?`,
      [
        event.date,
        slug,
        stageNames[slug] || slug,
        roundNameFor(slug, index + 1),
        slug === 'group-stage' ? homeGroup?.groupName : null,
        venue,
        status,
        completed,
        homeId,
        awayId,
        completed ? Number(home.score || 0) : null,
        completed ? Number(away.score || 0) : null,
        String(event.id)
      ]
    );
    changed += Number(result.rowsAffected || 0);
  }

  await execute(
    `INSERT INTO metadata (key, value) VALUES ('last_espn_sync', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [new Date().toISOString()]
  );
  return { changed, events: events.length };
}

async function maybeAutoSync() {
  if (!AUTO_SYNC_RESULTS) return;
  const last = await one("SELECT value FROM metadata WHERE key = 'last_espn_sync'");
  const lastTime = last?.value ? Date.parse(last.value) : 0;
  if (Date.now() - lastTime < AUTO_SYNC_MINUTES * 60 * 1000) return;
  try {
    await syncFromEspn();
  } catch (error) {
    console.error('Falha ao sincronizar ESPN:', error.message);
  }
}

function parseBody(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(text || '{}');
}

function normalizePath(event) {
  const raw = event.path || '/';
  return raw
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '') || '/';
}

exports.handler = async event => {
  try {
    await ensureDatabase();

    const pathname = normalizePath(event);
    const method = event.httpMethod;

    if (method === 'GET' && pathname === '/health') {
      return json(200, { ok: true });
    }

    if (method === 'GET' && pathname === '/bootstrap') {
      return json(200, await bootstrap(event));
    }

    const body = parseBody(event);

    if (method === 'POST' && pathname === '/admin/verify') {
      requireAdmin(body, event);
      return json(200, { ok: true });
    }

    if (method === 'POST' && pathname === '/admin/users') {
      requireAdmin(body, event);
      const users = Array.isArray(body.users) ? body.users : [];
      let saved = 0;

      for (const item of users) {
        const id = Number(item.id);
        const name = String(item.name || '').trim();
        if (!Number.isInteger(id) || id <= 0 || name.length < 2 || name.length > 80) {
          return json(400, { error: 'Participante invÃ¡lido.' });
        }
        const result = await execute('UPDATE users SET name = ? WHERE id = ?', [name, id]);
        saved += Number(result.rowsAffected || 0);
      }

      return json(200, { ok: true, saved, data: await bootstrap(event, { skipAutoSync: true }) });
    }

    if (method === 'POST' && pathname === '/register') {
      const name = String(body.name || '').trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      if (name.length < 2) return json(400, { error: 'Informe um nome válido.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Informe um e-mail válido.' });
      if (password.length < 6) return json(400, { error: 'A senha precisa ter pelo menos 6 caracteres.' });

      const { salt, passwordHash } = hashPassword(password);
      try {
        await execute('INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)', [
          name,
          email,
          passwordHash,
          salt
        ]);
      } catch (error) {
        if (String(error.message).toLowerCase().includes('unique')) return json(409, { error: 'Esse e-mail já está cadastrado.' });
        throw error;
      }
      const user = await one('SELECT id, name, email FROM users WHERE email = ?', [email]);
      const session = await createSession(Number(user.id));
      return json(201, { user: { id: Number(user.id), name: user.name, email: user.email }, ...session });
    }

    if (method === 'POST' && pathname === '/login') {
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const user = await one('SELECT * FROM users WHERE email = ?', [email]);
      if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
        return json(401, { error: 'E-mail ou senha inválidos.' });
      }
      const session = await createSession(Number(user.id));
      return json(200, {
        user: { id: Number(user.id), name: user.name, email: user.email },
        ...session
      });
    }

    if (method === 'POST' && pathname === '/logout') {
      const token = getBearerToken(event);
      if (token) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
      }
      return json(200, { ok: true });
    }

    if (method === 'POST' && pathname === '/predictions') {
      const user = await requireUser(event);
      const predictions = Array.isArray(body.predictions) ? body.predictions : [];
      let saved = 0;
      for (const prediction of predictions) {
        const matchId = Number(prediction.matchId);
        const homeScore = Number(prediction.homeScore);
        const awayScore = Number(prediction.awayScore);
        const match = await one('SELECT id, date_utc, completed FROM matches WHERE id = ?', [matchId]);
        if (!match || !isValidScore(homeScore) || !isValidScore(awayScore)) {
          return json(400, { error: 'Palpite inválido.' });
        }
        if (isPredictionLocked(match)) {
          return json(400, { error: 'Palpites bloqueados: o jogo já começou ou foi encerrado.' });
        }
        await execute(
          `INSERT INTO predictions (user_id, match_id, home_score, away_score, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, match_id)
           DO UPDATE SET home_score = excluded.home_score,
                         away_score = excluded.away_score,
                         updated_at = CURRENT_TIMESTAMP`,
          [Number(user.id), matchId, homeScore, awayScore]
        );
        saved += 1;
      }
      return json(200, { ok: true, saved, data: await bootstrap(event) });
    }

    if (method === 'POST' && pathname === '/results') {
      requireAdmin(body, event);
      const results = Array.isArray(body.results) ? body.results : [];
      let saved = 0;
      for (const item of results) {
        const matchId = Number(item.matchId);
        const completed = Boolean(item.completed);
        const homeScore = completed ? Number(item.homeScore) : null;
        const awayScore = completed ? Number(item.awayScore) : null;
        if (completed && (!isValidScore(homeScore) || !isValidScore(awayScore))) {
          return json(400, { error: 'Resultado inválido.' });
        }
        await execute(
          'UPDATE matches SET home_score = ?, away_score = ?, completed = ?, status = ? WHERE id = ?',
          [homeScore, awayScore, completed ? 1 : 0, completed ? 'Completed' : 'Scheduled', matchId]
        );
        saved += 1;
      }
      return json(200, { ok: true, saved, data: await bootstrap(event, { skipAutoSync: true }) });
    }

    if (method === 'POST' && pathname === '/sync') {
      requireAdmin(body, event);
      const result = await syncFromEspn();
      return json(200, { ok: true, ...result, data: await bootstrap(event, { skipAutoSync: true }) });
    }

    return json(404, { error: 'Rota não encontrada.' });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: error.message || 'Erro interno.' });
  }
};
