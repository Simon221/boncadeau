/* ══════════════════════════════════════════════════════════
   BONCADEAU – Page Détail (chargement dynamique)
   ══════════════════════════════════════════════════════════ */

'use strict';

const API_BASE = '/api';

/* ─── Utilitaires ────────────────────────────────────────── */
function qs(selector) { return document.querySelector(selector); }

function starsHtml(note) {
  const full  = Math.floor(note);
  const half  = note - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '<i class="fas fa-star"></i>'.repeat(full)
       + '<i class="fas fa-star-half-alt"></i>'.repeat(half)
       + '<i class="far fa-star"></i>'.repeat(empty);
}

function getSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('slug') || '';
}

/* ─── Affichage Loader / Erreur ──────────────────────────── */
function showLoader()  {
  qs('#detailLoader').style.display = 'flex';
  qs('#detailError').style.display  = 'none';
  qs('#detailMain').style.display   = 'none';
}

function showError(msg) {
  qs('#detailLoader').style.display  = 'none';
  qs('#detailMain').style.display    = 'none';
  const el = qs('#detailError');
  el.style.display = 'flex';
  const p = el.querySelector('p');
  if (p) p.textContent = msg || 'Impossible de charger les informations du bon.';
}

function showMain() {
  qs('#detailLoader').style.display = 'none';
  qs('#detailError').style.display  = 'none';
  qs('#detailMain').style.display   = 'block';
}

