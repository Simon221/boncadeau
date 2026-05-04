/* ══════════════════════════════════════════════════════════
   BONCADEAU – Script Principal
   ══════════════════════════════════════════════════════════ */

'use strict';

/* ─── État courant de la commande ─────────────────────────── */
let currentOrder = {};

/* ════════════════════════════════════════════════════════════
   NAVIGATION FLUIDE
   ════════════════════════════════════════════════════════════ */

function scrollToCatalogue() {
  document.getElementById('catalogue').scrollIntoView({ behavior: 'smooth' });
}

/* ════════════════════════════════════════════════════════════
   NAVIGATION VERS LA PAGE DÉTAIL
   ════════════════════════════════════════════════════════════ */

function goToDetail(card) {
  const slug = card.dataset.slug;
  if (!slug) return;
  window.location.href = 'pages/detail.html?slug=' + encodeURIComponent(slug);
}

/* ════════════════════════════════════════════════════════════
   FILTRE DES CATÉGORIES
   ════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async function () {
  await loadBonsFromAPI();
  initFiltersAndPagination();
  initStatsCounter();
  initCharCounter();
  initHeaderScroll();
  initReveal();
});

/* ════════════════════════════════════════════════════════════
   SCROLL REVEAL
   ════════════════════════════════════════════════════════════ */
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal, .section-title').forEach(el => {
    observer.observe(el);
  });
}

/* ════════════════════════════════════════════════════════════
   API – CHARGEMENT DYNAMIQUE DES BONS
   ════════════════════════════════════════════════════════════ */

const API_BASE = 'http://localhost:3001';

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCardHTML(b) {
  const bg         = b.image_url ? '#f0f0f0' : (b.couleur_fond || 'linear-gradient(135deg, #e8d5c4, #c9b8a8)');
  const imgContent = b.image_url
    ? `<img src="${escHtml(b.image_url)}" alt="${escHtml(b.titre)}" class="gift-card__photo" />`
    : `<i class="fas ${escHtml(b.icone || 'fa-gift')}"></i>`;
  const badge      = b.badge ? `<div class="gift-card__badge">${escHtml(b.badge)}</div>` : '';
  const priceStr   = Number(b.prix).toLocaleString('fr-FR') + ' FCFA';

  return `
    <div class="gift-card" data-cat="${escHtml(b.categorie_slug)}" data-slug="${escHtml(b.slug)}" onclick="goToDetail(this)">
      ${badge}
      <div class="gift-card__img" style="background:${bg}">
        ${imgContent}
      </div>
      <div class="gift-card__body">
        <span class="gift-card__cat"><i class="fas ${escHtml(b.categorie_icone || 'fa-gift')}"></i> ${escHtml(b.categorie_nom)}</span>
        <div class="gift-card__providers"><span class="provider-tag"><i class="fas fa-store"></i> ${escHtml(b.fournisseur_nom)}</span></div>
        <h3>${escHtml(b.titre)}</h3>
        <p>${escHtml(b.description_courte)}</p>
        <div class="gift-card__footer">
          <span class="gift-card__price">${Number(b.prix).toLocaleString('fr-FR')} <small>FCFA</small></span>
          <button class="btn btn--gold btn--sm" onclick="event.stopPropagation(); openOrder(this)"
            data-title="${escHtml(b.titre)}"
            data-price="${escHtml(priceStr)}"
            data-cat="${escHtml(b.categorie_nom)}"
            data-icon="${escHtml(b.icone || 'fa-gift')}"
            data-provider="${escHtml(b.fournisseur_nom)}"
            data-slug="${escHtml(b.slug)}">
            <i class="fas fa-shopping-bag"></i> Commander
          </button>
        </div>
      </div>
    </div>`;
}

async function loadBonsFromAPI() {
  const grid = document.getElementById('cardsGrid');
  try {
    const res  = await fetch(API_BASE + '/api/bons?limit=100');
    if (!res.ok) throw new Error('Erreur ' + res.status);
    const { data } = await res.json();
    if (!data || !data.length) {
      grid.innerHTML = '<p class="catalogue-empty"><i class="fas fa-box-open"></i> Aucun bon disponible pour le moment.</p>';
      return;
    }
    grid.innerHTML = data.map(renderCardHTML).join('');
  } catch (err) {
    console.error('Catalogue API error:', err);
    grid.innerHTML = '<p class="catalogue-empty"><i class="fas fa-exclamation-triangle"></i> Impossible de charger le catalogue.</p>';
  }
}

