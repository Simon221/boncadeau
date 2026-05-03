'use strict';

const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ─── Middlewares ────────────────────────────────────────── */
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

/* ─── Pool de connexions MySQL ───────────────────────────── */
const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  database:           process.env.DB_NAME || 'boncadeau',
  user:               process.env.DB_USER || 'boncadeau_user',
  password:           process.env.DB_PASS || 'boncadeau_pass',
  charset:            'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

/* ─── Vérification DB ────────────────────────────────────── */
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   GET /api/categories
   ════════════════════════════════════════════════════════════ */
app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY nom');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   GET /api/bons
   Query params: categorie (slug), page, limit
   ════════════════════════════════════════════════════════════ */
app.get('/api/bons', async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(50, parseInt(req.query.limit) || 6);
    const offset   = (page - 1) * limit;
    const catSlug  = req.query.categorie || null;

    let where = 'WHERE b.actif = 1';
    const params = [];

    if (catSlug && catSlug !== 'all') {
      where += ' AND c.slug = ?';
      params.push(catSlug);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM bons b
       JOIN categories c ON c.id = b.categorie_id ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT
         b.id, b.slug, b.titre, b.description_courte, b.prix, b.devise,
         b.icone, b.couleur_fond, b.badge, b.note_moyenne, b.nb_avis,
         c.slug   AS categorie_slug,
         c.nom    AS categorie_nom,
         c.icone  AS categorie_icone,
         f.nom    AS fournisseur_nom
       FROM bons b
       JOIN categories  c ON c.id = b.categorie_id
       JOIN fournisseurs f ON f.id = b.fournisseur_id
       ${where}
       ORDER BY b.id
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      data:       rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   GET /api/bons/:slug
   Détail complet d'un bon
   ════════════════════════════════════════════════════════════ */
app.get('/api/bons/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // Validation basique du slug (alphanumeric + tirets)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug invalide.' });
    }

    const [[bon]] = await pool.query(
      `SELECT
         b.*,
         c.slug   AS categorie_slug,
         c.nom    AS categorie_nom,
         c.icone  AS categorie_icone,
         f.nom    AS fournisseur_nom,
         f.description AS fournisseur_description,
         f.adresse     AS fournisseur_adresse,
         f.telephone   AS fournisseur_telephone,
         f.email       AS fournisseur_email,
         f.site_web    AS fournisseur_site
       FROM bons b
       JOIN categories   c ON c.id = b.categorie_id
       JOIN fournisseurs f ON f.id = b.fournisseur_id
       WHERE b.slug = ? AND b.actif = 1`,
      [slug]
    );

    if (!bon) return res.status(404).json({ error: 'Bon introuvable.' });

    // Inclusions
    const [inclusions] = await pool.query(
      'SELECT texte FROM bon_inclusions WHERE bon_id = ?', [bon.id]
    );

    // Conditions
    const [conditions] = await pool.query(
      'SELECT texte FROM bon_conditions WHERE bon_id = ?', [bon.id]
    );

    // Avis
    const [avis] = await pool.query(
      'SELECT auteur, note, commentaire, date_avis FROM avis WHERE bon_id = ? ORDER BY date_avis DESC LIMIT 5',
      [bon.id]
    );

    // Bons similaires (même catégorie, différent slug)
    const [similaires] = await pool.query(
      `SELECT b.id, b.slug, b.titre, b.prix, b.devise, b.icone, b.couleur_fond, b.note_moyenne, f.nom AS fournisseur_nom
       FROM bons b
       JOIN fournisseurs f ON f.id = b.fournisseur_id
       WHERE b.categorie_id = ? AND b.slug != ? AND b.actif = 1
       LIMIT 3`,
      [bon.categorie_id, slug]
    );

    res.json({
      ...bon,
      inclusions: inclusions.map(i => i.texte),
      conditions: conditions.map(c => c.texte),
      avis,
      similaires,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   POST /api/commandes
   Création d'une commande
   ════════════════════════════════════════════════════════════ */
app.post('/api/commandes', async (req, res) => {
  try {
    const {
      bon_id, prenom_acheteur, nom_acheteur, email_acheteur, tel_acheteur,
      prenom_dest, nom_dest, email_dest, message,
    } = req.body;

    // Validation des champs obligatoires
    if (!bon_id || !prenom_acheteur || !nom_acheteur || !email_acheteur || !tel_acheteur) {
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });
    }

    // Génération de la référence
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ref = 'BC-';
    for (let i = 0; i < 8; i++) {
      ref += chars[Math.floor(Math.random() * chars.length)];
      if (i === 3) ref += '-';
    }

    const [result] = await pool.query(
      `INSERT INTO commandes
         (reference, bon_id, prenom_acheteur, nom_acheteur, email_acheteur, tel_acheteur,
          prenom_dest, nom_dest, email_dest, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ref, bon_id, prenom_acheteur, nom_acheteur, email_acheteur, tel_acheteur,
       prenom_dest || null, nom_dest || null, email_dest || null, message || null]
    );

    res.status(201).json({ reference: ref, commande_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Démarrage ──────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`✅  BonCadeau API démarrée sur http://localhost:${PORT}`);
});
