let cfg, me;
const drafts = {}; // teamId -> { criterioId: nota }

function isComplete(scores) {
  return cfg.criteria.every((c) => Number.isInteger(scores[c.id]));
}

function isDirty(teamId) {
  const saved = me.votes[teamId]?.scores || {};
  return cfg.criteria.some((c) => drafts[teamId][c.id] !== saved[c.id]);
}

function renderProgress() {
  const total = me.eligibleTeams.length;
  const done = me.eligibleTeams.filter((id) => me.votes[id]).length;
  document.getElementById('progress-count').textContent = `${done} de ${total}`;
  const bar = document.getElementById('progress');
  bar.setAttribute('aria-valuemax', total);
  bar.setAttribute('aria-valuenow', done);
  bar.firstElementChild.style.width = `${total ? (done / total) * 100 : 0}%`;
  document.getElementById('closed').hidden = me.settings.votingOpen;
}

function teamCard(team) {
  const open = me.settings.votingOpen;
  const draft = drafts[team.id];
  const saved = !!me.votes[team.id];
  const dirty = isDirty(team.id);

  let badge;
  if (saved && !dirty) badge = el('span', { class: 'badge badge-ok', text: '✓ Avaliada' });
  else if (saved && dirty) badge = el('span', { class: 'badge badge-warn', text: 'Alterações por guardar' });
  else badge = el('span', { class: 'badge', text: 'Por avaliar' });

  const rows = cfg.criteria.map((c, i) => {
    const value = draft[c.id];
    const buttons = [];
    for (let n = cfg.scale.min; n <= cfg.scale.max; n++) {
      buttons.push(el('button', {
        type: 'button',
        class: n === value ? 'selected' : Number.isInteger(value) && n < value ? 'filled' : null,
        'aria-pressed': n === value ? 'true' : 'false',
        'aria-label': `${c.title}: ${n}`,
        disabled: !open,
        text: String(n),
        onclick: () => {
          draft[c.id] = n;
          rerender(team.id);
        },
      }));
    }
    return el('div', { class: 'crit-row' }, [
      el('div', { class: 'crit-row-head' }, [
        el('div', {}, [
          el('div', { class: 'title' }, [el('span', { class: 'crit-num', text: `0${i + 1}` }), c.title]),
          el('div', { class: 'desc', text: c.description }),
        ]),
        el('div', { class: 'value', text: Number.isInteger(value) ? String(value) : '–' }),
      ]),
      el('div', { class: 'scale', role: 'group', 'aria-label': c.title }, buttons),
      el('div', { class: 'scale-ends' }, [el('span', { text: 'Fraco' }), el('span', { text: 'Excelente' })]),
    ]);
  });

  const complete = isComplete(draft);
  const missing = cfg.criteria.filter((c) => !Number.isInteger(draft[c.id])).length;
  const hint = !open ? '' : !complete ? `Falta${missing > 1 ? 'm' : ''} ${missing} critério${missing > 1 ? 's' : ''}` : dirty ? 'Pronto para guardar' : 'Pode alterar enquanto a votação estiver aberta';

  const saveBtn = el('button', {
    type: 'button',
    class: 'btn btn-primary',
    disabled: !open || !complete || !dirty,
    text: saved ? 'Atualizar avaliação' : 'Guardar avaliação',
    onclick: () => save(team.id, saveBtn),
  });

  return el('section', {
    class: `card team-card${saved && !dirty ? ' saved' : ''}${open ? '' : ' disabled'}`,
    id: `team-${team.id}`,
    'aria-labelledby': `team-title-${team.id}`,
  }, [
    el('div', { class: 'team-head' }, [
      el('div', { class: 'team-avatar', text: initials(team.name), 'aria-hidden': 'true' }),
      el('h2', { id: `team-title-${team.id}`, text: team.name }),
      badge,
    ]),
    el('div', { class: 'team-body' }, [
      ...rows,
      el('div', { class: 'team-foot' }, [el('span', { class: 'hint', text: hint }), saveBtn]),
    ]),
  ]);
}

function rerender(teamId) {
  const team = cfg.teams.find((t) => t.id === teamId);
  document.getElementById(`team-${teamId}`).replaceWith(teamCard(team));
}

function renderAll() {
  const list = document.getElementById('teams');
  list.replaceChildren(...cfg.teams.filter((t) => me.eligibleTeams.includes(t.id)).map(teamCard));
  renderProgress();
}

async function save(teamId, button) {
  button.disabled = true;
  try {
    const res = await api('/api/vote', { method: 'POST', body: { teamId, scores: drafts[teamId] } });
    me.votes = res.votes;
    rerender(teamId);
    renderProgress();
    const left = me.eligibleTeams.filter((id) => !me.votes[id]);
    toast(left.length ? `Avaliação guardada. Faltam ${left.length} equipa${left.length > 1 ? 's' : ''}.` : 'Avaliação guardada. Avaliou todas as equipas — obrigado!');
    if (left.length) {
      const next = document.getElementById(`team-${left.find((id) => cfg.teams.findIndex((t) => t.id === id) > cfg.teams.findIndex((t) => t.id === teamId)) || left[0]}`);
      next?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    if (err.status === 401) return location.replace('/');
    toast(err.message, 'error');
    button.disabled = false;
  }
}

function listenSettings() {
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => {
    const { settings } = JSON.parse(e.data);
    if (settings.votingOpen !== me.settings.votingOpen) {
      me.settings = settings;
      renderAll();
      toast(settings.votingOpen ? 'A votação foi aberta.' : 'A votação foi encerrada.', settings.votingOpen ? 'ok' : 'error');
    }
  };
}

(async function init() {
  try {
    [cfg, me] = await Promise.all([api('/api/config'), api('/api/me')]);
  } catch (err) {
    location.replace('/');
    return;
  }
  if (me.voter.role === 'admin') return location.replace('/admin');

  renderTopbar('/votar', me, cfg);
  document.title = `Votar · ${cfg.eventName}`;
  document.getElementById('greeting').textContent = `Olá, ${me.voter.name}`;
  const scaleText = `Atribua uma nota de ${cfg.scale.min} a ${cfg.scale.max} em cada critério e guarde a avaliação de cada equipa.`;
  document.getElementById('intro').textContent = me.voter.team && me.eligibleTeams.length < cfg.teams.length
    ? `${scaleText} A sua equipa (${me.voter.team}) não aparece na lista.`
    : scaleText;

  for (const t of cfg.teams) drafts[t.id] = { ...(me.votes[t.id]?.scores || {}) };
  renderAll();
  listenSettings();

  window.addEventListener('beforeunload', (e) => {
    if (me.settings.votingOpen && me.eligibleTeams.some(isDirty)) e.preventDefault();
  });
})();
