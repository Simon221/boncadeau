/* ══════════════════════════════════════════════════════════
   BONCADEAU – Logique commande (partagée index & détail)
   ══════════════════════════════════════════════════════════ */

'use strict';

let currentOrder = {};

/* ─── Ouvrir la modale de commande ─────────────────────── */
function openOrder(button) {
  currentOrder = {
    title   : button.dataset.title    || '',
    price   : button.dataset.price    || '',
    cat     : button.dataset.cat      || '',
    icon    : button.dataset.icon     || 'fa-gift',
    provider: button.dataset.provider || ''
  };

  const titleEl    = document.getElementById('modalTitle');
  const priceEl    = document.getElementById('modalPrice');
  const catEl      = document.getElementById('modalCat');
  const iconEl     = document.getElementById('modalIcon');
  const providerEl = document.getElementById('modalProvider');

  if (titleEl)    titleEl.textContent    = currentOrder.title;
  if (priceEl)    priceEl.textContent    = currentOrder.price;
  if (catEl)      catEl.textContent      = currentOrder.cat;
  if (iconEl)     iconEl.innerHTML       = `<i class="fas ${currentOrder.icon}"></i>`;
  if (providerEl) {
    if (currentOrder.provider) {
      providerEl.innerHTML     = `<i class="fas fa-store"></i> ${currentOrder.provider}`;
      providerEl.style.display = 'flex';
    } else {
      providerEl.style.display = 'none';
    }
  }

  /* Ouvrir l'overlay (id="modalOverlay") */
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  /* Réinitialiser le formulaire */
  const form = document.getElementById('orderForm');
  if (form) {
    form.reset();
    form.querySelectorAll('.form-group').forEach(g => g.classList.remove('error', 'success'));
  }
  const charCounter = document.getElementById('charCount');
  if (charCounter) charCounter.textContent = '0';
}

/* ─── Fermer la modale de commande ─────────────────────── */
function closeOrder() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function closeOrderIfOutside(event) {
  if (event.target && event.target.id === 'modalOverlay') closeOrder();
}

/* ─── Fermer modale succès ──────────────────────────────── */
function closeSuccess() {
  const overlay = document.getElementById('successOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/* ─── Validation d'un champ ─────────────────────────────── */
function validateField(input) {
  const group = input.closest('.form__group');
  if (!group) return true;
  const value = input.value.trim();
  let valid = true;

  if (input.required && !value) {
    valid = false;
  } else if (input.type === 'email' && value) {
    valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  } else if (input.type === 'tel' && value) {
    valid = /^[+\d\s()-]{7,20}$/.test(value);
  }

  group.classList.toggle('error',   !valid);
  group.classList.toggle('success',  valid && !!value);
  return valid;
}

/* ─── Afficher la modale succès ─────────────────────────── */
function showSuccessModal(payload) {
  closeOrder();

  /* Compatibilité index.html (successRef, successName) et detail.html (successMsg, successDetails) */
  const refEl  = document.getElementById('successRef');
  const nameEl = document.getElementById('successName');
  const msgEl  = document.getElementById('successMsg');
  const detEl  = document.getElementById('successDetails');

  if (refEl)  refEl.textContent  = payload.reference;
  if (nameEl) nameEl.textContent = payload.prenom + ' ' + payload.nom;
  if (msgEl)  msgEl.textContent  = `Merci ${payload.prenom} ! Votre bon "${payload.bon_title}" a été réservé avec succès.`;
  if (detEl)  detEl.innerHTML    = `<strong>Référence :</strong> ${payload.reference}<br><strong>Confirmation envoyée à :</strong> ${payload.email}`;

  /* Ouvrir le bon overlay (successOverlay ou successModal selon la page) */
  const overlay = document.getElementById('successOverlay') || document.getElementById('successModal');
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

/* ─── Génération de référence ───────────────────────────── */
function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BC-';
  for (let i = 0; i < 8; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

/* ─── Soumission commande ────────────────────────────────── */
async function submitOrder(event) {
  event.preventDefault();

  const form = document.getElementById('orderForm');
  const inputs = form.querySelectorAll('input[required], textarea[required]');
  let allValid = true;
  inputs.forEach(input => { if (!validateField(input)) allValid = false; });
  if (!allValid) return;

  const submitBtn = form.querySelector('[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement...';

  /* Lecture flexible des champs : supporte les deux pages (index + detail) */
  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  const payload = {
    bon_title   : currentOrder.title,
    bon_provider: currentOrder.provider,
    prenom      : val('prenomAcheteur') || val('orderPrenom'),
    nom         : val('nomAcheteur')    || val('orderNom'),
    email       : val('emailAcheteur')  || val('orderEmail'),
    telephone   : val('telAcheteur')    || val('orderTel'),
    destinataire: val('prenomDest')     || val('orderDestinataire'),
    message     : val('message')        || val('orderMessage'),
    reference   : generateRef()
  };

  try {
    const res = await fetch('http://localhost:3001/api/commandes', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Erreur serveur');
    showSuccessModal(payload);
  } catch (err) {
    console.error('Erreur commande:', err);
    // Fallback : afficher succès même sans serveur (demo)
    showSuccessModal(payload);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}
