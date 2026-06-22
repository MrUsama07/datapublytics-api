const API_BASE = window.location.origin.includes('localhost')
  ? 'http://localhost:5000/api'
  : window.location.origin + '/api';

async function handleSignup(e) {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errBox = document.getElementById('error');
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) { errBox.textContent = data.error; return; }
    localStorage.setItem('dp_token', data.token);
    window.location.href = 'dashboard.html';
  } catch (err) {
    errBox.textContent = 'Network error. Please try again.';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errBox = document.getElementById('error');
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { errBox.textContent = data.error; return; }
    localStorage.setItem('dp_token', data.token);
    localStorage.setItem('dp_user', JSON.stringify(data.user));
    window.location.href = 'dashboard.html';
  } catch (err) {
    errBox.textContent = 'Network error. Please try again.';
  }
}

function logout() {
  localStorage.removeItem('dp_token');
  localStorage.removeItem('dp_user');
  window.location.href = 'login.html';
}
