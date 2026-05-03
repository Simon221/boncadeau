/* ══════════════════════════════════════════════════════════
   BONCADEAU – Logique commande (partagée index & détail)
   ══════════════════════════════════════════════════════════ */

'use strict';

let currentOrder = {};

/* ─── Ouvrir la modale de commande ─────────────────────── */
function openOrder(button) {
  // Récupère le slug depuis le bouton lui-même ou la carte parente
  const parentCard = button.closest('[data-slug]');
  const bonSlug    = button.dataset.slug || (parentCard ? parentCard.dataset.slug : '') || '';

  currentOrder = {
    title   : button.dataset.title    || '',
    price   : button.dataset.price    || '',
    cat     : button.dataset.cat      || '',
    icon    : button.dataset.icon     || 'fa-gift',
    provider: button.dataset.provider || '',
    slug    : bonSlug,
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
  const group = input.closest('.form-group');
  if (!group) return true;
  let valid = true;

  if (input.type === 'checkbox') {
    valid = input.required ? input.checked : true;
  } else {
    const value = input.value.trim();
    if (input.required && !value) {
      valid = false;
    } else if (input.type === 'email' && value) {
      valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    } else if (input.type === 'tel' && value) {
      valid = /^[+\d\s()-]{7,20}$/.test(value);
    }
    group.classList.toggle('success', valid && !!value);
  }

  group.classList.toggle('error', !valid);
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

  const prenom    = payload.prenom    || payload._prenom    || '';
  const nom       = payload.nom       || payload._nom       || '';
  const email     = payload.email     || payload._email     || '';
  const bonTitle  = payload.bon_title || payload._bon_title || '';
  const reference = payload.reference || '';

  if (refEl)  refEl.textContent  = reference;
  if (nameEl) nameEl.textContent = prenom + ' ' + nom;
  if (msgEl)  msgEl.textContent  = `Merci ${prenom} ! Votre bon "${bonTitle}" a été réservé avec succès.`;
  if (detEl)  detEl.innerHTML    = `<strong>Référence :</strong> ${reference}<br><strong>Confirmation envoyée à :</strong> ${email}`;

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
function showFormError(form, msg) {
  let errEl = form.querySelector('.form-submit-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'form-submit-error';
    errEl.style.cssText = 'color:#c0392b;background:#fdf3f3;border:1px solid #e8b8b8;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:.9rem;line-height:1.4;';
    form.querySelector('[type="submit"]').insertAdjacentElement('beforebegin', errEl);
  }
  errEl.textContent = '⚠ ' + msg;
  errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearFormError(form) {
  const errEl = form.querySelector('.form-submit-error');
  if (errEl) errEl.remove();
}

/* ─── Soumission commande ────────────────────────────────── */
async function submitOrder(event) {
  event.preventDefault();

  const form = document.getElementById('orderForm');
  clearFormError(form);

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

  const prenom = val('prenomAcheteur') || val('orderPrenom');
  const nom    = val('nomAcheteur')    || val('orderNom');
  const email  = val('emailAcheteur')  || val('orderEmail');

  // Payload avec les noms de champs attendus par l'API
  const payload = {
    bon_slug        : currentOrder.slug,
    prenom_acheteur : prenom,
    nom_acheteur    : nom,
    email_acheteur  : email,
    tel_acheteur    : val('telAcheteur') || val('orderTel'),
    prenom_dest     : val('prenomDest') || val('orderDestinataire') || null,
    nom_dest        : val('nomDest')    || null,
    email_dest      : val('emailDest')  || null,
    message         : val('message')    || val('orderMessage') || null,
    // Données locales pour la modale de succès (non envoyées à l'API)
    _prenom         : prenom,
    _nom            : nom,
    _email          : email,
    _bon_title      : currentOrder.title,
  };

  try {
    const res = await fetch('http://localhost:3001/api/commandes', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erreur lors de l\'enregistrement de la commande.');
    }

    // Succès réel : on affiche la référence retournée par le serveur
    showSuccessModal({
      reference : data.reference,
      prenom    : prenom,
      nom       : nom,
      email     : email,
      bon_title : currentOrder.title,
    });
  } catch (err) {
    console.error('Erreur commande:', err);
    const form = document.getElementById('orderForm');
    showFormError(form,
      err.message.includes('Failed to fetch')
        ? 'Impossible de joindre le serveur. Vérifiez votre connexion ou réessayez dans quelques secondes.'
        : err.message || 'Impossible de traiter votre commande. Veuillez réessayer.'
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}
