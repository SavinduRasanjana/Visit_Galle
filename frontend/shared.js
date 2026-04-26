/* shared.js — Visit Galle common utilities */

// ── SINGLE API SOURCE OF TRUTH ────────────────────────────────
const API = window.VGALLE_API || 'https://visitgalle-production-3491.up.railway.app/api';
window.API = API;

// ── AUTH HELPERS ──────────────────────────────────────────────
function authSave(token, user) {
  localStorage.setItem('vg_token', token);
  localStorage.setItem('vg_user', JSON.stringify(user));
}
function authClear() {
  localStorage.removeItem('vg_token');
  localStorage.removeItem('vg_user');
}
function authGetToken() { return localStorage.getItem('vg_token'); }
function authGetUser() {
  try { return JSON.parse(localStorage.getItem('vg_user')); } catch { return null; }
}
function authLogout() {
  authClear();
  showToast('You have been signed out.');
  setTimeout(() => { window.location.href = 'index.html'; }, 800);
}

// ── INJECT AUTH NAV ───────────────────────────────────────────
function injectAuthNav() {
  const nav = document.getElementById('site-nav');
  if (!nav) return;

  // Remove any existing auth nav item to avoid duplicates
  nav.querySelectorAll('.nav-auth').forEach(el => el.remove());

  const user = authGetUser();
  if (user) {
    // Logged-in: show user menu
    const wrap = document.createElement('div');
    wrap.className = 'nav-auth nav-user-menu';
    wrap.innerHTML = `
      <button class="nav-user-btn" id="nav-user-btn" aria-label="User menu">
        <span class="nav-avatar">${user.name.charAt(0).toUpperCase()}</span>
        <span class="nav-username">${user.name.split(' ')[0]}</span>
        <span class="nav-chevron">▾</span>
      </button>
      <div class="nav-dropdown" id="nav-dropdown">
        <div class="nav-dropdown-header">
          <strong>${user.name}</strong>
          <span>${user.email}</span>
        </div>
        <a href="my-itinerary.html">🗺️ My Itinerary</a>
        ${user.role === 'admin' ? '<a href="admin.html">⚙️ Admin Panel</a>' : ''}
        <a href="#" onclick="authLogout(); return false;">🚪 Sign Out</a>
      </div>`;
    nav.appendChild(wrap);

    // Toggle dropdown
    document.addEventListener('click', e => {
      const btn = document.getElementById('nav-user-btn');
      const dd  = document.getElementById('nav-dropdown');
      if (!btn || !dd) return;
      if (btn.contains(e.target)) {
        dd.classList.toggle('open');
      } else if (!dd.contains(e.target)) {
        dd.classList.remove('open');
      }
    });
  } else {
    // Not logged in: show Sign In link
    const a = document.createElement('a');
    a.href = 'login.html';
    a.className = 'nav-cta nav-auth';
    a.textContent = 'Sign In';
    nav.appendChild(a);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Header scroll shadow
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 40);
    });
  }

  // Mobile nav
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('site-nav');
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => nav.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!hamburger.contains(e.target) && !nav.contains(e.target)) {
        nav.classList.remove('open');
      }
    });
  }

  // Fade-in on scroll
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.10 });
  document.querySelectorAll('.fade-in').forEach(el => io.observe(el));

  // Active nav link
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.site-nav a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });

  // Inject auth nav
  injectAuthNav();
});

function showToast(msg, duration = 3800) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}