/* ════════════════════════════════════════════════════════════
   FILTRES + PAGINATION
   ════════════════════════════════════════════════════════════ */

const CARDS_PER_PAGE = 6;
let currentPage     = 1;
let activeCat       = 'all';
let searchQuery     = '';

function initFiltersAndPagination() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      activeCat   = this.dataset.cat;
      currentPage = 1;
      renderPage();
    });
  });

  /* Recherche */
  const searchInput = document.getElementById('catalogueSearch');
  const clearBtn    = document.getElementById('searchClear');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchQuery = this.value.trim().toLowerCase();
      clearBtn.style.display = searchQuery ? 'block' : 'none';
      currentPage = 1;
      renderPage();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value  = '';
      searchQuery        = '';
      clearBtn.style.display = 'none';
      currentPage = 1;
      renderPage();
      searchInput.focus();
    });
  }

  renderPage();
}

/* ─── Filtrer les cartes selon la catégorie active et la recherche ─ */
function getVisibleCards() {
  const all = Array.from(document.querySelectorAll('.gift-card'));
  return all.filter(c => {
    const catOk    = activeCat === 'all' || c.dataset.cat === activeCat;
    const searchOk = !searchQuery || c.textContent.toLowerCase().includes(searchQuery);
    return catOk && searchOk;
  });
}

/* ─── Afficher la page courante ──────────────────────────── */
function renderPage() {
  const all       = Array.from(document.querySelectorAll('.gift-card'));
  const visible   = getVisibleCards();
  const totalCards = visible.length;
  const totalPages = Math.max(1, Math.ceil(totalCards / CARDS_PER_PAGE));

  // Clamp la page courante
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * CARDS_PER_PAGE;
  const end   = start + CARDS_PER_PAGE;

  // Masquer/afficher les cartes
  all.forEach(card => card.classList.add('hidden'));
  visible.forEach((card, i) => {
    if (i >= start && i < end) {
      card.classList.remove('hidden');
      // Relancer l'animation d'entrée
      card.style.animation = 'none';
      card.offsetHeight;
      card.style.animation = '';
      card.style.animationDelay = `${(i - start) * 0.07}s`;
    }
  });

  // Mettre à jour les boutons prev/next
  document.getElementById('pagePrev').disabled = currentPage === 1;
  document.getElementById('pageNext').disabled = currentPage === totalPages;

  // Construire les numéros de page
  renderPageNumbers(totalPages);

  // Info texte
  const infoEl = document.getElementById('paginationInfo');
  const from   = totalCards === 0 ? 0 : start + 1;
  const to     = Math.min(end, totalCards);
  infoEl.textContent = totalCards > 0
    ? `Affichage ${from}–${to} sur ${totalCards} bon${totalCards > 1 ? 's' : ''}`
    : 'Aucun bon dans cette catégorie.';

  // Afficher/masquer la pagination si 1 seule page
  document.getElementById('pagination').style.display = totalPages <= 1 ? 'none' : 'flex';
  infoEl.style.display = totalCards === 0 ? 'none' : 'block';
}

/* ─── Rendu des numéros de page avec ellipses ────────────── */
function renderPageNumbers(totalPages) {
  const container = document.getElementById('pageNumbers');
  container.innerHTML = '';

  const pages = getPageRange(currentPage, totalPages);

  pages.forEach(p => {
    if (p === '…') {
      const span = document.createElement('span');
      span.className = 'page-num ellipsis';
      span.textContent = '…';
      container.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'page-num' + (p === currentPage ? ' active' : '');
      btn.textContent = p;
      btn.setAttribute('aria-label', `Page ${p}`);
      if (p === currentPage) btn.setAttribute('aria-current', 'page');
      btn.addEventListener('click', () => goToPage(p));
      container.appendChild(btn);
    }
  });
}

/* ─── Calcul de la plage de pages (avec ellipses) ─────────── */
function getPageRange(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = [];
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '…', total);
  } else if (current >= total - 3) {
    pages.push(1, '…', total - 4, total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '…', current - 1, current, current + 1, '…', total);
  }
  return pages;
}

