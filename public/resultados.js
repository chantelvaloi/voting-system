let cfg;

function setLive(on) {
  const badge = document.getElementById('live');
  badge.className = `badge${on ? ' badge-ok' : ''}`;
  badge.firstElementChild.className = `live-dot${on ? '' : ' off'}`;
  badge.lastElementChild.textContent = on ? 'Ao vivo' : 'A ligar…';
}

function rankRow(team, pos) {
  const max = cfg.scale.max;
  return el('article', {
    class: `card rank-row${pos === 1 && team.votes ? ' first' : ''}${pos <= 3 && pos > 1 && team.votes ? ' podium' : ''}`,
    'data-id': team.id,
  }, [
    el('div', { class: 'rank-pos', text: String(pos), 'aria-label': `${pos}.º lugar` }),
    el('div', { class: 'rank-main' }, [
      el('h2', { text: team.name }),
      el('div', { class: 'meta', text: `${team.votes} avaliaç${team.votes === 1 ? 'ão' : 'ões'}` }),
      el('div', { class: 'rank-bar', 'aria-hidden': 'true' }, [el('span', { style: `width:${(team.score / max) * 100}%` })]),
      el('div', { class: 'rank-crits' }, cfg.criteria.map((c) =>
        el('span', {}, [`${c.title} `, el('b', { text: team.votes ? fmt(team.criteria[c.id], 1) : '–' })]))),
    ]),
    el('div', { class: 'rank-score' }, [team.votes ? fmt(team.score) : '–', el('small', { text: `de ${max}` })]),
  ]);
}

// Anima a troca de posições (FLIP).
function renderRanking(teams) {
  const list = document.getElementById('ranking');
  const before = new Map([...list.children].map((n) => [n.dataset.id, n.getBoundingClientRect().top]));
  list.replaceChildren(...teams.map((t, i) => rankRow(t, i + 1)));
  for (const node of list.children) {
    const prev = before.get(node.dataset.id);
    if (prev == null) continue;
    const delta = prev - node.getBoundingClientRect().top;
    if (!delta) continue;
    node.style.transition = 'none';
    node.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      node.style.transition = '';
      node.style.transform = '';
    }));
  }
}

function render(data) {
  const { participation: p, settings } = data;
  document.getElementById('s-status').textContent = settings.votingOpen ? 'Aberta' : 'Encerrada';
  document.getElementById('s-status').style.color = settings.votingOpen ? 'var(--teal)' : 'var(--danger)';
  document.getElementById('s-done').replaceChildren(String(p.done), el('small', { text: ` / ${p.total}` }));
  document.getElementById('s-started').replaceChildren(String(p.started), el('small', { text: ` / ${p.total}` }));
  document.getElementById('s-votes').textContent = String(data.totalVotes);

  const list = document.getElementById('ranking');
  if (!data.teams) {
    list.replaceChildren(el('div', { class: 'card empty' }, [
      el('h2', { text: 'Resultados ocultos' }),
      el('p', { text: 'A classificação será revelada pela organização no final da votação.' }),
    ]));
  } else {
    if (list.querySelector('.empty')) list.replaceChildren();
    renderRanking(data.teams);
  }
}

function connect() {
  const es = new EventSource('/api/stream');
  es.onopen = () => setLive(true);
  es.onmessage = (e) => render(JSON.parse(e.data));
  es.onerror = () => setLive(false); // o EventSource volta a ligar automaticamente
}

(async function init() {
  cfg = await api('/api/config');
  const me = await api('/api/me').catch(() => null);
  renderTopbar('/resultados', me, cfg);
  document.title = `Resultados · ${cfg.eventName}`;
  const weighted = cfg.criteria.some((c) => (c.weight ?? 1) !== 1);
  document.getElementById('intro').textContent =
    `Nota final = média ${weighted ? 'ponderada ' : ''}dos ${cfg.criteria.length} critérios, calculada sobre todas as avaliações recebidas (escala ${cfg.scale.min}–${cfg.scale.max}).`;
  connect();
})();
