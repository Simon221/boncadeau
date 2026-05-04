/* ═══════════════════════════════════════════════════════════
   BONCADEAU – Espace Client JavaScript
   ═══════════════════════════════════════════════════════════ */
'use strict';

const API = '';
let ordersData = [];
let currentVoucherData = null; // conserve la commande en cours d'affichage dans le voucher

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
  { key: 'utilise',    label: 'Utilisé',    icon: 'fa-check-double' },
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
  let currentIdx = STEPS.findIndex(s => s.key === statut);
  // Fallback si le statut n'existe pas dans STEPS
  if (currentIdx === -1) {
    currentIdx = 0; // affiche au moins la première étape
    console.warn(`Statut inconnu: "${statut}". Étapes disponibles:`, STEPS.map(s => s.key));
  }
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
  const headerContent = c.image_url
    ? `<img src="${escHtml(c.image_url)}" alt="${escHtml(c.bon_titre)}" class="order-card__photo" />`
    : `<i class="fas ${escHtml(c.icone || 'fa-gift')}"></i>`;
  const canReview = (c.statut === 'livre' || c.statut === 'utilise') && Number(c.a_avis) === 0;

  const pageUrl = window.location.origin + '/pages/commande.html?ref=' + encodeURIComponent(c.reference);

  return `
    <article class="order-card">
      <div class="order-card__header" style="background:${c.image_url ? 'none' : gradient}">
        ${headerContent}
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
        <div class="order-actions">
          ${(c.statut === 'livre' || c.statut === 'utilise') ? `
            <button class="btn-voucher" onclick="openVoucher(${c.id})">
              <i class="fas fa-ticket-alt"></i> Mon bon cadeau
            </button>
           ` : ''}
          ${canReview ? `
            <button class="btn-review" data-bon-title="${escHtml(c.bon_titre)}" onclick="openAvis(${c.id}, this.getAttribute('data-bon-title'))">
              <i class="fas fa-star"></i> Écrire un avis
            </button>` : ''}
          ${Number(c.a_avis) > 0 ? `
            <p class="avis-done"><i class="fas fa-check-circle"></i> Avis publié — merci !</p>` : ''}
          ${c.statut === 'en_attente' ? `
            <button class="btn-cancel" onclick="confirmCancel(${c.id}, '${escHtml(c.reference)}')">
              <i class="fas fa-times-circle"></i> Annuler la commande
            </button>` : ''}
        </div>
      </div>
    </article>`;
}

/* ─── Annulation commande ───────────────────────────────────────── */
function confirmCancel(commandeId, reference) {
  document.getElementById('cancelRef').textContent = reference;
  document.getElementById('cancelOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  document.getElementById('btnCancelConfirm').onclick = () => cancelOrder(commandeId);
}

function closeCancelModal() {
  document.getElementById('cancelOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

async function cancelOrder(commandeId) {
  const btn  = document.getElementById('btnCancelConfirm');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    const res = await fetch(API + '/api/clients/commandes/' + commandeId + '/annuler', {
      method : 'PATCH',
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l’annulation.');
    closeCancelModal();
    await loadOrders();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
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
    ordersData = data;
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
/* ─── Bon cadeau — Voucher modal ──────────────────────────────────────── */
function openVoucher(id) {
  const c = ordersData.find(o => o.id === id);
  if (!c) return;
  currentVoucherData = c; // mémorisé pour shareVoucherWhatsApp

  // Date de validité : date d'achat + 1 an
  const exp = new Date(c.created_at);
  exp.setFullYear(exp.getFullYear() + 1);
  const validStr = `Valable jusqu'au ${exp.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;

  document.getElementById('v-categorie').textContent = (c.categorie || c.bon_titre).toUpperCase();
  document.getElementById('v-amount').textContent    = fmtNum(c.prix) + ' ' + c.devise;
  document.getElementById('v-order').textContent     = c.reference;
  document.getElementById('v-validity').textContent  = validStr;
  document.getElementById('v-sname').textContent     = c.fournisseur;

  const parts = [c.fournisseur_adresse, c.fournisseur_telephone, c.fournisseur_email].filter(Boolean);
  document.getElementById('v-sinfo').innerHTML = parts.map(escHtml).join('<br>') || '';

  const dest = c.prenom_dest ? (c.prenom_dest + (c.nom_dest ? ' ' + c.nom_dest : '')) : null;
  document.getElementById('v-message').textContent =
    dest ? ('\u00ab Offert \u00e0 ' + dest + ' \u00bb') : (c.message ? ('\u00ab ' + c.message + ' \u00bb') : '\u00ab Offrez un moment d\u2019exception \u00bb');

  // QR Code
  const qrContainer = document.getElementById('voucherQR');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: window.location.origin + '/pages/commande.html?ref=' + encodeURIComponent(c.reference),
    width: 80, height: 80,
    colorDark: '#8B6914', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  document.getElementById('voucherOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeVoucher() {
  document.getElementById('voucherOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

async function downloadVoucher() {
  const card = document.getElementById('voucherCard');
  const ref  = document.getElementById('v-order').textContent;
  const btn  = document.getElementById('btnVoucherDl');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    const canvas = await html2canvas(card, { scale: 2, backgroundColor: '#FDFAF3', useCORS: true });
    const link   = document.createElement('a');
    link.download = 'boncadeau-' + ref + '.png';
    link.href     = canvas.toDataURL('image/png');
    link.click();
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function shareVoucherWhatsApp() {
  const card = document.getElementById('voucherCard');
  const ref  = document.getElementById('v-order').textContent;
  const btn  = document.getElementById('btnVoucherWa');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    const canvas = await html2canvas(card, { scale: 2, backgroundColor: '#FDFAF3', useCORS: true });
    canvas.toBlob(async blob => {
      // Web Share API (mobile)
      if (blob && navigator.canShare) {
        const file = new File([blob], 'boncadeau-' + ref + '.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'Mon bon cadeau', text: 'BonCadeau.sn — Réf : ' + ref });
            return;
          } catch {}
        }
      }
      // Fallback : lien WhatsApp avec texte
      const pageUrl = window.location.origin + '/pages/commande.html?ref=' + encodeURIComponent(ref);
      const c        = currentVoucherData;
      const offreur  = (prenom + (nom ? ' ' + nom : '')).trim() || 'Quelqu\'un';
      const destName = c && c.prenom_dest ? (c.prenom_dest + (c.nom_dest ? ' ' + c.nom_dest : '')) : null;
      const bonInfo  = c ? (c.bon_titre + ' — ' + fmtNum(c.prix) + '\u202f' + c.devise + ' chez ' + c.fournisseur) : '';
      const msg = [
        '🎁 *' + offreur + ' t\'offre un bon cadeau !*',
        '',
        destName ? ('🎀 Pour toi, ' + destName + ' !') : '🎀 Ce bon est fait pour toi !',
        '',
        '✨ ' + bonInfo,
        '',
        c && c.message ? ('_« ' + c.message + ' »_') : '',
        '',
        '👉 Voir et télécharger ton bon cadeau :',
        pageUrl,
        '',
        '_BonCadeauSN.com — L\'art d\'offrir_',
      ].filter(l => l !== undefined).join('\n');
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(msg), '_blank');
    });
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}
/* ─── Init ──────────────────────────────────────────────── */
loadOrders();