/* ─── Changer de page (prev / next) ──────────────────────── */
function changePage(delta) {
  const visible    = getVisibleCards();
  const totalPages = Math.max(1, Math.ceil(visible.length / CARDS_PER_PAGE));
  const next = currentPage + delta;
  if (next < 1 || next > totalPages) return;
  currentPage = next;
  renderPage();
  document.getElementById('catalogue').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ─── Aller directement à une page ──────────────────────── */
function goToPage(p) {
  if (p === currentPage) return;
  currentPage = p;
  renderPage();
  document.getElementById('catalogue').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ════════════════════════════════════════════════════════════
   COMPTEUR D'ANIMATION (STATS)
   ════════════════════════════════════════════════════════════ */

function initStatsCounter() {
  const statNums = document.querySelectorAll('.stat-num');
  let started = false;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !started) {
        started = true;
        statNums.forEach(el => animateCount(el, parseInt(el.dataset.target, 10)));
      }
    });
  }, { threshold: 0.4 });

  const statsSection = document.querySelector('.stats');
  if (statsSection) observer.observe(statsSection);
}

function animateCount(el, target) {
  const duration = 1600;
  const step = 16;
  const increment = target / (duration / step);
  let current = 0;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = Math.floor(current).toLocaleString('fr-FR');
  }, step);
}

/* ════════════════════════════════════════════════════════════
   HEADER – EFFET DE SCROLL
   ════════════════════════════════════════════════════════════ */

function initHeaderScroll() {
  const header = document.querySelector('.header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.style.boxShadow = '0 4px 32px rgba(0,0,0,0.12)';
    } else {
      header.style.boxShadow = '0 2px 24px rgba(0,0,0,0.06)';
    }
  }, { passive: true });
}

/* ════════════════════════════════════════════════════════════
   COMPTEUR DE CARACTÈRES (TEXTAREA)
   ════════════════════════════════════════════════════════════ */

function initCharCounter() {
  const textarea = document.getElementById('message');
  const counter  = document.getElementById('charCount');
  if (!textarea || !counter) return;

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    counter.textContent = `${len} / 300`;
    counter.style.color = len >= 270 ? '#e53935' : 'var(--text-light)';
  });
}

/* ════════════════════════════════════════════════════════════
   MODAL – OUVERTURE / FERMETURE
   ════════════════════════════════════════════════════════════ */

function openOrder(button) {
  const title    = button.dataset.title;
  const price    = button.dataset.price;
  const cat      = button.dataset.cat;
  const icon     = button.dataset.icon;
  const provider = button.dataset.provider || '';

  // Mémoriser la commande en cours
  currentOrder = { title, price, cat, icon, provider };

  // Remplir le résumé de la modal
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalPrice').textContent = price;
  document.getElementById('modalCat').textContent   = cat;
  document.getElementById('modalIcon').innerHTML    = `<i class="fas ${icon}"></i>`;

  const providerEl = document.getElementById('modalProvider');
  if (provider) {
    providerEl.innerHTML = `<i class="fas fa-store"></i> ${provider}`;
    providerEl.style.display = 'flex';
  } else {
    providerEl.style.display = 'none';
  }

  // Réinitialiser le formulaire
  resetForm();

  // Ouvrir la modal
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Focus sur le premier champ
  setTimeout(() => {
    document.getElementById('prenomAcheteur').focus();
  }, 350);
}

function closeOrder() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

function closeOrderIfOutside(event) {
  if (event.target === document.getElementById('modalOverlay')) {
    closeOrder();
  }
}

function closeSuccess() {
  document.getElementById('successOverlay').classList.remove('active');
  document.body.style.overflow = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── Fermeture par Échap ────────────────────────────────── */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeOrder();
    closeSuccess();
  }
});

/* ════════════════════════════════════════════════════════════
   FORMULAIRE – VALIDATION & SOUMISSION
   ════════════════════════════════════════════════════════════ */

