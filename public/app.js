const app = document.querySelector('#app');
const toast = document.querySelector('#toast');

const state = {
  data: null,
  token: localStorage.getItem('bolaoToken') || '',
  activeTab: 'rodadas',
  activeRound: localStorage.getItem('bolaoRound') || 'Rodada 1',
  authMode: 'register',
  adminKey: '',
  isOrganizer: false,
  busy: false
};

const tabLabels = {
  rodadas: 'Rodadas',
  tabela: 'Tabela',
  palpites: 'Palpites',
  ranking: 'Ranking'
};

const flagCodes = {
  MEX: 'mx',
  RSA: 'za',
  KOR: 'kr',
  CZE: 'cz',
  CAN: 'ca',
  BIH: 'ba',
  USA: 'us',
  PAR: 'py',
  QAT: 'qa',
  SUI: 'ch',
  BRA: 'br',
  MAR: 'ma',
  HAI: 'ht',
  SCO: 'gb-sct',
  AUS: 'au',
  TUR: 'tr',
  GER: 'de',
  CUW: 'cw',
  NED: 'nl',
  JPN: 'jp',
  CIV: 'ci',
  ECU: 'ec',
  SWE: 'se',
  TUN: 'tn',
  ESP: 'es',
  CPV: 'cv',
  BEL: 'be',
  EGY: 'eg',
  KSA: 'sa',
  URU: 'uy',
  IRN: 'ir',
  NZL: 'nz',
  FRA: 'fr',
  SEN: 'sn',
  IRQ: 'iq',
  NOR: 'no',
  ARG: 'ar',
  ALG: 'dz',
  AUT: 'at',
  JOR: 'jo',
  POR: 'pt',
  COD: 'cd',
  ENG: 'gb-eng',
  CRO: 'hr',
  GHA: 'gh',
  PAN: 'pa',
  UZB: 'uz',
  COL: 'co'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function groupLabel(value) {
  return String(value || '').replace('Group', 'Grupo');
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Erro na requisição.');
  return payload;
}

function setData(data) {
  state.data = data;
  if (!data.rounds.includes(state.activeRound)) {
    state.activeRound = data.rounds[0] || 'Rodada 1';
  }
  localStorage.setItem('bolaoRound', state.activeRound);
}

async function load() {
  try {
    setData(await api('/api/bootstrap'));
    render();
  } catch (error) {
    app.innerHTML = `<div class="boot"><strong>Erro ao carregar</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function render() {
  if (location.hash === '#organizador') {
    renderOrganizerShell();
    return;
  }

  if (!state.data.user) {
    renderLandingAuth();
    return;
  }

  if (!tabLabels[state.activeTab]) state.activeTab = 'rodadas';
  const tabTitle = tabLabels[state.activeTab] || 'Rodadas';
  app.innerHTML = `
    <div class="shell">
      ${renderTopbar()}
      <div class="app-grid">
        <aside class="rail">
          ${renderAuthPanel()}
          ${renderStatsPanel()}
          ${renderRoundPanel()}
        </aside>
        <main class="workspace">
          <div class="workspace-header">
            <div class="workspace-title">
              <div>
                <h2>${escapeHtml(tabTitle)}</h2>
                <span>${escapeHtml(workspaceSubtitle())}</span>
              </div>
              ${state.activeTab === 'rodadas' ? '<button class="primary-button" data-action="save-predictions">Salvar palpites</button>' : ''}
            </div>
            <div class="tabs">
              ${Object.entries(tabLabels).map(([key, label]) => `
                <button class="tab-button ${state.activeTab === key ? 'is-active' : ''}" data-tab="${key}">
                  ${escapeHtml(label)}
                </button>
              `).join('')}
            </div>
          </div>
          <div class="workspace-body">
            ${renderWorkspace()}
          </div>
        </main>
      </div>
    </div>
  `;
}

function renderLandingAuth() {
  const stats = state.data.stats;
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-hero">
        <div class="brand-mark hero-mark" aria-hidden="true"></div>
        <div class="hero-kicker">Brasil, rumo ao hexa</div>
        <h1>Bolão da Copa 2026</h1>
        <p>Cadastre-se, escolha seus placares por rodada e acompanhe quem mais crava resultados exatos.</p>
        <div class="hero-stats">
          <div><strong>${stats.totalMatches}</strong><span>jogos</span></div>
          <div><strong>${state.data.rounds.length}</strong><span>rodadas</span></div>
          <div><strong>${stats.users}</strong><span>participantes</span></div>
        </div>
        <div class="brazil-strip" aria-hidden="true">
          <span>BR</span><span>Rumo</span><span>ao</span><span>Hexa</span><span>2026</span>
        </div>
      </section>
      <section class="login-card">
        ${renderAuthForm()}
      </section>
    </main>
  `;
}

function renderOrganizerShell() {
  const tabTitle = state.isOrganizer ? 'Painel do organizador' : 'Acesso do organizador';
  app.innerHTML = `
    <div class="shell">
      <header class="topbar topbar-brasil">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true"></div>
          <div>
            <h1>Bolão Copa 2026</h1>
            <p>Área reservada para atualizar resultados oficiais.</p>
          </div>
        </div>
        <div class="top-actions">
          <button class="ghost-button" data-action="leave-admin">Voltar ao bolão</button>
        </div>
      </header>
      <main class="workspace admin-workspace">
        <div class="workspace-header">
          <div class="workspace-title">
            <div>
              <h2>${tabTitle}</h2>
              <span>${state.isOrganizer ? 'Digite resultados manualmente ou force a sincronização com a ESPN.' : 'Digite a chave para liberar a edição de resultados.'}</span>
            </div>
          </div>
        </div>
        <div class="workspace-body">
          ${state.isOrganizer ? renderOrganizerContent() : renderOrganizerGate()}
        </div>
      </main>
    </div>
  `;
}

function renderTopbar() {
  const user = state.data?.user;
  return `
    <header class="topbar topbar-brasil">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"></div>
        <div>
          <h1>Bolão Copa 2026</h1>
          <p>Brasil rumo ao hexa: 104 jogos, palpites por rodada e ranking em tempo real.</p>
        </div>
      </div>
      <div class="top-actions">
        ${user ? `<span class="badge live">Online: ${escapeHtml(user.name)}</span>` : '<span class="badge">Visitante</span>'}
        <span class="badge">${state.data.stats.totalMatches} jogos</span>
        <span class="badge">${state.data.stats.completed} finalizados</span>
      </div>
    </header>
  `;
}

function workspaceSubtitle() {
  if (state.activeTab === 'rodadas') return `${state.activeRound} - ${matchesForRound(state.activeRound).length} jogos`;
  if (state.activeTab === 'tabela') return 'Classificação calculada pelos resultados oficiais salvos.';
  if (state.activeTab === 'palpites') return 'Veja os palpites liberados por jogo e por rodada.';
  if (state.activeTab === 'ranking') return 'Ranking de placares exatos: 1 ponto por cravada.';
  return 'Atualização local de placares, com sincronização automática pela ESPN.';
}

function renderAuthPanel() {
  const user = state.data.user;
  if (user) {
    const player = state.data.leaderboard.find(item => item.id === user.id);
    return `
      <section class="panel">
        <div class="panel-title">
          <h2>Participante</h2>
          <span>#${player?.position || '-'}</span>
        </div>
        <div class="profile">
          <div>
            <div class="profile-name">${escapeHtml(user.name)}</div>
            <div class="profile-email">${escapeHtml(user.email)}</div>
          </div>
          <div class="stats-grid">
            <div class="stat"><strong>${player?.points || 0}</strong><span>cravadas</span></div>
            <div class="stat"><strong>${player?.predictions || 0}</strong><span>palpites</span></div>
          </div>
          <button class="ghost-button" data-action="logout">Sair</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="panel">
      ${renderAuthForm()}
    </section>
  `;
}

function renderAuthForm() {
  const isRegister = state.authMode === 'register';
  return `
    <div class="panel-title">
      <h2>${isRegister ? 'Crie sua conta' : 'Entre no bolão'}</h2>
      <span>${isRegister ? 'Cadastro' : 'Login'}</span>
    </div>
    <div class="auth-switch">
      <button class="${isRegister ? 'is-active' : ''}" data-auth-mode="register" type="button">Cadastrar</button>
      <button class="${!isRegister ? 'is-active' : ''}" data-auth-mode="login" type="button">Entrar</button>
    </div>
    <form class="form-grid" data-auth-form="${state.authMode}">
      ${isRegister ? `
        <label class="field">
          <span>Nome</span>
          <input name="name" autocomplete="name" required minlength="2" placeholder="Seu nome">
        </label>
      ` : ''}
      <label class="field">
        <span>E-mail</span>
        <input name="email" type="email" autocomplete="email" required placeholder="voce@email.com">
      </label>
      <label class="field">
        <span>Senha</span>
        <input name="password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" required minlength="6" placeholder="mínimo de 6 caracteres">
      </label>
      <button class="primary-button" type="submit">${isRegister ? 'Criar conta' : 'Entrar'}</button>
    </form>
  `;
}

function renderOrganizerGate() {
  return `
    <section class="admin-gate">
      <div class="panel-title">
        <h2>Chave do organizador</h2>
        <span>Privado</span>
      </div>
      <form class="form-grid" data-admin-login>
        <label class="field">
          <span>Digite a chave</span>
          <input class="admin-key" name="adminKey" type="password" autocomplete="off" required placeholder="chave do organizador">
        </label>
        <button class="primary-button" type="submit">Liberar painel</button>
      </form>
    </section>
  `;
}

function renderOrganizerContent() {
  return `
    <div class="admin-tools">
      <div class="admin-note">
        <strong>Sincronização automática ligada</strong>
        <span>O servidor verifica os placares da ESPN a cada 10 minutos enquanto estiver aberto. O botão abaixo força uma nova consulta agora.</span>
      </div>
      ${renderUsersAdmin()}
      <div class="toolbar">
        <div class="tabs">
          ${state.data.rounds.map(round => `
            <button class="round-button ${state.activeRound === round ? 'is-active' : ''}" data-round="${escapeHtml(round)}">
              ${escapeHtml(round)}
            </button>
          `).join('')}
        </div>
        <div class="toolbar-actions">
          <button class="ghost-button" data-action="sync-results">Sincronizar ESPN agora</button>
          <button class="primary-button" data-action="save-results">Salvar resultados</button>
        </div>
      </div>
      ${renderResultsAdmin()}
    </div>
  `;
}

function renderUsersAdmin() {
  const players = state.data.leaderboard || [];
  return `
    <section class="admin-users">
      <div class="panel-title">
        <h2>Participantes</h2>
        <span>${players.length} jogador${players.length === 1 ? '' : 'es'}</span>
      </div>
      ${players.length ? `
        <div class="admin-users-list">
          ${players.map(player => `
            <div class="admin-user-row" data-admin-user-row data-user-id="${player.id}">
              <div class="admin-user-info">
                <strong>#${player.position} ${escapeHtml(player.name)}</strong>
                <span>${escapeHtml(player.email || '')} - ${player.points} ponto${player.points === 1 ? '' : 's'} - ${player.predictions} palpite${player.predictions === 1 ? '' : 's'}</span>
              </div>
              <label class="field admin-user-name">
                <span>Nome exibido</span>
                <input data-user-name type="text" required minlength="2" maxlength="80" value="${escapeHtml(player.name)}" aria-label="Nome de ${escapeHtml(player.name)}">
              </label>
            </div>
          `).join('')}
        </div>
        <div class="save-strip">
          <button class="primary-button" data-action="save-users">Salvar nomes dos participantes</button>
        </div>
      ` : renderEmpty('Nenhum participante', 'Os jogadores aparecem aqui depois do cadastro.')}
    </section>
  `;
}

function renderStatsPanel() {
  const stats = state.data.stats;
  return `
    <section class="panel">
      <div class="panel-title">
        <h2>Placar geral</h2>
        <span>SQLite local</span>
      </div>
      <div class="stats-grid">
        <div class="stat"><strong>${stats.users}</strong><span>jogadores</span></div>
        <div class="stat"><strong>${stats.predictions}</strong><span>palpites</span></div>
        <div class="stat"><strong>${stats.completed}</strong><span>resultados</span></div>
        <div class="stat"><strong>${stats.totalMatches}</strong><span>partidas</span></div>
      </div>
    </section>
  `;
}

function renderRoundPanel() {
  return `
    <section class="panel">
      <div class="panel-title">
        <h2>Rodadas</h2>
        <span>${state.data.rounds.length}</span>
      </div>
      <div class="round-picker">
        ${state.data.rounds.map(round => `
          <button class="round-button ${state.activeRound === round ? 'is-active' : ''}" data-round="${escapeHtml(round)}">
            <span>${escapeHtml(round)}</span>
            <span class="round-count">${matchesForRound(round).length}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderWorkspace() {
  if (state.activeTab === 'tabela') return renderStandings();
  if (state.activeTab === 'palpites') return renderPublicPredictions();
  if (state.activeTab === 'ranking') return renderRanking();
  return renderRoundMatches();
}

function matchesForRound(round) {
  return state.data.matches.filter(match => match.roundName === round);
}

function renderRoundMatches() {
  const matches = matchesForRound(state.activeRound);
  if (!matches.length) return renderEmpty('Rodada vazia', 'Nenhum jogo encontrado.');
  return `
    <div class="matches-grid">
      ${matches.map(match => renderMatchCard(match)).join('')}
    </div>
    <div class="save-strip">
      <button class="primary-button" data-action="save-predictions">Salvar palpites da rodada</button>
    </div>
  `;
}

function teamFlag(team) {
  const abbr = escapeHtml(team.abbreviation || 'TBD');
  const code = flagCodes[team.abbreviation];
  if (team.isPlaceholder || (!code && !team.logo)) {
    return `<span class="flag flag-slot">${abbr}</span>`;
  }
  const src = code ? `https://flagcdn.com/w80/${code}.png` : team.logo;
  return `<img class="flag" src="${escapeHtml(src)}" alt="Bandeira ${escapeHtml(team.name)}" loading="eager" decoding="async" data-fallback="${abbr}" data-logo-fallback="${escapeHtml(team.logo || '')}">`;
}

function renderTeam(team) {
  return `
    <div class="team">
      ${teamFlag(team)}
      <div class="team-name">${escapeHtml(team.name)}</div>
      <div class="team-abbr">${escapeHtml(team.abbreviation)}</div>
    </div>
  `;
}

function officialResult(match) {
  if (!match.completed) return '<span class="official-result">--</span>';
  return `<span class="official-result">${match.homeScore} x ${match.awayScore}</span>`;
}

function predictionValue(matchId, side) {
  const prediction = state.data.predictions?.[matchId];
  if (!prediction) return '';
  return side === 'home' ? prediction.homeScore : prediction.awayScore;
}

function isPredictionLocked(match) {
  return Boolean(match.completed) || Date.now() >= new Date(match.dateUtc).getTime();
}

function predictionLockBadge(match) {
  if (match.completed) return '<span class="badge lock-badge">Encerrado</span>';
  if (isPredictionLocked(match)) return '<span class="badge lock-badge">Bloqueado</span>';
  return '<span class="badge open-badge">Aberto</span>';
}

function renderMatchCard(match) {
  const locked = isPredictionLocked(match);
  const disabled = state.data.user && !locked ? '' : 'disabled';
  return `
    <article class="match-card ${locked ? 'is-locked' : ''}" data-match-card data-match-id="${match.id}" data-locked="${locked ? 'true' : 'false'}">
      <div class="match-meta">
        <span class="badge">Jogo ${match.matchNumber}</span>
        ${match.groupName ? `<span class="badge">${escapeHtml(groupLabel(match.groupName))}</span>` : ''}
        <span class="badge">${escapeHtml(formatDate(match.dateUtc))}</span>
        ${predictionLockBadge(match)}
      </div>
      <div class="teams">
        ${renderTeam(match.home)}
        <div class="versus">
          <strong>VS</strong>
          ${officialResult(match)}
        </div>
        ${renderTeam(match.away)}
      </div>
      <div class="prediction-box">
        <input class="score-input" inputmode="numeric" min="0" max="99" type="number"
          data-pred-home value="${escapeHtml(predictionValue(match.id, 'home'))}" ${disabled} aria-label="Palpite ${escapeHtml(match.home.name)}">
        <span class="score-separator">x</span>
        <input class="score-input" inputmode="numeric" min="0" max="99" type="number"
          data-pred-away value="${escapeHtml(predictionValue(match.id, 'away'))}" ${disabled} aria-label="Palpite ${escapeHtml(match.away.name)}">
      </div>
      <div class="match-meta">
        <span class="subtle">${escapeHtml(match.venue || 'Estádio a confirmar')}</span>
      </div>
    </article>
  `;
}

function renderStandings() {
  return `
    <div class="standings-grid">
      ${state.data.standings.map(group => `
        <section class="group-table">
          <div class="group-title">
            <h3>${escapeHtml(groupLabel(group.name))}</h3>
            <span class="badge">${group.teams.length} seleções</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Selecao</th>
                <th>Pts</th>
                <th>J</th>
                <th>V</th>
                <th>E</th>
                <th>D</th>
                <th>SG</th>
              </tr>
            </thead>
            <tbody>
              ${group.teams.map(team => `
                <tr>
                  <td>
                    <div class="table-team">
                      ${teamFlag(team)}
                      <span>${escapeHtml(team.name)}</span>
                    </div>
                  </td>
                  <td><strong>${team.points}</strong></td>
                  <td>${team.played}</td>
                  <td>${team.wins}</td>
                  <td>${team.draws}</td>
                  <td>${team.losses}</td>
                  <td>${team.goalDiff}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
      `).join('')}
    </div>
  `;
}

function renderRanking() {
  const players = state.data.leaderboard;
  if (!players.length) return renderEmpty('Ranking vazio', 'Os participantes aparecem aqui depois do cadastro.');
  return `
    <section class="ranking-panel">
      <table>
        <thead>
          <tr>
            <th>Pos</th>
            <th>Participante</th>
            <th>Cravadas</th>
            <th>Pontos</th>
            <th>Palpites</th>
          </tr>
        </thead>
        <tbody>
          ${players.map(player => `
            <tr class="ranking-row">
              <td data-label="Posição"><span class="rank-badge">${player.position}</span></td>
              <td data-label="Participante" class="ranking-name">${escapeHtml(player.name)}</td>
              <td data-label="Cravadas"><strong>${player.points}</strong></td>
              <td data-label="Pontos">${player.exact}</td>
              <td data-label="Palpites">${player.predictions}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `;
}

function publicPredictionsFor(matchId) {
  return (state.data.publicPredictions || [])
    .filter(prediction => prediction.matchId === matchId)
    .sort((a, b) => Number(b.isMine) - Number(a.isMine) || a.userName.localeCompare(b.userName));
}

function renderPublicPredictions() {
  const matches = matchesForRound(state.activeRound);
  if (!matches.length) return renderEmpty('Rodada vazia', 'Nenhum jogo encontrado.');

  return `
    <div class="public-predictions-grid">
      ${matches.map(match => {
        const locked = isPredictionLocked(match);
        const predictions = publicPredictionsFor(match.id);
        return `
          <article class="public-prediction-card ${locked ? 'is-opened' : ''}">
            <div class="match-meta">
              <span class="badge">Jogo ${match.matchNumber}</span>
              ${match.groupName ? `<span class="badge">${escapeHtml(groupLabel(match.groupName))}</span>` : ''}
              <span class="badge">${escapeHtml(formatDate(match.dateUtc))}</span>
              ${locked ? '<span class="badge open-badge">Palpites liberados</span>' : '<span class="badge lock-badge">Aguardando início</span>'}
            </div>
            <div class="prediction-match-line">
              <div class="match-mini">
                ${teamFlag(match.home)}
                <span>${escapeHtml(match.home.name)}</span>
              </div>
              <strong>x</strong>
              <div class="match-mini">
                ${teamFlag(match.away)}
                <span>${escapeHtml(match.away.name)}</span>
              </div>
            </div>
            <div class="public-prediction-list">
              ${predictions.length ? predictions.map(prediction => `
                <div class="public-prediction-row ${prediction.isMine ? 'is-mine' : ''}">
                  <span>${escapeHtml(prediction.userName)}${prediction.isMine ? ' (você)' : ''}</span>
                  <strong>${prediction.homeScore} x ${prediction.awayScore}</strong>
                </div>
              `).join('') : `
                <div class="prediction-privacy-note">
                  ${locked ? 'Nenhum palpite salvo para este jogo.' : 'Os palpites dos outros jogadores aparecem quando o jogo começar.'}
                </div>
              `}
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderResultsAdmin() {
  const matches = matchesForRound(state.activeRound);
  return `
    <div class="admin-results">
      ${matches.map(match => `
        <div class="admin-row" data-result-row data-match-id="${match.id}">
          <div class="match-mini">
            ${teamFlag(match.home)}
            <span>${escapeHtml(match.home.name)} x ${escapeHtml(match.away.name)}</span>
            ${teamFlag(match.away)}
          </div>
          <input class="score-input" data-result-home type="number" min="0" max="99" value="${match.homeScore ?? ''}" aria-label="Resultado mandante">
          <input class="score-input" data-result-away type="number" min="0" max="99" value="${match.awayScore ?? ''}" aria-label="Resultado visitante">
          <label class="check">
            <input data-result-done type="checkbox" ${match.completed ? 'checked' : ''}>
            Encerrado
          </label>
        </div>
      `).join('')}
    </div>
  `;
}

function renderEmpty(title, text) {
  return `
    <div class="empty-state">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text)}</span>
      </div>
    </div>
  `;
}

function visibleAdminKey() {
  const input = document.querySelector('[data-admin-key]');
  const value = input ? input.value.trim() : state.adminKey;
  state.adminKey = value;
  return value;
}

function collectPredictions() {
  const predictions = [];
  document.querySelectorAll('[data-match-card]').forEach(card => {
    if (card.dataset.locked === 'true') return;
    const home = card.querySelector('[data-pred-home]').value;
    const away = card.querySelector('[data-pred-away]').value;
    if (home === '' && away === '') return;
    if (home === '' || away === '') throw new Error('Preencha os dois lados do placar.');
    predictions.push({
      matchId: Number(card.dataset.matchId),
      homeScore: Number(home),
      awayScore: Number(away)
    });
  });
  return predictions;
}

function collectResults() {
  const results = [];
  document.querySelectorAll('[data-result-row]').forEach(row => {
    const completed = row.querySelector('[data-result-done]').checked;
    const home = row.querySelector('[data-result-home]').value;
    const away = row.querySelector('[data-result-away]').value;
    if (completed && (home === '' || away === '')) throw new Error('Resultado encerrado precisa de placar.');
    results.push({
      matchId: Number(row.dataset.matchId),
      completed,
      homeScore: completed ? Number(home) : null,
      awayScore: completed ? Number(away) : null
    });
  });
  return results;
}

function collectUsers() {
  const users = [];
  document.querySelectorAll('[data-admin-user-row]').forEach(row => {
    const name = row.querySelector('[data-user-name]').value.trim();
    if (name.length < 2) throw new Error('Cada nome precisa ter pelo menos 2 caracteres.');
    users.push({
      id: Number(row.dataset.userId),
      name
    });
  });
  return users;
}

async function savePredictions() {
  if (!state.data.user) {
    showToast('Entre ou cadastre-se para salvar palpites.', true);
    return;
  }
  try {
    const predictions = collectPredictions();
    if (!predictions.length) {
      showToast('Nenhum palpite preenchido nesta rodada.', true);
      return;
    }
    setBusy(true);
    const response = await api('/api/predictions', { method: 'POST', body: { predictions } });
    setData(response.data);
    render();
    showToast(`${response.saved} palpites salvos.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function saveUsers() {
  try {
    const adminKey = visibleAdminKey();
    if (!state.isOrganizer || !adminKey) throw new Error('Digite a chave do organizador para editar participantes.');
    const users = collectUsers();
    if (!users.length) {
      showToast('Nenhum participante para atualizar.', true);
      return;
    }
    setBusy(true);
    const response = await api('/api/admin/users', { method: 'POST', body: { adminKey, users } });
    setData(response.data);
    render();
    showToast(`${response.saved} nome${response.saved === 1 ? '' : 's'} atualizado${response.saved === 1 ? '' : 's'}.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function saveResults() {
  try {
    const adminKey = visibleAdminKey();
    if (!state.isOrganizer || !adminKey) throw new Error('Digite a chave do organizador para editar resultados.');
    const results = collectResults();
    setBusy(true);
    const response = await api('/api/results', { method: 'POST', body: { adminKey, results } });
    setData(response.data);
    render();
    showToast(`${response.saved} resultados atualizados.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function syncResults() {
  try {
    const adminKey = visibleAdminKey();
    if (!state.isOrganizer || !adminKey) throw new Error('Digite a chave do organizador para sincronizar resultados.');
    setBusy(true);
    const response = await api('/api/sync', { method: 'POST', body: { adminKey } });
    setData(response.data);
    render();
    showToast(`Sincronização concluída: ${response.events} jogos verificados.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function submitAdminLogin(form) {
  try {
    const adminKey = new FormData(form).get('adminKey')?.toString().trim();
    if (!adminKey) throw new Error('Digite a chave do organizador.');
    setBusy(true);
    await api('/api/admin/verify', { method: 'POST', body: { adminKey } });
    state.adminKey = adminKey;
    state.isOrganizer = true;
    render();
    showToast('Painel do organizador liberado.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function submitAuth(form) {
  try {
    const mode = form.dataset.authForm;
    const data = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    const response = await api(`/api/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: data });
    state.token = response.token;
    localStorage.setItem('bolaoToken', state.token);
    setData(await api('/api/bootstrap'));
    render();
    showToast(mode === 'login' ? 'Entrada confirmada.' : 'Cadastro criado.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function logout() {
  try {
    await api('/api/logout', { method: 'POST', body: {} });
  } catch {
    // A sessão local ainda pode ser removida mesmo se o servidor já limpou o token.
  }
  state.token = '';
  localStorage.removeItem('bolaoToken');
  await load();
  showToast('Sessão encerrada.');
}

function leaveAdmin() {
  state.isOrganizer = false;
  state.adminKey = '';
  history.replaceState(null, '', location.pathname);
  render();
}

function setBusy(value) {
  state.busy = value;
  document.querySelectorAll('button').forEach(button => {
    if (value) button.setAttribute('disabled', 'disabled');
    else button.removeAttribute('disabled');
  });
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

document.addEventListener('submit', event => {
  const adminForm = event.target.closest('[data-admin-login]');
  if (adminForm) {
    event.preventDefault();
    submitAdminLogin(adminForm);
    return;
  }

  const form = event.target.closest('[data-auth-form]');
  if (!form) return;
  event.preventDefault();
  submitAuth(form);
});

document.addEventListener('click', event => {
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    state.activeTab = tab.dataset.tab;
    render();
    return;
  }

  const round = event.target.closest('[data-round]');
  if (round) {
    state.activeRound = round.dataset.round;
    localStorage.setItem('bolaoRound', state.activeRound);
    render();
    return;
  }

  const authMode = event.target.closest('[data-auth-mode]');
  if (authMode) {
    state.authMode = authMode.dataset.authMode;
    render();
    return;
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'save-predictions') savePredictions();
  if (action === 'save-users') saveUsers();
  if (action === 'save-results') saveResults();
  if (action === 'sync-results') syncResults();
  if (action === 'logout') logout();
  if (action === 'leave-admin') leaveAdmin();
});

window.addEventListener('hashchange', render);

document.addEventListener('error', event => {
  const image = event.target;
  if (!image.matches?.('img[data-fallback]')) return;
  if (image.dataset.logoFallback && image.src !== image.dataset.logoFallback) {
    image.src = image.dataset.logoFallback;
    image.dataset.logoFallback = '';
    return;
  }
  const fallback = document.createElement('span');
  fallback.className = 'flag flag-slot';
  fallback.textContent = image.dataset.fallback || 'TBD';
  image.replaceWith(fallback);
}, true);

function renderLandingAuth() {
  const stats = state.data.stats;
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-hero">
        <div class="hero-topline">
          <div class="hero-emblem" aria-hidden="true">
            <img src="https://flagcdn.com/w160/br.png" alt="">
            <span>BR</span>
          </div>
          <div class="hero-kicker">Brasil, rumo ao hexa</div>
        </div>
        <h1>Bolão da Copa 2026</h1>
        <p>Cadastre-se, escolha seus placares por rodada e dispute quem mais crava resultados exatos.</p>
        <div class="hero-showcase" aria-hidden="true">
          <div class="pitch-card">
            <div class="pitch-lines"></div>
            <div class="gold-diamond"></div>
            <div class="ball-core"></div>
            <div class="hexa-word">HEXA</div>
          </div>
          <div class="mini-board">
            <span>Brasil</span>
            <strong>Rumo ao Hexa</strong>
          </div>
        </div>
        <div class="hero-stats">
          <div><strong>${stats.totalMatches}</strong><span>jogos</span></div>
          <div><strong>${state.data.rounds.length}</strong><span>rodadas</span></div>
          <div><strong>${stats.users}</strong><span>participantes</span></div>
        </div>
        <div class="brazil-strip" aria-hidden="true">
          <span>BRASIL</span><span>RUMO</span><span>AO</span><span>HEXA</span><span>2026</span>
        </div>
      </section>
      <section class="login-card">
        ${renderAuthForm()}
      </section>
    </main>
  `;
}

function renderOrganizerShell() {
  const tabTitle = state.isOrganizer ? 'Painel do organizador' : 'Acesso do organizador';
  app.innerHTML = `
    <div class="shell">
      <header class="topbar topbar-brasil">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true"></div>
          <img class="brand-flag" src="https://flagcdn.com/w80/br.png" alt="Bandeira do Brasil">
          <div>
            <h1>Bolão Copa 2026</h1>
            <p>Área reservada para atualizar resultados oficiais.</p>
          </div>
        </div>
        <div class="top-actions">
          <button class="ghost-button" data-action="leave-admin">Voltar ao bolão</button>
        </div>
      </header>
      <main class="workspace admin-workspace">
        <div class="workspace-header">
          <div class="workspace-title">
            <div>
              <h2>${tabTitle}</h2>
              <span>${state.isOrganizer ? 'Digite resultados manualmente ou force a sincronização com a ESPN.' : 'Digite a chave para liberar a edição de resultados.'}</span>
            </div>
          </div>
        </div>
        <div class="workspace-body">
          ${state.isOrganizer ? renderOrganizerContent() : renderOrganizerGate()}
        </div>
      </main>
    </div>
  `;
}

function renderTopbar() {
  const user = state.data?.user;
  return `
    <header class="topbar topbar-brasil">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"></div>
        <img class="brand-flag" src="https://flagcdn.com/w80/br.png" alt="Bandeira do Brasil">
        <div>
          <h1>Bolão Copa 2026</h1>
          <p>Brasil rumo ao hexa: 104 jogos, palpites por rodada e ranking em tempo real.</p>
        </div>
      </div>
      <div class="top-actions">
        ${user ? `<span class="badge live">Online: ${escapeHtml(user.name)}</span>` : '<span class="badge">Visitante</span>'}
        <span class="badge">${state.data.stats.totalMatches} jogos</span>
        <span class="badge">${state.data.stats.completed} finalizados</span>
      </div>
    </header>
  `;
}

load();
