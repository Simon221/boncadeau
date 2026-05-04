/* ═══════════════════════════════════════════════════════════
   BONCADEAU – Fournisseur Dashboard JavaScript
   ═══════════════════════════════════════════════════════════ */
'use strict';

const API = '';

/* ─── Auth ─────────────────────────────────────────────── */
const token = localStorage.getItem('fournisseur_token');
if (!token) { window.location.href = 'fournisseur-login.html'; }

document.getElementById('adminName').textContent =
  localStorage.getItem('fournisseur_nom') || 'Fournisseur';
document.getElementById('fournisseurNom').textContent =
  localStorage.getItem('fournisseur_nom') || '—';

document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('fournisseur_token');
  localStorage.removeItem('fournisseur_nom');
  window.location.href = 'fournisseur-login.html';
});

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function apiFetch(url, opts = {}) {
  if (opts.body && typeof opts.body === 'object') opts.body = JSON.stringify(opts.body);
  const res = await fetch(API + url, { ...opts, headers: authHeaders() });
  if (res.status === 401) {
    localStorage.removeItem('fournisseur_token');
    window.location.href = 'fournisseur-login.html';
  }
  return res;
}

/* ─── Toast ─────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ─── Navigation ─────────────────────────────────────────── */
const sectionTitles = {
  dashboard: 'Tableau de bord',
  commandes: 'Mes commandes',
  paiements: 'Mes Paiements',
};

function showSection(name) {
  document.querySelectorAll('.section').forEach(s  => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n  => n.classList.remove('active'));
  const sec = document.getElementById(`section${cap(name)}`);
  if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (nav) nav.classList.add('active');
  document.getElementById('pageTitle').textContent = sectionTitles[name] || name;

  if (name === 'dashboard') loadDashboard();
  if (name === 'commandes') loadCommandes();
  if (name === 'paiements') loadPaiementsFoo();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    showSection(btn.dataset.section);
    document.getElementById('sidebar').classList.remove('open');
  });
});

document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

/* ─── Format helpers ─────────────────────────────────────── */
function fmtDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtNum(n) {
  return Number(n).toLocaleString('fr-FR');
}
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function statutBadge(s) {
  const cfg = {
    en_attente: { label: 'En attente', cls: 'statut--en_attente' },
    confirmee:  { label: 'Confirmée',  cls: 'statut--confirmee'  },
    livre:      { label: 'Livré',      cls: 'statut--livre'      },
    annulee:    { label: 'Annulée',    cls: 'statut--annulee'    },
    utilise:    { label: 'Utilisé',    cls: 'statut--utilise'    },
  };
  const c = cfg[s] || { label: s, cls: '' };
  return `<span class="statut ${c.cls}">${c.label}</span>`;
}

/* ─── Pagination ─────────────────────────────────────────── */
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = '';
  for (let p = 1; p <= totalPages; p++) {
    html += `<button class="page-btn${p === currentPage ? ' active' : ''}" data-page="${p}">${p}</button>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => onPageChange(parseInt(btn.dataset.page)));
  });
}

/* ════════════════════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════════════════════ */
async function loadDashboard() {
  const res = await apiFetch('/api/fournisseurs/stats');
  if (!res.ok) return;
  const data = await res.json();

  document.getElementById('statBons').textContent      = data.nb_bons;
  document.getElementById('statCommandes').textContent = data.nb_commandes;
  document.getElementById('statLivres').textContent    = data.nb_livres;
  document.getElementById('statUtilises').textContent  = data.nb_utilises;

  // Commandes récentes (5 premières)
  const resCmd = await apiFetch('/api/fournisseurs/commandes?page=1&limit=5');
  const tbody  = document.getElementById('recentCommandesTable');
  if (!resCmd.ok) { tbody.innerHTML = ''; return; }
  const { data: rows } = await resCmd.json();

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Aucune commande pour l'instant.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(c => `
    <tr>
      <td><code>${escHtml(c.reference)}</code></td>
      <td>${escHtml(c.prenom_acheteur)} ${escHtml(c.nom_acheteur)}</td>
      <td>${escHtml(c.bon_titre)}</td>
      <td>${fmtNum(c.prix)} ${escHtml(c.devise)}</td>
      <td>${statutBadge(c.statut)}</td>
      <td>${fmtDate(c.created_at)}</td>
    </tr>`).join('');
}

/* ════════════════════════════════════════════════════════════
   COMMANDES
   ════════════════════════════════════════════════════════════ */
let cmdPage   = 1;
let cmdStatut = '';

async function loadCommandes() {
  const search = (document.getElementById('cmdSearch').value || '').toLowerCase();

  // Mettre à jour badge "livrées" (bons livrés en attente de validation)
  const livreRes = await apiFetch('/api/fournisseurs/commandes?statut=livre&limit=1');
  if (livreRes.ok) {
    const ld    = await livreRes.json();
    const badge = document.getElementById('badgeCommandes');
    if (ld.total > 0) {
      badge.textContent = ld.total;
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }

  const res = await apiFetch(
    `/api/fournisseurs/commandes?page=${cmdPage}&limit=20${cmdStatut ? `&statut=${cmdStatut}` : ''}`
  );
  if (!res.ok) return;
  const { data, totalPages } = await res.json();

  let rows = data;
  if (search) {
    rows = rows.filter(c =>
      c.reference.toLowerCase().includes(search) ||
      (c.prenom_acheteur + ' ' + c.nom_acheteur).toLowerCase().includes(search) ||
      c.bon_titre.toLowerCase().includes(search)
    );
  }

  const tbody = document.getElementById('commandesTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Aucune commande trouvée.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(c => {
      const canValidate = c.statut === 'livre';
      const actionCell  = canValidate
        ? `<button class="btn-utilise" onclick="marquerUtilise(${c.id}, this)" title="Marquer comme utilisé">
             <i class="fas fa-check-double"></i> Valider
           </button>`
        : `<span style="color:#ccc;font-size:.8rem;">—</span>`;
      return `
        <tr>
          <td><code>${escHtml(c.reference)}</code></td>
          <td>
            <strong>${escHtml(c.prenom_acheteur)} ${escHtml(c.nom_acheteur)}</strong>
            ${c.prenom_dest ? `<br><small style="color:#888"><i class="fas fa-user-tag" style="margin-right:3px"></i>${escHtml(c.prenom_dest)} ${escHtml(c.nom_dest || '')}</small>` : ''}
          </td>
          <td>${escHtml(c.bon_titre)}</td>
          <td>${fmtNum(c.prix)} ${escHtml(c.devise)}</td>
          <td>${statutBadge(c.statut)}</td>
          <td>${fmtDate(c.created_at)}</td>
          <td>
            <div class="actions-cell" style="gap:6px">
              ${actionCell}
              <button class="btn btn-icon" title="Voir détails" onclick='showCommandeDetail(${JSON.stringify(c)})'>
                <i class="fas fa-eye"></i>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  renderPagination('cmdPagination', cmdPage, totalPages, p => { cmdPage = p; loadCommandes(); });
}

