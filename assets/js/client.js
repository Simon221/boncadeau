/* ═══════════════════════════════════════════════════════════
   BONCADEAU – Espace Client JavaScript
   ═══════════════════════════════════════════════════════════ */
'use strict';

const API = 'http://localhost:3001';

/* ─── Auth check ────────────────────────────────────────── */
const token = localStorage.getItem('client_token');
if (!token) { window.location.href = 'client-login.html'; }

const prenom = localStorage.getItem('client_prenom') || '';
const nom    = localStorage.getItem('client_nom')    || '';

/* ─── UI init ───────────────────────────────────────────── */
document.getElementById('heroPrenom').textContent = prenom;
document.getElementById('userName').textContent   = prenom + (nom ? ' ' + nom : '');
document.getElementById('userAvatar').textContent = (prenom[0] || '?').toUpperCase();

document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('client_token');
  localStorage.removeItem('client_prenom');
  localStorage.removeItem('client_nom');
  window.location.href = 'client-login.html';
});

/* ─── Helpers ───────────────────────────────────────────── */
function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtNum(n) {
  return Number(n).toLocaleString('fr-FR');
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/* ─── Statut stepper ────────────────────────────────────── */
const STEPS = [
  { key: 'en_attente', label: 'En attente', icon: 'fa-clock'        },
  { key: 'confirmee',  label: 'Confirmée',  icon: 'fa-check-circle' },
  { key: 'livre',      label: 'Livré',      icon: 'fa-box-open'     },
];

function buildStepper(statut) {
  if (statut === 'annulee') {
    return `
      <div class="order-stepper annulee">
        <div class="step">
          <div class="step-circle"><i class="fas fa-times-circle"></i></div>
          <span>Annulée</span>
        </div>
      </div>`;
  }
  const currentIdx = STEPS.findIndex(s => s.key === statut);
  return `
    <div class="order-stepper">
      ${STEPS.map((s, i) => `
        <div class="step ${i <= currentIdx ? 'done' : ''} ${i === currentIdx ? 'current' : ''}">
          <div class="step-circle"><i class="fas ${s.icon}"></i></div>
          <span>${s.label}</span>
          ${i < STEPS.length - 1
            ? `<div class="step-line ${i < currentIdx ? 'done' : ''}"></div>`
            : ''}
        </div>`).join('')}
    </div>`;
}

/* ─── Render one order card ──────────────────────────────── */
function renderCard(c) {
  const gradient  = c.couleur_fond || 'linear-gradient(135deg, #e8d5c4, #c9b8a8)';
  const canReview = c.statut === 'livre' && Number(c.a_avis) === 0;

  return `
    <article class="order-card">
      <div class="order-card__header" style="background:${gradient}">
        <i class="fas ${escHtml(c.icone || 'fa-gift')}"></i>
        <span class="order-ref">${escHtml(c.reference)}</span>
      </div>
      <div class="order-card__body">
        <h3>${escHtml(c.bon_titre)}</h3>
        <p class="order-fournisseur"><i class="fas fa-store"></i> ${escHtml(c.fournisseur)}</p>
        <div class="order-meta">
          <span class="order-price">${fmtNum(c.prix)} <small>${escHtml(c.devise)}</small></span>
          <span class="order-date"><i class="fas fa-calendar-alt"></i> ${fmtDate(c.created_at)}</span>
        </div>
        ${buildStepper(c.statut)}
        ${c.message ? `
          <div class="order-message">
            <i class="fas fa-quote-left"></i> ${escHtml(c.message)}
          </div>` : ''}
        ${canReview ? `
          <button class="btn-review" onclick="openAvis(${c.id}, ${JSON.stringify(c.bon_titre)})">
            <i class="fas fa-star"></i> Écrire un avis
          </button>` : ''}
        ${Number(c.a_avis) > 0 ? `
          <p class="avis-done"><i class="fas fa-check-circle"></i> Avis publié — merci !</p>` : ''}
      </div>
    </article>`;
}

/* ─── Load orders ────────────────────────────────────────── */
async function loadOrders() {
  const grid = document.getElementById('ordersGrid');
  try {
    const res = await fetch(API + '/api/clients/commandes', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (res.status === 401) {
      localStorage.removeItem('client_token');
      window.location.href = 'client-login.html';
      return;
    }
    const { data } = await res.json();
    document.getElementById('statCount').textContent = data.length;

    if (!data.length) {
      grid.innerHTML = `
        <div class="orders-empty">
          <i class="fas fa-gift"></i>
          <p>Vous n'avez pas encore passé de commande.</p>
          <a href="../index.html" class="btn-auth" style="display:inline-flex;margin-top:16px;max-width:240px">
            Découvrir nos bons cadeaux
          </a>
        </div>`;
      return;
    }
    grid.innerHTML = data.map(renderCard).join('');
  } catch (err) {
    grid.innerHTML = `
      <div class="orders-empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Erreur de chargement : ${escHtml(err.message)}</p>
      </div>`;
  }
}

/* ─── Avis modal ─────────────────────────────────────────── */
let selectedNote = 0;
const starLabels  = ['', 'Décevant 😞', 'Passable 😐', 'Bien 🙂', 'Très bien 😊', 'Excellent ⭐'];

document.querySelectorAll('#starRating span').forEach(star => {
  star.addEventListener('mouseenter', () => {
    const val = parseInt(star.dataset.val);
    document.querySelectorAll('#starRating span').forEach((s, i) => {
      s.classList.toggle('hover', i < val);
    });
  });
  star.addEventListener('click', () => {
    selectedNote = parseInt(star.dataset.val);
    document.querySelectorAll('#starRating span').forEach((s, i) => {
      s.classList.toggle('active', i < selectedNote);
      s.classList.remove('hover');
    });
    document.getElementById('starLabel').textContent = starLabels[selectedNote] || '';
  });
});
document.getElementById('starRating').addEventListener('mouseleave', () => {
  document.querySelectorAll('#starRating span').forEach(s => s.classList.remove('hover'));
});

function openAvis(commandeId, bonTitle) {
  selectedNote = 0;
  document.getElementById('avisCommandeId').value   = commandeId;
  document.getElementById('avisBonTitle').textContent = bonTitle;
  document.getElementById('avisCommentaire').value  = '';
  document.getElementById('avisError').style.display = 'none';
  document.querySelectorAll('#starRating span').forEach(s => s.classList.remove('active', 'hover'));
  document.getElementById('starLabel').textContent = 'Cliquez pour noter';
  document.getElementById('avisOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAvis() {
  document.getElementById('avisOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

document.getElementById('avisForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('avisError');
  errEl.style.display = 'none';

  if (!selectedNote) {
    errEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Veuillez choisir une note.';
    errEl.style.display = 'flex';
    return;
  }

  const btn  = document.getElementById('btnAvisSubmit');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publication…';

  try {
    const res = await fetch(API + '/api/clients/avis', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body   : JSON.stringify({
        commande_id : parseInt(document.getElementById('avisCommandeId').value),
        note        : selectedNote,
        commentaire : document.getElementById('avisCommentaire').value.trim() || null,
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la publication.');

    closeAvis();
    await loadOrders(); // rafraîchir le dashboard
  } catch (err) {
    errEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + escHtml(err.message);
    errEl.style.display = 'flex';
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
});

/* ─── Init ──────────────────────────────────────────────── */
loadOrders();
