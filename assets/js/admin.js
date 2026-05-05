/* ═══════════════════════════════════════════════════════════
   BONCADEAU – Admin Backoffice JavaScript
   ═══════════════════════════════════════════════════════════ */
'use strict';

// URL de base vide → les appels /api/... sont relatifs au domaine courant
// nginx redirige /api/ vers le conteneur api:3001
const API = '';

/* ─── Auth ─────────────────────────────────────────────── */
const token = localStorage.getItem('admin_token');
if (!token) { window.location.href = 'admin-login.html'; }

document.getElementById('adminName').textContent =
  localStorage.getItem('admin_nom') || 'Admin';

document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_nom');
  window.location.href = 'admin-login.html';
});

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function apiFetch(url, opts = {}) {
  if (opts.body && typeof opts.body === 'object') opts.body = JSON.stringify(opts.body);
  const res = await fetch(API + url, { ...opts, headers: authHeaders() });
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = 'admin-login.html';
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ─── Navigation ─────────────────────────────────────────── */
const sectionTitles = {
  dashboard:     'Tableau de bord',
  commandes:     'Commandes',
  bons:          'Bons cadeaux',
  fournisseurs:  'Fournisseurs',
  paiements:     'Paiements Fournisseurs',
  clients:       'Clients',
  utilisateurs:  'Utilisateurs',
};

function showSection(name) {
  document.querySelectorAll('.section').forEach(s  => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n  => n.classList.remove('active'));
  document.getElementById(`section${cap(name)}`).classList.add('active');
  document.querySelector(`.nav-item[data-section="${name}"]`).classList.add('active');
  document.getElementById('pageTitle').textContent = sectionTitles[name] || name;

  if (name === 'dashboard')    loadDashboard();
  if (name === 'commandes')    loadCommandes();
  if (name === 'bons')         loadBons();
  if (name === 'fournisseurs') loadFournisseurs();
  if (name === 'paiements')    loadPaiements();
  if (name === 'clients')      loadClients();
  if (name === 'utilisateurs') loadUtilisateurs();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    showSection(btn.dataset.section);
    closeSidebar();
  });
});

/* Mobile sidebar */
document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