/* ─── Rendu du bon ───────────────────────────────────────── */
function renderBon(bon) {
  /* Titre de l'onglet */
  document.title = bon.titre + ' — BonCadeau';

  /* Fil d'Ariane */
  const breadCat   = qs('#breadCat');
  const breadTitle = qs('#breadTitle');
  if (breadCat)   breadCat.textContent   = bon.categorie_nom;
  if (breadTitle) breadTitle.textContent = bon.titre;

  /* Carte visuelle */
  const visualCard = qs('#visualCard');
  if (visualCard) {
    if (bon.image_url) {
      visualCard.style.background = 'none';
      const existing = visualCard.querySelector('img.bon-photo');
      if (!existing) {
        const img = document.createElement('img');
        img.className = 'bon-photo';
        img.src = bon.image_url;
        img.alt = bon.titre;
        visualCard.insertBefore(img, visualCard.firstChild);
      } else {
        existing.src = bon.image_url;
      }
      const icon = visualCard.querySelector('i');
      if (icon) icon.style.display = 'none';
    } else {
      visualCard.style.background = bon.couleur_fond || 'linear-gradient(135deg, #e8d5c4, #c9b8a8)';
      const icon = visualCard.querySelector('i');
      if (icon) { icon.className = 'fas ' + (bon.icone || 'fa-gift'); icon.style.display = ''; }
    }
  }

  const badge = qs('#visualBadge');
  if (badge) {
    if (bon.badge) {
      badge.textContent    = bon.badge;
      badge.style.display  = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  /* Fournisseur */
  const provEl = qs('#providerName');
  if (provEl) provEl.textContent = bon.fournisseur_nom;

  /* Catégorie */
  const catEl = qs('#detailCat');
  if (catEl) {
    catEl.innerHTML = `<i class="fas ${bon.icone || 'fa-gift'}"></i> ${bon.categorie_nom}`;
  }

  /* Titre */
  const titleEl = qs('#detailTitle');
  if (titleEl) titleEl.textContent = bon.titre;

  /* Note & avis */
  const ratingEl = qs('#detailRating');
  if (ratingEl) {
    const note = parseFloat(bon.note_moyenne) || 0;
    const count = bon.avis ? bon.avis.length : 0;
    ratingEl.innerHTML = `
      <span class="stars">${starsHtml(note)}</span>
      <span class="score">${note.toFixed(1)}</span>
      <span class="count">(${count} avis)</span>
    `;
  }

  /* Prix */
  const priceEl = qs('#detailPrice');
  if (priceEl) {
    priceEl.innerHTML = `${Number(bon.prix).toLocaleString('fr-FR')} <small>FCFA</small>`;
  }

  /* Description */
  const descEl = qs('#detailDesc');
  if (descEl) descEl.textContent = bon.description_longue || bon.description_courte;

  /* Inclusions */
  const incEl = qs('#detailIncludes');
  if (incEl && bon.inclusions && bon.inclusions.length) {
    incEl.innerHTML = bon.inclusions
      .map(item => `<li><i class="fas fa-check-circle"></i> ${item}</li>`)
      .join('');
  }

  /* Conditions */
  const condEl = qs('#detailConditions');
  if (condEl && bon.conditions && bon.conditions.length) {
    condEl.innerHTML = bon.conditions
      .map(item => `<li class="cond"><i class="fas fa-info-circle"></i> ${item}</li>`)
      .join('');
  }

  /* Bouton Commander */
  const btnOrder = qs('#btnOrder');
  if (btnOrder) {
    btnOrder.dataset.title    = bon.titre;
    btnOrder.dataset.price    = Number(bon.prix).toLocaleString('fr-FR') + ' FCFA';
    btnOrder.dataset.cat      = bon.categorie_nom;
    btnOrder.dataset.icon     = bon.icone || 'fa-gift';
    btnOrder.dataset.provider = bon.fournisseur_nom;
    btnOrder.dataset.slug     = bon.slug;
    btnOrder.addEventListener('click', () => openOrder(btnOrder));
  }
}

/* ─── Rendu des avis ─────────────────────────────────────── */
function renderAvis(avis) {
  const grid = qs('#reviewsGrid');
  if (!grid) return;

  if (!avis || avis.length === 0) {
    grid.innerHTML = '<p style="color:#888;font-style:italic;">Aucun avis pour le moment.</p>';
    return;
  }

  grid.innerHTML = avis.map(a => {
    const auteur   = a.auteur || a.prenom_client || 'Anonyme';
    const initiales = auteur.charAt(0).toUpperCase();
    const note      = parseInt(a.note) || 5;
    return `
      <div class="review-card">
        <div class="review-card__header">
          <div class="review-card__avatar">${initiales}</div>
          <div class="review-card__meta">
            <span class="review-card__name">${auteur}</span>
            <span class="review-card__date">${a.date_avis ? new Date(a.date_avis).toLocaleDateString('fr-FR', { year:'numeric', month:'long' }) : ''}</span>
          </div>
        </div>
        <div class="review-card__stars">${starsHtml(note)}</div>
        <p class="review-card__text">${a.commentaire || ''}</p>
      </div>
    `;
  }).join('');
}

/* ─── Rendu des bons similaires ──────────────────────────── */
function renderSimilaires(similaires) {
  const grid = qs('#similarGrid');
  if (!grid) return;

  if (!similaires || similaires.length === 0) {
    grid.closest('.detail-section').style.display = 'none';
    return;
  }

  grid.innerHTML = similaires.map(s => {
    const imgContent = s.image_url
      ? `<img src="${s.image_url}" alt="${s.titre}" class="gift-card__photo" />`
      : `<i class="fas ${s.icone || 'fa-gift'}"></i>`;
    return `
    <div class="gift-card" data-slug="${s.slug}" onclick="goToDetail(this)" style="cursor:pointer;">
      <div class="gift-card__img" style="background: ${s.image_url ? '#f5f5f5' : (s.couleur_fond || 'linear-gradient(135deg, #e8d5c4, #c9b8a8)')}">
        ${imgContent}
      </div>
      <div class="gift-card__body">
        <span class="gift-card__cat"><i class="fas ${s.icone || 'fa-gift'}"></i> ${s.categorie_nom || ''}</span>
        <div class="gift-card__providers">
          <span class="provider-tag"><i class="fas fa-store"></i> ${s.fournisseur_nom}</span>
        </div>
        <h3>${s.titre}</h3>
        <div class="gift-card__footer">
          <span class="gift-card__price">${Number(s.prix).toLocaleString('fr-FR')} <small>FCFA</small></span>
          <button class="btn btn--gold btn--sm"
            onclick="event.stopPropagation(); openOrder(this)"
            data-title="${s.titre}"
            data-price="${Number(s.prix).toLocaleString('fr-FR')} FCFA"
            data-cat="${s.categorie_nom || ''}"
            data-icon="${s.icone || 'fa-gift'}"
            data-provider="${s.fournisseur_nom}">
            <i class="fas fa-shopping-bag"></i> Commander
          </button>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

/* ─── Navigation vers détail (utilisée aussi pour similaires) */
function goToDetail(card) {
  const slug = card.dataset.slug;
  if (!slug) return;
  window.location.href = 'detail.html?slug=' + encodeURIComponent(slug);
}

/* ─── Chargement principal ───────────────────────────────── */
async function loadDetail() {
  const slug = getSlugFromUrl();
  if (!slug) {
    showError('Aucun bon sélectionné.');
    return;
  }

  showLoader();

  try {
    const res = await fetch(`${API_BASE}/bons/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      throw new Error(res.status === 404 ? 'Bon introuvable.' : 'Erreur serveur.');
    }
    const bon = await res.json();

    renderBon(bon);
    renderAvis(bon.avis);
    renderSimilaires(bon.similaires);

    showMain();
  } catch (err) {
    console.error('Erreur chargement détail:', err);
    showError(err.message);
  }
}

/* ─── Init ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', loadDetail);
