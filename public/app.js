// Funções partilhadas por todas as páginas.

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Ocorreu um erro. Tente novamente.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

function initials(name) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.filter((w) => !/^the$/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

let toastTimer;
function toast(message, type = 'ok') {
  let node = document.querySelector('.toast');
  if (!node) {
    node = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  node.textContent = message;
  node.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}

async function logout() {
  await api('/api/logout', { method: 'POST', body: {} }).catch(() => {});
  location.href = '/';
}

// Desenha a barra superior. "me" pode ser null (visitante não autenticado na página de resultados).
function renderTopbar(active, me, cfg) {
  const links = [];
  if (me && me.voter.role !== 'admin') links.push(['/votar', 'Votar']);
  links.push(['/resultados', 'Resultados']);
  if (me && me.voter.role === 'admin') links.push(['/admin', 'Administração']);

  const nav = el('nav', { class: 'nav', 'aria-label': 'Navegação principal' }, [
    ...links.map(([href, label]) => el('a', { href, class: href === active ? 'active' : null, text: label })),
    me ? el('span', { class: 'user-chip', text: me.voter.name }) : null,
    me
      ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: logout, text: 'Sair' })
      : el('a', { class: 'btn btn-ghost btn-sm', href: '/', text: 'Entrar' }),
  ]);

  const bar = el('header', { class: 'topbar no-print' }, [
    el('div', { class: 'topbar-inner' }, [
      el('a', { class: 'brand', href: me ? (me.voter.role === 'admin' ? '/admin' : '/votar') : '/' }, [
        el('img', { src: '/img/logo.png', alt: '' }),
        el('span', {}, [cfg.eventName, el('small', { text: cfg.eventSubtitle })]),
      ]),
      nav,
    ]),
  ]);
  document.body.prepend(bar);
}

const fmt = (n, d = 2) => n.toLocaleString('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d });
