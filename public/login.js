const form = document.getElementById('login-form');
const input = document.getElementById('code');
const errorBox = document.getElementById('error');

const home = (voter) => (voter.role === 'admin' ? '/admin' : '/votar');

api('/api/me').then((me) => location.replace(home(me.voter))).catch(() => {});
api('/api/config').then((cfg) => { document.getElementById('event-name').textContent = cfg.eventName; }).catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  const code = input.value.trim();
  if (!code) {
    errorBox.textContent = 'Introduza o seu código.';
    errorBox.hidden = false;
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const { voter } = await api('/api/login', { method: 'POST', body: { code } });
    location.href = home(voter);
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
    input.select();
  } finally {
    button.disabled = false;
  }
});
