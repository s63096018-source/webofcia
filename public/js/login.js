if (localStorage.getItem('cia_token')) {
  window.location.href = '/dashboard.html';
}

const form = document.getElementById('loginForm');
const errorEl = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.remove('visible');

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';

  try {
    const data = await API.login(username, password);
    localStorage.setItem('cia_token', data.token);
    localStorage.setItem('cia_user', JSON.stringify(data.user));
    window.location.href = '/dashboard.html';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.add('visible');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign in';
  }
});