/* ─── Format helpers ─────────────────────────────────────── */
function fmtDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtNum(n) {
  return Number(n).toLocaleString('fr-FR');
}
function statutBadge(s) {
  const labels = { en_attente:'En attente', confirmee:'Confirmée', livre:'Livré', annulee:'Annulée', utilise:'Utilisé' };
  return `<span class="statut statut--${s}">${labels[s] || s}</span>`;
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════ */
async function loadDashboard() {
  const res  = await apiFetch('/api/admin/stats');
  if (!res.ok) return;
  const data = await res.json();

  document.getElementById('statBons').textContent      = data.nb_bons;
  document.getElementById('statCommandes').textContent = data.nb_commandes;
  document.getElementById('statClients').textContent   = data.nb_clients;
  document.getElementById('statRevenu').textContent    = fmtNum(data.revenu);

  const tbody = document.querySelector('#recentCommandesTable tbody');
  if (!data.recentes.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Aucune commande pour l'instant.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.recentes.map(c => `
    <tr>
      <td><code>${c.reference}</code></td>
      <td>${escHtml(c.acheteur)}</td>
      <td>${escHtml(c.bon_titre)}</td>
      <td>${fmtNum(c.prix)} ${c.devise}</td>
      <td>${statutBadge(c.statut)}</td>
      <td>${fmtDate(c.created_at)}</td>
    </tr>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   COMMANDES
   ═══════════════════════════════════════════════════════════ */
let cmdPage   = 1;
let cmdStatut = '';

async function loadCommandes() {
  const search = (document.getElementById('cmdSearch').value || '').toLowerCase();
  const res = await apiFetch(
    `/api/admin/commandes?page=${cmdPage}&limit=20${cmdStatut ? `&statut=${cmdStatut}` : ''}`
  );
  if (!res.ok) return;
  const { data, total, totalPages } = await res.json();

  // Update pending badge
  const pendingRes  = await apiFetch('/api/admin/commandes?statut=en_attente&limit=1');
  if (pendingRes.ok) {
    const pd = await pendingRes.json();
    const badge = document.getElementById('badgeCommandes');
    if (pd.total > 0) {
      badge.textContent = pd.total;
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }

  let rows = data;
  if (search) {
    rows = rows.filter(c =>
      c.reference.toLowerCase().includes(search) ||
      (c.prenom_acheteur + ' ' + c.nom_acheteur).toLowerCase().includes(search) ||
      c.email_acheteur.toLowerCase().includes(search)
    );
  }

  const tbody = document.getElementById('commandesTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">Aucune commande trouvée.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(c => `
      <tr>
        <td><code>${c.reference}</code></td>
        <td>${escHtml(c.prenom_acheteur)} ${escHtml(c.nom_acheteur)}</td>
        <td>${escHtml(c.email_acheteur)}</td>
        <td>${escHtml(c.tel_acheteur)}</td>
        <td>${escHtml(c.bon_titre)}</td>
        <td>${fmtNum(c.prix)} ${c.devise}</td>
        <td>
          <select class="statut-select" onchange="updateStatut(${c.id}, this.value)">
            <option value="en_attente" ${c.statut==='en_attente'?'selected':''}>En attente</option>
            <option value="confirmee"  ${c.statut==='confirmee' ?'selected':''}>Confirmée</option>
            <option value="livre"      ${c.statut==='livre'     ?'selected':''}>Livré</option>
            <option value="annulee"    ${c.statut==='annulee'   ?'selected':''}>Annulée</option>
            <option value="utilise"    ${c.statut==='utilise'   ?'selected':''}>Utilisé</option>
          </select>
        </td>
        <td>${fmtDate(c.created_at)}</td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-icon" title="Voir détails" onclick='showCommandeDetail(${JSON.stringify(c)})'>
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </td>
      </tr>`).join('');
  }

  renderPagination('cmdPagination', cmdPage, totalPages, p => { cmdPage = p; loadCommandes(); });
}

async function updateStatut(id, statut) {
  const res = await apiFetch(`/api/admin/commandes/${id}/statut`, { method: 'PATCH', body: { statut } });
  if (res.ok) showToast('Statut mis à jour.');
  else showToast('Erreur lors de la mise à jour.', 'error');
}

function showCommandeDetail(c) {
  const body = document.getElementById('commandeDetailBody');

  const hasDestinataire = c.prenom_dest || c.nom_dest || c.email_dest;
  const hasMessage      = c.message && c.message.trim();

  body.innerHTML = `
    <div class="detail-block">
      <h3>Commande</h3>
      <dl>
        <div class="detail-row"><dt>Référence</dt><dd><code>${c.reference}</code></dd></div>
        <div class="detail-row"><dt>Bon cadeau</dt><dd>${escHtml(c.bon_titre)}</dd></div>
        <div class="detail-row"><dt>Montant</dt><dd>${fmtNum(c.prix)} ${c.devise}</dd></div>
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
    </div>` : `
    <div class="detail-block">
      <h3><i class="fas fa-message" style="color:#ccc;margin-right:6px"></i>Message personnalisé</h3>
      <p style="font-size:.88rem;color:var(--text-muted);font-style:italic">Aucun message personnalisé.</p>
    </div>`}`;
  openModal('modalCommande');
}

// Filter pills
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

/* ═══════════════════════════════════════════════════════════
   BONS CADEAUX
   ═══════════════════════════════════════════════════════════ */
let allCategories   = [];
let allFournisseurs = [];
let editingBonId    = null;

async function loadBons() {
  const [resB, resC, resF] = await Promise.all([
    apiFetch('/api/admin/bons'),
    apiFetch('/api/admin/categories'),
    apiFetch('/api/admin/fournisseurs'),
  ]);
  const bons         = await resB.json();
  allCategories      = await resC.json();
  allFournisseurs    = await resF.json();

  // Populate selects in modal
  const catSel   = document.getElementById('bonCategorie');
  const fournSel = document.getElementById('bonFournisseur');
  catSel.innerHTML   = `<option value="">— Catégorie —</option>` +
    allCategories.map(c => `<option value="${c.id}">${escHtml(c.nom)}</option>`).join('');
  fournSel.innerHTML = `<option value="">— Fournisseur —</option>` +
    allFournisseurs.map(f => `<option value="${f.id}">${escHtml(f.nom)}</option>`).join('');

  const tbody = document.getElementById('bonsTbody');
  if (!bons.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Aucun bon cadeau.</td></tr>`;
    return;
  }
  tbody.innerHTML = bons.map(b => `
    <tr>
      <td><strong>${escHtml(b.titre)}</strong><br><small style="color:#999">${b.slug}</small></td>
      <td>${escHtml(b.categorie_nom)}</td>
      <td>${escHtml(b.fournisseur_nom)}</td>
      <td>${fmtNum(b.prix)} ${b.devise}</td>
      <td>${b.note_moyenne} ★ <small style="color:#999">(${b.nb_avis})</small></td>
      <td><span class="statut statut--${b.actif ? 'actif' : 'inactif'}">${b.actif ? 'Actif' : 'Inactif'}</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-icon" title="Modifier" onclick='openEditBon(${JSON.stringify(b)})'>
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn btn-icon danger" title="Désactiver" onclick="desactiverBon(${b.id}, ${b.actif})">
            <i class="fas fa-${b.actif ? 'eye-slash' : 'eye'}"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

document.getElementById('btnAddBon').addEventListener('click', () => {
  editingBonId = null;
  document.getElementById('modalBonTitle').textContent = 'Nouveau bon cadeau';
  document.getElementById('bonForm').reset();
  document.getElementById('bonId').value    = '';
  document.getElementById('bonActif').checked = true;
  document.getElementById('bonImagePreview').style.display = 'none';
  document.getElementById('bonImagePreview').src = '';
  document.getElementById('bonImageLabel').textContent = 'Choisir une image…';
  openModal('modalBon');
});

/* Prévisualisation à la sélection d'un fichier */
document.getElementById('bonImageFile').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('bonImagePreview');
    preview.src           = e.target.result;
    preview.style.display = 'block';
    document.getElementById('bonImageLabel').textContent = file.name;
  };
  reader.readAsDataURL(file);
});

function openEditBon(b) {
  editingBonId = b.id;
  document.getElementById('modalBonTitle').textContent = 'Modifier le bon';
  document.getElementById('bonId').value          = b.id;
  document.getElementById('bonTitre').value       = b.titre       || '';
  document.getElementById('bonSlug').value        = b.slug        || '';
  document.getElementById('bonPrix').value        = b.prix        || '';
  document.getElementById('bonBadge').value       = b.badge       || '';
  document.getElementById('bonDescCourte').value  = b.description_courte || '';
  document.getElementById('bonDescLongue').value  = b.description_longue || '';
  // Prévisualisation image existante
  const preview = document.getElementById('bonImagePreview');
  const label   = document.getElementById('bonImageLabel');
  if (b.image_url) {
    preview.src          = b.image_url;
    preview.style.display = 'block';
    label.textContent    = 'Changer l\'image…';
  } else {
    preview.src          = '';
    preview.style.display = 'none';
    label.textContent    = 'Choisir une image…';
  }
  document.getElementById('bonImageFile').value = '';
  document.getElementById('bonCouleur').value   = b.couleur_fond || '';
  document.getElementById('bonActif').checked     = !!b.actif;

  // Select correct options
  const catSel   = document.getElementById('bonCategorie');
  const fournSel = document.getElementById('bonFournisseur');
  [...catSel.options].forEach(o => { o.selected = (o.value == b.categorie_id); });
  [...fournSel.options].forEach(o => { o.selected = (o.value == b.fournisseur_id); });

  // Load inclusions / conditions via detail API
  apiFetch(`/api/bons/${b.slug}`).then(r => r.json()).then(detail => {
    document.getElementById('bonInclusions').value = (detail.inclusions || []).join('\n');
    document.getElementById('bonConditions').value = (detail.conditions || []).join('\n');
  }).catch(() => {});

  openModal('modalBon');
}

document.getElementById('btnSaveBon').addEventListener('click', async () => {
  const payload = {
    categorie_id:       parseInt(document.getElementById('bonCategorie').value),
    fournisseur_id:     parseInt(document.getElementById('bonFournisseur').value),
    titre:              document.getElementById('bonTitre').value.trim(),
    slug:               document.getElementById('bonSlug').value.trim(),
    description_courte: document.getElementById('bonDescCourte').value.trim(),
    description_longue: document.getElementById('bonDescLongue').value.trim(),
    prix:               parseFloat(document.getElementById('bonPrix').value),
    devise:             'FCFA',
    icone:              'fa-gift',
    couleur_fond:       document.getElementById('bonCouleur').value.trim(),
    badge:              document.getElementById('bonBadge').value.trim() || null,
    actif:              document.getElementById('bonActif').checked,
    inclusions: document.getElementById('bonInclusions').value.split('\n').map(s => s.trim()).filter(Boolean),
    conditions: document.getElementById('bonConditions').value.split('\n').map(s => s.trim()).filter(Boolean),
  };

  if (!payload.titre || !payload.slug || !payload.categorie_id || !payload.fournisseur_id || !payload.prix) {
    showToast('Veuillez remplir tous les champs obligatoires (*).', 'error');
    return;
  }

  const url    = editingBonId ? `/api/admin/bons/${editingBonId}` : '/api/admin/bons';
  const method = editingBonId ? 'PUT' : 'POST';
  const res    = await apiFetch(url, { method, body: payload });
  const data   = await res.json();

  if (!res.ok) {
    showToast(data.error || 'Erreur lors de l\'enregistrement.', 'error');
    return;
  }

  // Upload image si un fichier est sélectionné
  const bonId    = editingBonId || data.id;
  const imageFile = document.getElementById('bonImageFile').files[0];
  if (imageFile) {
    const fd = new FormData();
    fd.append('image', imageFile);
    const imgRes = await fetch(API + `/api/admin/bons/${bonId}/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!imgRes.ok) {
      const imgData = await imgRes.json();
      showToast('Bon sauvegardé mais erreur image : ' + (imgData.error || ''), 'error');
      closeModal('modalBon');
      loadBons();
      return;
    }
  }

  showToast(editingBonId ? 'Bon mis à jour avec succès.' : 'Bon créé avec succès.');
  closeModal('modalBon');
  loadBons();
});

async function desactiverBon(id, actif) {
  const action = actif ? 'désactiver' : 'réactiver';
  if (!confirm(`Voulez-vous ${action} ce bon ?`)) return;

  let res;
  if (actif) {
    // Soft delete (sets actif=0)
    res = await apiFetch(`/api/admin/bons/${id}`, { method: 'DELETE' });
  } else {
    // Reactivate: need a minimal PUT — fetch existing data first
    const dataRes = await apiFetch('/api/admin/bons');
    const bons    = await dataRes.json();
    const bon     = bons.find(b => b.id === id);
    if (!bon) { showToast('Bon introuvable.', 'error'); return; }
    res = await apiFetch(`/api/admin/bons/${id}`, {
      method: 'PUT',
      body:   { ...bon, actif: true, inclusions: [], conditions: [] },
    });
  }

  if (res.ok) {
    showToast(`Bon ${actif ? 'désactivé' : 'réactivé'}.`);
    loadBons();
  } else {
    showToast('Erreur.', 'error');
  }
}

// Auto-generate slug from title
document.getElementById('bonTitre').addEventListener('input', function () {
  if (editingBonId) return; // don't overwrite when editing
  document.getElementById('bonSlug').value = slugify(this.value);
});

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ═══════════════════════════════════════════════════════════
   FOURNISSEURS
   ═══════════════════════════════════════════════════════════ */
let editingFournisseurId = null;

/* ════════════════════════════════════════════════════════════
   PAIEMENTS FOURNISSEURS
   ════════════════════════════════════════════════════════════ */
async function loadPaiements() {
  const res = await apiFetch('/api/admin/paiements');
  if (!res.ok) {
    showToast('Erreur lors du chargement des paiements.', 'error');
    return;
  }
  const data = await res.json();
  const fournisseurs = data.data || [];

  // Calculer les totaux globaux
  let totalRevenueAdmin = 0;
  let totalPaidAll = 0;
  let totalDueAll = 0;

  const tbody = document.getElementById('paiementsTbody');
  if (!fournisseurs.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Aucun fournisseur avec des bons utilisés.</td></tr>`;
    document.getElementById('totalRevenueAdmin').textContent = '0 FCFA';
    document.getElementById('totalPaidAll').textContent = '0 FCFA';
    document.getElementById('totalDueAll').textContent = '0 FCFA';
    return;
  }

  tbody.innerHTML = fournisseurs.map(f => {
    // Revenue du fournisseur = 100% du prix du bon (quand utilisé)
    const revenueF = parseFloat(f.total_genere) || 0;
    
    // Commission admin = total_genere est déjà 90% (après déduction de 10% admin)
    // Donc commission admin = revenueF * 10 / 90 (pour récupérer les 10%)
    const commissionAdmin = (revenueF * 10) / 90;
    
    // Total réel généré = revenueF + commissionAdmin
    const totalGenere = revenueF + commissionAdmin;
    
    // Montant payé
    const paid = parseFloat(f.total_paye) || 0;
    
    // Solde dû = ce que le fournisseur doit recevoir - ce qu'il a reçu
    const due = revenueF - paid;
    
    totalRevenueAdmin += commissionAdmin;
    totalPaidAll += paid;
    totalDueAll += due;

    const dueColor = due > 0 ? '#dc2626' : '#16a34a';
    const dueStyle = due > 0 ? 'font-weight:700;color:' + dueColor : 'color:' + dueColor;

    return `
    <tr>
      <td>
        <strong>${escHtml(f.nom)}</strong><br/>
        <small style="color:#999">${escHtml(f.email)}</small>
      </td>
      <td style="text-align:right;">
        <span style="color:#059669;font-weight:700">${fmtNum(revenueF)} FCFA</span>
      </td>
      <td style="text-align:right;">
        <span style="color:#d97706;font-weight:700">${fmtNum(commissionAdmin)} FCFA</span>
      </td>
      <td style="text-align:right;">
        <span style="color:#2563eb;font-weight:700">${fmtNum(paid)} FCFA</span>
      </td>
      <td style="text-align:right;">
        <span style="${dueStyle}">${fmtNum(due)} FCFA</span>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-primary btn-sm" title="Détails et paiements" onclick="openPaiementDetail(${f.id}, '${escHtml(f.nom).replace(/'/g, "\\'")}')">
            <i class="fas fa-receipt"></i> Détails
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Mettre à jour les totaux globaux
  document.getElementById('totalRevenueAdmin').textContent = fmtNum(totalRevenueAdmin) + ' FCFA';
  document.getElementById('totalPaidAll').textContent = fmtNum(totalPaidAll) + ' FCFA';
  document.getElementById('totalDueAll').textContent = fmtNum(totalDueAll) + ' FCFA';
}

async function openPaiementDetail(fournisseurId, fournisseurNom) {
  try {
    // Récupérer le bilan
    const bilRes = await apiFetch(`/api/admin/fournisseurs/${fournisseurId}/bilan`);
    const bil = await bilRes.json();
    const bilan = bil.data || bil;

    // Récupérer l'historique des paiements
    const paiRes = await apiFetch(`/api/admin/fournisseurs/${fournisseurId}/paiements`);
    const paiData = await paiRes.json();
    const paiements = paiData.data || [];

    // Calculer les valeurs
    const revenueF = parseFloat(bilan.total_genere) || 0;
    const commissionAdmin = (revenueF * 10) / 90;
    const paid = parseFloat(bilan.total_paye) || 0;
    const due = revenueF - paid;

    // Mettre à jour le titre du modal (avec vérification)
    const titleEl = document.getElementById('modalPaiementTitle');
    if (titleEl) titleEl.textContent = fournisseurNom;

    // Afficher le bilan (avec vérification)
    const revEl = document.getElementById('detailRevenueFournisseur');
    if (revEl) revEl.textContent = `${fmtNum(revenueF)} FCFA`;
    
    const commEl = document.getElementById('detailCommissionAdmin');
    if (commEl) commEl.textContent = `${fmtNum(commissionAdmin)} FCFA`;
    
    const paidEl = document.getElementById('detailPayé');
    if (paidEl) paidEl.textContent = `${fmtNum(paid)} FCFA`;
    
    const dueEl = document.getElementById('detailDû');
    if (dueEl) dueEl.textContent = `${fmtNum(due)} FCFA`;

    // Afficher l'historique
    const tbody = document.getElementById('paiementsHistoriqueTbody');
    if (tbody) {
      if (!paiements.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:#999;font-size:.9rem;">Aucun paiement enregistré</td></tr>`;
      } else {
        tbody.innerHTML = paiements.map(p => {
          const statutColor = p.statut === 'effectif' ? '#16a34a' : '#f59e0b';
          const statutLabel = p.statut === 'effectif' ? '✓ Effectif' : '⏳ En attente';
          const confirmBtn = p.statut === 'en_attente' 
            ? `<button class="btn btn-xs" style="padding:4px 8px;font-size:.75rem;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;" onclick="confirmerPaiement(${p.id}, this)"><i class="fas fa-check"></i> Confirmer</button>`
            : '';
          return `
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 12px;font-size:.9rem;">${fmtDate(p.date_paiement)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;color:#059669;">${fmtNum(p.montant)} FCFA</td>
            <td style="padding:10px 12px;font-size:.85rem;">${p.reference ? `<code style="background:#f0f9ff;color:#0284c7;padding:2px 6px;border-radius:3px;">${escHtml(p.reference)}</code>` : '—'}</td>
            <td style="padding:10px 12px;text-align:center;"><span style="display:inline-block;padding:3px 8px;background:${statutColor}22;color:${statutColor};border-radius:3px;font-weight:600;font-size:.8rem;">${statutLabel}</span></td>
            <td style="padding:10px 12px;font-size:.85rem;color:#666;">${p.notes ? escHtml(p.notes) : '—'} ${confirmBtn}</td>
          </tr>`;
        }).join('');
      }
    }

    // Préparer le modal (avec vérification)
    const fournisseurIdInput = document.getElementById('paiementFournisseurId');
    if (fournisseurIdInput) fournisseurIdInput.value = fournisseurId;
    
    const nameSpan = document.getElementById('modalPaymentFournisseurName');
    if (nameSpan) nameSpan.textContent = fournisseurNom;
    
    const montantInput = document.getElementById('paiementMontant');
    if (montantInput) montantInput.value = '';
    
    const dateInput = document.getElementById('paiementDate');
    if (dateInput) dateInput.valueAsDate = new Date();
    
    const refInput = document.getElementById('paiementRef');
    if (refInput) refInput.value = '';
    
    const notesInput = document.getElementById('paiementNotes');
    if (notesInput) notesInput.value = '';

    openModal('modalPaiementDetail');
  } catch (error) {
    console.error('Erreur dans openPaiementDetail:', error);
    showToast('Erreur lors du chargement des détails.', 'error');
  }
}

async function confirmerPaiement(paiementId, btnElement) {
  try {
    btnElement.disabled = true;
    btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Confirmation...';
    
    const res = await apiFetch(`/api/admin/paiements/${paiementId}/confirmer`, {
      method: 'PATCH'
    });
    
    if (res.ok) {
      showToast('Paiement confirmé avec succès !', 'success');
      // Recharger l'historique
      const fournisseurId = parseInt(document.getElementById('paiementFournisseurId').value);
      const bilanRes = await apiFetch(`/api/admin/fournisseurs/${fournisseurId}/bilan`);
      const bilData = await bilanRes.json();
      const bilan = bilData.data || bilData;
      
      // Recalculer les valeurs
      const revenueF = parseFloat(bilan.total_genere) || 0;
      const commissionAdmin = (revenueF * 10) / 90;
      const paid = parseFloat(bilan.total_paye) || 0;
      const due = revenueF - paid;
      
      document.getElementById('detailRevenueFournisseur').textContent = `${fmtNum(revenueF)} FCFA`;
      document.getElementById('detailCommissionAdmin').textContent = `${fmtNum(commissionAdmin)} FCFA`;
      document.getElementById('detailPayé').textContent = `${fmtNum(paid)} FCFA`;
      document.getElementById('detailDû').textContent = `${fmtNum(due)} FCFA`;
      
      // Recharger paiements
      const paiRes = await apiFetch(`/api/admin/fournisseurs/${fournisseurId}/paiements`);
      const paiData = await paiRes.json();
      const paiements = paiData.data || [];
      
      const tbody = document.getElementById('paiementsHistoriqueTbody');
      tbody.innerHTML = paiements.map(p => {
        const statutColor = p.statut === 'effectif' ? '#16a34a' : '#f59e0b';
        const statutLabel = p.statut === 'effectif' ? '✓ Effectif' : '⏳ En attente';
        const confirmBtn = p.statut === 'en_attente' 
          ? `<button class="btn btn-xs" style="padding:4px 8px;font-size:.75rem;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;" onclick="confirmerPaiement(${p.id}, this)"><i class="fas fa-check"></i> Confirmer</button>`
          : '';
        return `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 12px;font-size:.9rem;">${fmtDate(p.date_paiement)}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:#059669;">${fmtNum(p.montant)} FCFA</td>
          <td style="padding:10px 12px;font-size:.85rem;">${p.reference ? `<code style="background:#f0f9ff;color:#0284c7;padding:2px 6px;border-radius:3px;">${escHtml(p.reference)}</code>` : '—'}</td>
          <td style="padding:10px 12px;text-align:center;"><span style="display:inline-block;padding:3px 8px;background:${statutColor}22;color:${statutColor};border-radius:3px;font-weight:600;font-size:.8rem;">${statutLabel}</span></td>
          <td style="padding:10px 12px;font-size:.85rem;color:#666;">${p.notes ? escHtml(p.notes) : '—'} ${confirmBtn}</td>
        </tr>`;
      }).join('');
      
      // Recharger aussi le tableau principal
      loadPaiements();
    } else {
      showToast('Erreur lors de la confirmation.', 'error');
      btnElement.disabled = false;
      btnElement.innerHTML = '<i class="fas fa-check"></i> Confirmer';
    }
  } catch (error) {
    console.error('Erreur:', error);
    showToast('Erreur lors de la confirmation.', 'error');
    btnElement.disabled = false;
    btnElement.innerHTML = '<i class="fas fa-check"></i> Confirmer';
  }
}

document.getElementById('btnSavePaiement').addEventListener('click', async () => {
  const fournisseurId = parseInt(document.getElementById('paiementFournisseurId').value);
  const montant = parseFloat(document.getElementById('paiementMontant').value);
  const date = document.getElementById('paiementDate').value;
  const reference = document.getElementById('paiementRef').value.trim() || null;
  const notes = document.getElementById('paiementNotes').value.trim() || null;

  if (!montant || montant <= 0 || !date) {
    showToast('Veuillez remplir le montant et la date.', 'error');
    return;
  }

  const res = await apiFetch('/api/admin/paiements', {
    method: 'POST',
    body: { fournisseur_id: fournisseurId, montant, date_paiement: date, reference, notes }
  });

  if (res.ok) {
    showToast('Paiement enregistré avec succès.');
    closeModal('modalNouveauPaiement');
    // Recharger le detail avec le nom depuis le DOM
    const fName = document.getElementById('modalPaymentFournisseurName').textContent;
    openPaiementDetail(fournisseurId, fName);
    loadPaiements();
  } else {
    const data = await res.json();
    showToast(data.error || 'Erreur lors de l\'enregistrement.', 'error');
  }
});

/* ════════════════════════════════════════════════════════════
   CLIENTS (ont commandé au moins une fois)
   ════════════════════════════════════════════════════════════ */
let clientsData = [];
async function loadClients() {
  const res = await apiFetch('/api/admin/clients-actifs');
  clientsData = await res.json();
  renderClients(clientsData);

  const input = document.getElementById('clientSearch');
  input.value = '';
  input.oninput = function () {
    const q = this.value.trim().toLowerCase();
    renderClients(q
      ? clientsData.filter(c =>
          `${c.prenom} ${c.nom} ${c.email}`.toLowerCase().includes(q)
        )
      : clientsData
    );
  };
}
function renderClients(data) {
  const tbody = document.getElementById('clientsTbody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Aucun client trouvé</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(c => `
    <tr>
      <td>
        <strong>${escHtml(c.prenom)} ${escHtml(c.nom)}</strong>
        ${c.a_un_compte
          ? '<span class="badge badge--blue" style="margin-left:6px;font-size:.65rem">Compte</span>'
          : '<span style="margin-left:6px;font-size:.72rem;color:var(--text-muted)">Invité</span>'}
      </td>
      <td>${escHtml(c.email)}</td>
      <td>${c.telephone ? escHtml(c.telephone) : '<span class="text-muted">—</span>'}</td>
      <td><span class="badge badge--blue">${c.nb_commandes}</span></td>
      <td>${c.total_depense ? fmtNum(c.total_depense) + ' FCFA' : '—'}</td>
      <td>${fmtDate(c.derniere_commande)}</td>
      <td>${c.compte_cree_le ? fmtDate(c.compte_cree_le) : '<span class="text-muted">—</span>'}</td>
    </tr>`).join('');
}

/* ════════════════════════════════════════════════════════════
   UTILISATEURS (tous les comptes inscrits)
   ════════════════════════════════════════════════════════════ */
let utilisateursData = [];
async function loadUtilisateurs() {
  const res = await apiFetch('/api/admin/utilisateurs');
  utilisateursData = await res.json();
  renderUtilisateurs(utilisateursData);

  const input = document.getElementById('userSearch');
  input.value = '';
  input.oninput = function () {
    const q = this.value.trim().toLowerCase();
    renderUtilisateurs(q
      ? utilisateursData.filter(u =>
          `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(q)
        )
      : utilisateursData
    );
  };
}
function renderUtilisateurs(data) {
  const tbody = document.getElementById('utilisateursTbody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Aucun utilisateur trouvé</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(u => `
    <tr>
      <td><strong>${escHtml(u.prenom)} ${escHtml(u.nom)}</strong></td>
      <td>${escHtml(u.email)}</td>
      <td>${u.telephone ? escHtml(u.telephone) : '<span class="text-muted">—</span>'}</td>
      <td>${u.nb_commandes > 0
        ? `<span class="badge badge--blue">${u.nb_commandes}</span>`
        : '<span class="text-muted">0</span>'}</td>
      <td>${fmtDate(u.created_at)}</td>
    </tr>`).join('');
}

async function loadFournisseurs() {
  const res  = await apiFetch('/api/admin/fournisseurs');
  if (!res.ok) return;
  const data = await res.json();

  const tbody = document.getElementById('fournisseursTbody');
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Aucun fournisseur.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(f => `
    <tr>
      <td><strong>${escHtml(f.nom)}</strong></td>
      <td>${escHtml(f.adresse || '—')}</td>
      <td>${escHtml(f.telephone || '—')}</td>
      <td>${escHtml(f.email || '—')}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-icon" title="Modifier" onclick='openEditFournisseur(${JSON.stringify(f)})'>
            <i class="fas fa-pen"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

document.getElementById('btnAddFournisseur').addEventListener('click', () => {
  editingFournisseurId = null;
  document.getElementById('modalFournTitle').textContent = 'Nouveau fournisseur';
  document.getElementById('fournisseurForm').reset();
  document.getElementById('fournisseurId').value = '';
  openModal('modalFournisseur');
});

function openEditFournisseur(f) {
  editingFournisseurId = f.id;
  document.getElementById('modalFournTitle').textContent = 'Modifier le fournisseur';
  document.getElementById('fournisseurId').value = f.id;
  document.getElementById('fournNom').value      = f.nom        || '';
  document.getElementById('fournDesc').value     = f.description|| '';
  document.getElementById('fournAdresse').value  = f.adresse    || '';
  document.getElementById('fournTel').value      = f.telephone  || '';
  document.getElementById('fournEmail').value    = f.email      || '';
  document.getElementById('fournSite').value     = f.site_web   || '';
  openModal('modalFournisseur');
}

document.getElementById('btnSaveFournisseur').addEventListener('click', async () => {
  const payload = {
    nom:         document.getElementById('fournNom').value.trim(),
    description: document.getElementById('fournDesc').value.trim(),
    adresse:     document.getElementById('fournAdresse').value.trim(),
    telephone:   document.getElementById('fournTel').value.trim(),
    email:       document.getElementById('fournEmail').value.trim(),
    site_web:    document.getElementById('fournSite').value.trim(),
  };
  if (!payload.nom) { showToast('Le nom est obligatoire.', 'error'); return; }

  const url    = editingFournisseurId ? `/api/admin/fournisseurs/${editingFournisseurId}` : '/api/admin/fournisseurs';
  const method = editingFournisseurId ? 'PUT' : 'POST';
  const res    = await apiFetch(url, { method, body: payload });
  const data   = await res.json();

  if (res.ok) {
    showToast(editingFournisseurId ? 'Fournisseur mis à jour.' : 'Fournisseur créé.');
    closeModal('modalFournisseur');
    loadFournisseurs();
  } else {
    showToast(data.error || 'Erreur lors de l\'enregistrement.', 'error');
  }
});

/* ─── Pagination helper ─────────────────────────────────── */
function renderPagination(containerId, current, total, onPage) {
  const container = document.getElementById(containerId);
  if (total <= 1) { container.innerHTML = ''; return; }
  let html = '';
  html += `<button class="page-btn" ${current===1?'disabled':''} onclick="(${onPage.toString()})(${current-1})">
    <i class="fas fa-chevron-left"></i>
  </button>`;
  for (let i = 1; i <= total; i++) {
    html += `<button class="page-btn ${i===current?'active':''}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" ${current===total?'disabled':''} onclick="(${onPage.toString()})(${current+1})">
    <i class="fas fa-chevron-right"></i>
  </button>`;
  container.innerHTML = html;
}

/* ─── Modal helpers ─────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function (e) {
    if (e.target === this) closeModal(this.id);
  });
});

/* ─── XSS Protection ────────────────────────────────────── */
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ─── Init ─────────────────────────────────────────────── */
loadDashboard();
