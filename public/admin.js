let cfg, voters = [];

function status(v) {
  if (v.role === 'admin') return 'admin';
  if (v.rated === 0) return 'none';
  return v.rated === v.eligible ? 'done' : 'partial';
}

function renderVoters() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const f = document.getElementById('filter').value;
  const rows = voters
    .filter((v) => !f || status(v) === f)
    .filter((v) => !q || [v.code, v.name, v.team || '', v.roleLabel].some((s) => s.toLowerCase().includes(q)))
    .map((v) => {
      const st = status(v);
      const badge = st === 'admin' ? el('span', { class: 'badge', text: '—' })
        : st === 'done' ? el('span', { class: 'badge badge-ok', text: `✓ ${v.rated}/${v.eligible}` })
        : st === 'partial' ? el('span', { class: 'badge badge-warn', text: `${v.rated}/${v.eligible}` })
        : el('span', { class: 'badge badge-off', text: `0/${v.eligible}` });
      return el('tr', {}, [
        el('td', { class: 'code', text: v.code }),
        el('td', { text: v.name }),
        el('td', { text: v.roleLabel }),
        el('td', { text: v.team || '—' }),
        el('td', {}, [badge]),
      ]);
    });
  document.getElementById('voters').replaceChildren(
    ...(rows.length ? rows : [el('tr', {}, [el('td', { colspan: '5', class: 'muted', text: 'Nenhum votante encontrado.' })])]),
  );

  const counted = voters.filter((v) => v.role !== 'admin');
  document.getElementById('s-done').textContent = counted.filter((v) => status(v) === 'done').length;
  document.getElementById('s-partial').textContent = counted.filter((v) => status(v) === 'partial').length;
  document.getElementById('s-none').textContent = counted.filter((v) => status(v) === 'none').length;
}

function renderPrintCards() {
  document.getElementById('print-cards').replaceChildren(...voters.filter((v) => v.role !== 'admin').map((v) =>
    el('div', { class: 'print-card' }, [
      el('img', { src: '/img/logo.png', alt: '' }),
      el('div', { class: 'name', text: v.name }),
      el('div', { class: 'sub', text: v.team ? `${v.roleLabel} · ${v.team}` : v.roleLabel }),
      el('div', { class: 'code', text: v.code }),
      el('div', { class: 'sub', text: `Entre em ${location.host} com este código` }),
    ])));
}

async function loadVoters() {
  ({ voters } = await api('/api/admin/voters'));
  renderVoters();
}

function applySettings(settings) {
  document.getElementById('votingOpen').checked = settings.votingOpen;
  document.getElementById('resultsVisible').checked = settings.resultsVisible;
}

(async function init() {
  let me;
  try {
    [cfg, me] = await Promise.all([api('/api/config'), api('/api/me')]);
  } catch {
    return location.replace('/');
  }
  if (me.voter.role !== 'admin') return location.replace('/votar');
  renderTopbar('/admin', me, cfg);
  document.title = `Administração · ${cfg.eventName}`;
  applySettings(me.settings);

  for (const key of ['votingOpen', 'resultsVisible']) {
    document.getElementById(key).addEventListener('change', async (e) => {
      try {
        const { settings } = await api('/api/admin/settings', { method: 'POST', body: { [key]: e.target.checked } });
        applySettings(settings);
        toast(key === 'votingOpen'
          ? (settings.votingOpen ? 'Votação aberta.' : 'Votação encerrada.')
          : (settings.resultsVisible ? 'Resultados visíveis ao público.' : 'Resultados ocultos ao público.'));
      } catch (err) {
        e.target.checked = !e.target.checked;
        toast(err.message, 'error');
      }
    });
  }
  document.getElementById('search').addEventListener('input', renderVoters);
  document.getElementById('filter').addEventListener('change', renderVoters);
  document.getElementById('print').addEventListener('click', () => { renderPrintCards(); window.print(); });

  await loadVoters();

  // Atualiza a tabela sempre que chega um voto (com um pequeno atraso para agrupar votos seguidos).
  let timer;
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => {
    applySettings(JSON.parse(e.data).settings);
    clearTimeout(timer);
    timer = setTimeout(loadVoters, 400);
  };
})();