/* Ouvrir la modale de confirmation avant de marquer utilisé */
let _pendingUtiliseId  = null;
let _pendingUtiliseBtn = null;

function confirmerUtilise(id, triggerBtn, bonTitre, client, reference) {
  _pendingUtiliseId  = id;
  _pendingUtiliseBtn = triggerBtn;

  document.getElementById('confirmBonTitre').textContent = bonTitre  || '—';
  document.getElementById('confirmClient').textContent   = client    || '—';
  document.getElementById('confirmRef').textContent      = reference || '—';

  const btnOk = document.getElementById('btnConfirmUtilise');
  btnOk.disabled = false;
  btnOk.innerHTML = '<i class="fas fa-check-double"></i> Confirmer';
  openModal('modalConfirmUtilise');
}

/* Appelé par le bouton "Confirmer" dans la modale */
document.getElementById('btnConfirmUtilise').addEventListener('click', async () => {
    const id  = _pendingUtiliseId;
    const btn = _pendingUtiliseBtn;
    const btnOk = document.getElementById('btnConfirmUtilise');

    btnOk.disabled = true;
    btnOk.innerHTML = '<i class="fas fa-spinner fa-spin"></i> En cours…';

    const res = await apiFetch(`/api/fournisseurs/commandes/${id}/utilise`, { method: 'PATCH' });
    closeModal('modalConfirmUtilise');

    if (res.ok) {
      showToast('Bon marqué comme utilisé ✔');
      loadCommandes();
      if (document.getElementById('sectionDashboard').classList.contains('active')) {
        loadDashboard();
      }
    } else {
      const d = await res.json();
      showToast(d.error || 'Erreur lors de la mise à jour.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-double"></i> Valider';
      }
    }
  });

/* Marquer un bon comme utilisé (depuis le tableau — extrait les infos de la ligne) */
async function marquerUtilise(id, btn) {
  // Remonter à la ligne du tableau pour lire les infos
  const tr        = btn.closest('tr');
  const cells     = tr ? tr.querySelectorAll('td') : [];
  const reference = cells[0] ? cells[0].textContent.trim() : '';
  const client    = cells[1] ? cells[1].querySelector('strong')?.textContent.trim() || cells[1].textContent.trim() : '';
  const bonTitre  = cells[2] ? cells[2].textContent.trim() : '';

  confirmerUtilise(id, btn, bonTitre, client, reference);
}

