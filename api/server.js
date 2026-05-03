'use strict';

const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET || 'boncadeau_jwt_secret_change_in_prod';
const JWT_EXPIRES = '8h';

const app  = express();
const PORT = process.env.PORT || 3001;

/* ─── Middlewares ────────────────────────────────────────── */
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

/* Logger simple */
app.use((req, res, next) => {
  const ts = new Date().toISOString().replace('T',' ').slice(0, 19);
  console.log(`[${ts}] ${req.method} ${req.url}`);
  next();
});

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
      prenom_acheteur, nom_acheteur, email_acheteur, tel_acheteur,
      prenom_dest, nom_dest, email_dest, message,
    } = req.body;

    // Résolution du bon : accepte bon_id OU bon_slug
    let bon_id = req.body.bon_id || null;
    const bon_slug = req.body.bon_slug || null;
    if (!bon_id && bon_slug) {
      const [[bonRow]] = await pool.query('SELECT id FROM bons WHERE slug = ? AND actif = 1', [bon_slug]);
      if (!bonRow) return res.status(404).json({ error: 'Bon cadeau introuvable.' });
      bon_id = bonRow.id;
    }

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

/* ════════════════════════════════════════════════════════════
   ADMIN – Middleware d'authentification JWT
   ════════════════════════════════════════════════════════════ */
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié.' });
  }
  try {
    req.admin = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

/* ════════════════════════════════════════════════════════════
   POST /api/admin/login
   ════════════════════════════════════════════════════════════ */
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }

    const [[admin]] = await pool.query(
      'SELECT * FROM admins WHERE email = ?', [email]
    );
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    const token = jwt.sign(
      { id: admin.id, nom: admin.nom, email: admin.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.json({ token, nom: admin.nom, email: admin.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   GET /api/admin/stats — Tableau de bord
   ════════════════════════════════════════════════════════════ */
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [[{ nb_bons }]]      = await pool.query('SELECT COUNT(*) AS nb_bons FROM bons');
    const [[{ nb_commandes }]] = await pool.query('SELECT COUNT(*) AS nb_commandes FROM commandes');
    const [[{ nb_clients }]]   = await pool.query('SELECT COUNT(DISTINCT email_acheteur) AS nb_clients FROM commandes');
    const [[{ revenu }]]       = await pool.query(
      `SELECT COALESCE(SUM(b.prix), 0) AS revenu
       FROM commandes c JOIN bons b ON b.id = c.bon_id
       WHERE c.statut != 'annulee'`
    );
    const [recentes] = await pool.query(
      `SELECT c.id, c.reference, c.statut, c.created_at,
              CONCAT(c.prenom_acheteur,' ',c.nom_acheteur) AS acheteur,
              b.titre AS bon_titre, b.prix, b.devise
       FROM commandes c JOIN bons b ON b.id = c.bon_id
       ORDER BY c.created_at DESC LIMIT 5`
    );
    res.json({ nb_bons, nb_commandes, nb_clients, revenu, recentes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   GET  /api/admin/commandes — Liste des commandes
   PATCH /api/admin/commandes/:id/statut — Changer le statut
   ════════════════════════════════════════════════════════════ */
app.get('/api/admin/commandes', requireAdmin, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const statut = req.query.statut || null;

    let where  = '';
    const params = [];
    if (statut && ['en_attente','confirmee','annulee'].includes(statut)) {
      where = 'WHERE c.statut = ?';
      params.push(statut);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM commandes c ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT c.id, c.reference, c.statut, c.created_at,
              c.prenom_acheteur, c.nom_acheteur, c.email_acheteur, c.tel_acheteur,
              c.prenom_dest, c.nom_dest, c.email_dest, c.message,
              b.id AS bon_id, b.titre AS bon_titre, b.prix, b.devise, b.slug AS bon_slug
       FROM commandes c
       JOIN bons b ON b.id = c.bon_id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/commandes/:id/statut', requireAdmin, async (req, res) => {
  try {
    const { statut } = req.body;
    if (!['en_attente','confirmee','annulee'].includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }
    await pool.query('UPDATE commandes SET statut = ? WHERE id = ?', [statut, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   ADMIN – BONS CADEAUX (CRUD)
   GET    /api/admin/bons
   POST   /api/admin/bons
   PUT    /api/admin/bons/:id
   DELETE /api/admin/bons/:id
   ════════════════════════════════════════════════════════════ */
app.get('/api/admin/bons', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.slug, b.titre, b.prix, b.devise, b.badge, b.actif,
              b.icone, b.couleur_fond, b.description_courte,
              b.note_moyenne, b.nb_avis, b.created_at,
              c.nom AS categorie_nom, c.id AS categorie_id,
              f.nom AS fournisseur_nom, f.id AS fournisseur_id
       FROM bons b
       JOIN categories   c ON c.id = b.categorie_id
       JOIN fournisseurs f ON f.id = b.fournisseur_id
       ORDER BY b.id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/bons', requireAdmin, async (req, res) => {
  try {
    const {
      categorie_id, fournisseur_id, titre, slug, description_courte,
      description_longue, prix, devise, icone, couleur_fond, badge, actif,
      inclusions, conditions,
    } = req.body;

    if (!categorie_id || !fournisseur_id || !titre || !slug || !prix) {
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug invalide (minuscules, chiffres et tirets uniquement).' });
    }

    const [result] = await pool.query(
      `INSERT INTO bons
         (categorie_id, fournisseur_id, titre, slug, description_courte, description_longue,
          prix, devise, icone, couleur_fond, badge, actif)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [categorie_id, fournisseur_id, titre, slug, description_courte || '',
       description_longue || '', prix, devise || 'FCFA', icone || 'fa-gift',
       couleur_fond || '', badge || null, actif !== false ? 1 : 0]
    );
    const bonId = result.insertId;

    if (Array.isArray(inclusions) && inclusions.length) {
      const vals = inclusions.filter(t => t).map(t => [bonId, t]);
      if (vals.length) await pool.query('INSERT INTO bon_inclusions (bon_id, texte) VALUES ?', [vals]);
    }
    if (Array.isArray(conditions) && conditions.length) {
      const vals = conditions.filter(t => t).map(t => [bonId, t]);
      if (vals.length) await pool.query('INSERT INTO bon_conditions (bon_id, texte) VALUES ?', [vals]);
    }

    res.status(201).json({ id: bonId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce slug existe déjà.' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/bons/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      categorie_id, fournisseur_id, titre, slug, description_courte,
      description_longue, prix, devise, icone, couleur_fond, badge, actif,
      inclusions, conditions,
    } = req.body;

    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug invalide.' });
    }

    await pool.query(
      `UPDATE bons SET
         categorie_id=?, fournisseur_id=?, titre=?, slug=?,
         description_courte=?, description_longue=?,
         prix=?, devise=?, icone=?, couleur_fond=?, badge=?, actif=?
       WHERE id=?`,
      [categorie_id, fournisseur_id, titre, slug, description_courte,
       description_longue, prix, devise, icone, couleur_fond, badge || null,
       actif !== false ? 1 : 0, id]
    );

    // Replace inclusions & conditions
    await pool.query('DELETE FROM bon_inclusions WHERE bon_id = ?', [id]);
    await pool.query('DELETE FROM bon_conditions WHERE bon_id = ?', [id]);
    if (Array.isArray(inclusions) && inclusions.length) {
      const vals = inclusions.filter(t => t).map(t => [id, t]);
      if (vals.length) await pool.query('INSERT INTO bon_inclusions (bon_id, texte) VALUES ?', [vals]);
    }
    if (Array.isArray(conditions) && conditions.length) {
      const vals = conditions.filter(t => t).map(t => [id, t]);
      if (vals.length) await pool.query('INSERT INTO bon_conditions (bon_id, texte) VALUES ?', [vals]);
    }

    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce slug existe déjà.' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/bons/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE bons SET actif = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   ADMIN – FOURNISSEURS (CRUD)
   GET  /api/admin/fournisseurs
   POST /api/admin/fournisseurs
   PUT  /api/admin/fournisseurs/:id
   ════════════════════════════════════════════════════════════ */
app.get('/api/admin/fournisseurs', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fournisseurs ORDER BY nom');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/fournisseurs', requireAdmin, async (req, res) => {
  try {
    const { nom, description, adresse, telephone, email, site_web, logo_url } = req.body;
    if (!nom) return res.status(400).json({ error: 'Le nom est obligatoire.' });
    const [r] = await pool.query(
      'INSERT INTO fournisseurs (nom, description, adresse, telephone, email, site_web, logo_url) VALUES (?,?,?,?,?,?,?)',
      [nom, description||null, adresse||null, telephone||null, email||null, site_web||null, logo_url||null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/fournisseurs/:id', requireAdmin, async (req, res) => {
  try {
    const { nom, description, adresse, telephone, email, site_web, logo_url } = req.body;
    if (!nom) return res.status(400).json({ error: 'Le nom est obligatoire.' });
    await pool.query(
      'UPDATE fournisseurs SET nom=?,description=?,adresse=?,telephone=?,email=?,site_web=?,logo_url=? WHERE id=?',
      [nom, description||null, adresse||null, telephone||null, email||null, site_web||null, logo_url||null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   ADMIN – CATEGORIES
   GET /api/admin/categories
   ════════════════════════════════════════════════════════════ */
app.get('/api/admin/categories', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY nom');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Démarrage ──────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`✅  BonCadeau API démarrée sur http://localhost:${PORT}`);
});