function validateField(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(`err-${id}`);

  if (!input) return true;

  const value = input.type === 'checkbox' ? input.checked : input.value.trim();

  if (!value) {
    input.classList.add('error');
    if (error) error.textContent = message;
    return false;
  }

  if (input.type === 'email' && !isValidEmail(input.value.trim())) {
    input.classList.add('error');
    if (error) error.textContent = 'Veuillez entrer une adresse email valide.';
    return false;
  }

  if (input.type === 'tel' && !isValidPhone(input.value.trim())) {
    input.classList.add('error');
    if (error) error.textContent = 'Numéro de téléphone invalide.';
    return false;
  }

  input.classList.remove('error');
  if (error) error.textContent = '';
  return true;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^[+\d\s\-().]{7,20}$/.test(phone);
}

function resetForm() {
  const form = document.getElementById('orderForm');
  if (form) form.reset();

  // Vider les messages d'erreur
  document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  const counter = document.getElementById('charCount');
  if (counter) counter.textContent = '0 / 300';
}

/* ─── Soumission ─────────────────────────────────────────── */
function submitOrder(event) {
  event.preventDefault();

  // Validation des champs obligatoires
  const isValid = [
    validateField('prenomAcheteur', 'Le prénom est requis.'),
    validateField('nomAcheteur',    'Le nom est requis.'),
    validateField('emailAcheteur',  "L'email est requis."),
    validateField('telAcheteur',    'Le téléphone est requis.'),
    validateField('cgv',            "Vous devez accepter les conditions générales."),
  ].every(Boolean);

  if (!isValid) {
    // Scroller vers le premier champ en erreur
    const firstError = document.querySelector('.form-group input.error, .form-group textarea.error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Simuler un traitement (spinner)
  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement en cours…';

  setTimeout(() => {
    // Récupérer les valeurs
    const prenom = document.getElementById('prenomAcheteur').value.trim();
    const nom    = document.getElementById('nomAcheteur').value.trim();
    const email  = document.getElementById('emailAcheteur').value.trim();
    const tel    = document.getElementById('telAcheteur').value.trim();
    const prenomDest = document.getElementById('prenomDest').value.trim();
    const nomDest    = document.getElementById('nomDest').value.trim();
    const emailDest  = document.getElementById('emailDest').value.trim();
    const msg        = document.getElementById('message').value.trim();

    // Générer un numéro de bon unique
    const bonRef = generateRef();

    // Remplir la section succès
    let details = `
      <p><strong>Référence :</strong> ${bonRef}</p>
      <p><strong>Bon choisi :</strong> ${currentOrder.title}</p>
      ${currentOrder.provider ? `<p><strong>Fournisseur :</strong> ${currentOrder.provider}</p>` : ''}
      <p><strong>Montant :</strong> ${currentOrder.price}</p>
      <p><strong>Acheteur :</strong> ${prenom} ${nom}</p>
      <p><strong>Email de confirmation :</strong> ${email}</p>
    `;
    if (prenomDest || nomDest) {
      details += `<p><strong>Destinataire :</strong> ${prenomDest} ${nomDest}</p>`;
    }
    if (emailDest) {
      details += `<p><strong>Email destinataire :</strong> ${emailDest}</p>`;
    }
    if (msg) {
      details += `<p><strong>Message :</strong> "${msg}"</p>`;
    }

    document.getElementById('successDetails').innerHTML = details;
    document.getElementById('successMsg').textContent =
      `Votre bon cadeau "${currentOrder.title}" a été enregistré avec succès sous la référence ${bonRef}. Une confirmation vous sera envoyée à l'adresse ${email}.`;

    // Fermer la modal commande et ouvrir le succès
    closeOrder();
    setTimeout(() => {
      const successOverlay = document.getElementById('successOverlay');
      successOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }, 300);

    // Remettre le bouton en état initial
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-lock"></i> Confirmer ma commande';

  }, 1800);
}

/* ─── Génération de référence ────────────────────────────── */
function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BC-';
  for (let i = 0; i < 8; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
    if (i === 3) ref += '-';
  }
  return ref;
}

/* ─── Effacement des erreurs à la saisie ─────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.form-group input, .form-group textarea').forEach(input => {
    input.addEventListener('input', function () {
      this.classList.remove('error');
      const errEl = document.getElementById(`err-${this.id}`);
      if (errEl) errEl.textContent = '';
    });
  });
});