/* Détail modal */
function showCommandeDetail(c) {
  const body = document.getElementById('commandeDetailBody');
  const hasDestinataire = c.prenom_dest || c.nom_dest || c.email_dest;
  const hasMessage      = c.message && c.message.trim();

  body.innerHTML = `
    <div class="detail-block">
      <h3>Commande</h3>
      <dl>
        <div class="detail-row"><dt>Référence</dt><dd><code>${escHtml(c.reference)}</code></dd></div>
        <div class="detail-row"><dt>Bon cadeau</dt><dd>${escHtml(c.bon_titre)}</dd></div>
        <div class="detail-row"><dt>Montant</dt><dd>${fmtNum(c.prix)} ${escHtml(c.devise)}</dd></div>
        <div class="detail-row"><dt>Date</dt><dd>${fmtDate(c.created_at)}</dd></div>
        <div class="detail-row"><dt>Statut</dt><dd>${statutBadge(c.statut)}</dd></div>
      </dl>
    </div>
    <div class="detail-block">
      <h3>Acheteur</h3>
      <dl>
        <div class="detail-row"><dt>Nom</dt><dd>${escHtml(c.prenom_acheteur)} ${escHtml(c.nom_acheteur)}</dd></div>
        <div class="detail-row"><dt>Email</dt><dd>${escHtml(c.email_acheteur)}</dd></div>
        <div class="detail-row"><dt>Téléphone</dt><dd>${escHtml(c.tel_acheteur)}</dd></div>
      </dl>
    </div>
    ${hasDestinataire ? `
    <div class="detail-block">
      <h3><i class="fas fa-user-tag" style="color:var(--gold);margin-right:6px"></i>Destinataire</h3>
      <dl>
        ${(c.prenom_dest || c.nom_dest) ? `<div class="detail-row"><dt>Nom</dt><dd>${escHtml(c.prenom_dest||'')} ${escHtml(c.nom_dest||'')}</dd></div>` : ''}
        ${c.email_dest ? `<div class="detail-row"><dt>Email</dt><dd>${escHtml(c.email_dest)}</dd></div>` : ''}
      </dl>
    </div>` : ''}
    ${hasMessage ? `
    <div class="detail-block">
      <h3><i class="fas fa-message" style="color:var(--gold);margin-right:6px"></i>Message personnalisé</h3>
      <p style="font-size:.92rem;line-height:1.6;color:var(--text);background:var(--bg);padding:12px 14px;border-radius:8px;border-left:3px solid var(--gold-light);margin-top:4px;white-space:pre-wrap">${escHtml(c.message)}</p>
    </div>` : ''}
    ${c.statut === 'livre' ? `
    <div style="margin-top:20px;text-align:center;">
      <button class="btn-utilise" style="padding:10px 24px;font-size:.9rem;" onclick="closeModal('modalCommande');confirmerUtilise(${c.id}, null, ${JSON.stringify(c.bon_titre)}, ${JSON.stringify(c.prenom_acheteur + ' ' + c.nom_acheteur)}, ${JSON.stringify(c.reference)})">
        <i class="fas fa-check-double"></i> Marquer comme utilisé
      </button>
    </div>` : ''}`;

  openModal('modalCommande');
}

/* ─── Filter pills ────────────────────────────────────────── */
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    cmdStatut = pill.dataset.statut;
    cmdPage   = 1;
    loadCommandes();
  });
});

document.getElementById('cmdSearch').addEventListener('input', () => {
  cmdPage = 1;
  loadCommandes();
});
/* ════════════════════════════════════════════════════════════
   PAIEMENTS
   ════════════════════════════════════════════════════════════ */
async function loadPaiementsFoo() {
  try {
    // Récupérer le bilan
    const bilRes = await apiFetch('/api/fournisseurs/bilan');
    const bilData = await bilRes.json();
    const bilan = bilData.data || bilData;

    // Afficher le bilan
    document.getElementById('bilanGenere').textContent = `${fmtNum(bilan.total_genere)} FCFA`;
    document.getElementById('bilanNbCommandes').textContent = `${bilan.nb_commandes_utilisees} commande${bilan.nb_commandes_utilisees > 1 ? 's' : ''} utilisée${bilan.nb_commandes_utilisees > 1 ? 's' : ''}`;
    document.getElementById('bilanPaye').textContent = `${fmtNum(bilan.total_paye)} FCFA`;
    document.getElementById('bilanDu').textContent = `${fmtNum(bilan.solde_du)} FCFA`;

    // Récupérer l'historique
    const paiRes = await apiFetch('/api/fournisseurs/paiements');
    const paiData = await paiRes.json();
    const paiements = paiData.data || [];

    // Afficher l'historique
    const tbody = document.getElementById('paiementsTbody');
    if (!paiements.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding:20px;text-align:center;color:#999;">Aucun paiement reçu pour l'instant.</td></tr>`;
    } else {
      tbody.innerHTML = paiements.map(p => `
        <tr>
          <td>${fmtDate(p.date_paiement)}</td>
          <td><strong style="color:#16a34a;font-size:1.05rem;">${fmtNum(p.montant)} FCFA</strong></td>
          <td>${p.reference ? `<code style="background:#f0f9ff;color:#0284c7;padding:3px 8px;border-radius:4px;font-size:.85rem;">${escHtml(p.reference)}</code>` : '—'}</td>
          <td>${p.notes ? `<span style="color:#666;font-size:.9rem;">${escHtml(p.notes)}</span>` : '—'}</td>
        </tr>`).join('');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showToast('Erreur lors du chargement des paiements.', 'error');
  }
}
/* ─── Modal helpers ──────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

/* ─── Init ───────────────────────────────────────────────── */
loadDashboard();
