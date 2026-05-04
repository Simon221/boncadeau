'use strict';

const express    = require('express');
const cors       = require('cors');
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const nodemailer = require('nodemailer');

const JWT_SECRET  = process.env.JWT_SECRET || 'boncadeau_jwt_secret_change_in_prod';
const JWT_EXPIRES = '8h';

const app  = express();
const PORT = process.env.PORT || 3001;

/* ─── Middlewares ────────────────────────────────────────── */
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

/* ─── Upload images bons ─────────────────────────────────── */
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads/bons';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const bonImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    cb(null, `${req.params.id}${ext}`);
  },
});
const uploadBonImage = multer({
  storage: bonImageStorage,
  limits:  { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Seules les images JPEG, PNG et WebP sont acceptées.'));
  },
});

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

/* ─── Transporteur Email (Nodemailer) ────────────────────── */
const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const APP_URL   = process.env.APP_URL || 'http://localhost:8080';
const EMAIL_FROM = process.env.EMAIL_FROM || 'BonCadeau <no-reply@boncadeau.sn>';

/* Formater le montant */
function formatMontant(prix, devise) {
  return `${Number(prix).toLocaleString('fr-FR')} ${devise || 'FCFA'}`;
}

/* Construire et envoyer l'email de notification de statut */
async function envoyerEmailStatut(commande) {
  if (!commande.email_acheteur) return;

  const statutLabels = {
    confirmee: { label: 'Confirmée ✅', couleur: '#16a34a', intro: 'Bonne nouvelle ! Votre commande a été <strong>confirmée</strong>.' },
    livre:     { label: 'Livrée 🎁',    couleur: '#2563eb', intro: 'Votre bon cadeau a été <strong>livré</strong> avec succès.' },
    annulee:   { label: 'Annulée ❌',   couleur: '#dc2626', intro: 'Votre commande a été <strong>annulée</strong>.' },
  };

  const info = statutLabels[commande.statut];
  if (!info) return; // ne pas envoyer pour "en_attente"

  const destLine = commande.prenom_dest
    ? `<tr><td style="padding:6px 0;color:#6b7280;">Destinataire</td><td style="padding:6px 0;font-weight:600;">${commande.prenom_dest} ${commande.nom_dest || ''}</td></tr>`
    : '';

  const messageLine = commande.message
    ? `<tr><td style="padding:6px 0;color:#6b7280;">Message</td><td style="padding:6px 0;font-style:italic;">"${commande.message}"</td></tr>`
    : '';

  const fournisseurSection = (commande.statut === 'livre') && commande.fournisseur_nom ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-top:20px;">
      <p style="margin:0 0 8px;font-weight:700;color:#166534;">📍 Où utiliser votre bon cadeau</p>
      <p style="margin:0;color:#15803d;font-weight:600;">${commande.fournisseur_nom}</p>
      ${commande.fournisseur_adresse ? `<p style="margin:4px 0 0;color:#166534;">📌 ${commande.fournisseur_adresse}</p>` : ''}
      ${commande.fournisseur_telephone ? `<p style="margin:4px 0 0;color:#166534;">📞 ${commande.fournisseur_telephone}</p>` : ''}
      ${commande.fournisseur_email ? `<p style="margin:4px 0 0;color:#166534;">✉️ ${commande.fournisseur_email}</p>` : ''}
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <!-- En-tête -->
        <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:28px;letter-spacing:1px;">🎁 BonCadeau</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:14px;">Votre plateforme de bons cadeaux</p>
        </td></tr>
        <!-- Badge statut -->
        <tr><td style="padding:24px 40px 0;text-align:center;">
          <span style="display:inline-block;background:${info.couleur};color:#fff;padding:8px 22px;border-radius:999px;font-size:15px;font-weight:700;">
            Commande ${info.label}
          </span>
        </td></tr>
        <!-- Corps -->
        <tr><td style="padding:24px 40px;">
          <p style="margin:0 0 16px;font-size:16px;color:#374151;">Bonjour <strong>${commande.prenom_acheteur} ${commande.nom_acheteur}</strong>,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;">${info.intro}</p>

          <!-- Détails commande -->
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:8px;">
            <p style="margin:0 0 12px;font-weight:700;color:#1f2937;font-size:15px;">📋 Détails de la commande</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;">
              <tr>
                <td style="padding:6px 0;color:#6b7280;width:45%;">Référence</td>
                <td style="padding:6px 0;font-weight:700;color:#7c3aed;">${commande.reference}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280;">Bon cadeau</td>
                <td style="padding:6px 0;font-weight:600;">${commande.bon_titre}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280;">Montant</td>
                <td style="padding:6px 0;font-weight:700;color:#059669;">${formatMontant(commande.prix, commande.devise)}</td>
              </tr>
              ${destLine}
              ${messageLine}
              <tr>
                <td style="padding:6px 0;color:#6b7280;">Statut</td>
                <td style="padding:6px 0;font-weight:700;color:${info.couleur};">${info.label}</td>
              </tr>
            </table>
          </div>

          ${fournisseurSection}

          <div style="text-align:center;margin-top:28px;">
            <a href="${APP_URL}/pages/client-dashboard.html"
               style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;">
              Voir mes commandes
            </a>
          </div>
        </td></tr>
        <!-- Pied -->
        <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            © ${new Date().getFullYear()} BonCadeau · Tous droits réservés<br>
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await mailer.sendMail({
    from:    EMAIL_FROM,
    to:      commande.email_acheteur,
    subject: `[BonCadeau] Votre commande ${commande.reference} – ${info.label}`,
    html,
  });
}

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
         b.icone, b.image_url, b.couleur_fond, b.badge, b.note_moyenne, b.nb_avis,
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
      `SELECT b.id, b.slug, b.titre, b.prix, b.devise, b.icone, b.image_url, b.couleur_fond, b.note_moyenne, f.nom AS fournisseur_nom
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

    // Générer la référence
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ref = 'BC-';
    for (let i = 0; i < 8; i++) {
      ref += chars[Math.floor(Math.random() * chars.length)];
      if (i === 3) ref += '-';
    }

    // Lier la commande au client si un JWT client est fourni
    let client_id = null;
    const authHdr = req.headers.authorization || '';
    if (authHdr.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHdr.slice(7), JWT_SECRET);
        if (decoded.role === 'client') client_id = decoded.id;
      } catch {}
    }

    const [result] = await pool.query(
      `INSERT INTO commandes
         (reference, bon_id, client_id, prenom_acheteur, nom_acheteur, email_acheteur, tel_acheteur,
          prenom_dest, nom_dest, email_dest, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ref, bon_id, client_id, prenom_acheteur, nom_acheteur, email_acheteur, tel_acheteur,
       prenom_dest || null, nom_dest || null, email_dest || null, message || null]
    );

    res.status(201).json({ reference: ref, commande_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   CLIENTS – Inscription / Connexion / Espace perso
   ════════════════════════════════════════════════════════════ */

function requireClient(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    if (decoded.role !== 'client') return res.status(403).json({ error: 'Accès réservé aux clients.' });
    req.client = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

/* POST /api/clients/register */
app.post('/api/clients/register', async (req, res) => {
  try {
    const { prenom, nom, email, telephone, password } = req.body;
    if (!prenom || !nom || !email || !password) {
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }
    const [[existing]] = await pool.query('SELECT id FROM clients WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Un compte avec cet email existe déjà.' });

    const password_hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO clients (prenom, nom, email, telephone, password_hash) VALUES (?, ?, ?, ?, ?)',
      [prenom, nom, email, telephone || null, password_hash]
    );
    const token = jwt.sign(
      { id: result.insertId, email, prenom, nom, role: 'client' },
      JWT_SECRET, { expiresIn: JWT_EXPIRES }
    );
    res.status(201).json({ token, prenom, nom, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/clients/login */
app.post('/api/clients/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
    const [[client]] = await pool.query('SELECT * FROM clients WHERE email = ?', [email]);
    if (!client || !(await bcrypt.compare(password, client.password_hash))) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }
    const token = jwt.sign(
      { id: client.id, email: client.email, prenom: client.prenom, nom: client.nom, role: 'client' },
      JWT_SECRET, { expiresIn: JWT_EXPIRES }
    );
    res.json({ token, prenom: client.prenom, nom: client.nom, email: client.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/clients/me */
app.get('/api/clients/me', requireClient, async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT prenom, nom, email, telephone FROM clients WHERE id = ?', [req.client.id]);
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/clients/commandes */
app.get('/api/clients/commandes', requireClient, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.reference, c.statut, c.created_at,
              c.prenom_dest, c.nom_dest, c.message,
              b.titre AS bon_titre, b.prix, b.devise, b.icone, b.image_url, b.couleur_fond, b.slug AS bon_slug,
              cat.nom AS categorie,
              f.nom AS fournisseur,
              f.adresse   AS fournisseur_adresse,
              f.telephone AS fournisseur_telephone,
              f.email     AS fournisseur_email,
              (SELECT COUNT(*) FROM avis a WHERE a.commande_id = c.id) AS a_avis
       FROM commandes c
       JOIN bons b ON b.id = c.bon_id
       JOIN categories cat ON cat.id = b.categorie_id
       JOIN fournisseurs f ON f.id = b.fournisseur_id
       WHERE c.client_id = ?
       ORDER BY c.created_at DESC`,
      [req.client.id]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* PATCH /api/clients/commandes/:id/annuler */
app.patch('/api/clients/commandes/:id/annuler', requireClient, async (req, res) => {
  try {
    const [[commande]] = await pool.query(
      'SELECT id, statut FROM commandes WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
    if (commande.statut !== 'en_attente') {
      return res.status(400).json({ error: 'Seules les commandes en attente peuvent être annulées.' });
    }
    await pool.query('UPDATE commandes SET statut = ? WHERE id = ?', ['annulee', req.params.id]);

    // Envoyer l'email de notification annulation
    try {
      const [[cmd]] = await pool.query(
        `SELECT c.reference, c.prenom_acheteur, c.nom_acheteur, c.email_acheteur,
                c.prenom_dest, c.nom_dest, c.message,
                b.titre AS bon_titre, b.prix, b.devise,
                f.nom AS fournisseur_nom, f.adresse AS fournisseur_adresse,
                f.telephone AS fournisseur_telephone, f.email AS fournisseur_email
         FROM commandes c
         JOIN bons b ON b.id = c.bon_id
         JOIN fournisseurs f ON f.id = b.fournisseur_id
         WHERE c.id = ?`,
        [req.params.id]
      );
      if (cmd) {
        cmd.statut = 'annulee';
        await envoyerEmailStatut(cmd);
      }
    } catch (emailErr) {
      console.error('[Email] Erreur envoi notification annulation :', emailErr.message);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/clients/avis */
app.post('/api/clients/avis', requireClient, async (req, res) => {
  try {
    const { commande_id, note, commentaire } = req.body;
    if (!commande_id || !note || note < 1 || note > 5) {
      return res.status(400).json({ error: 'note (1–5) et commande_id sont requis.' });
    }
    const [[commande]] = await pool.query(
      'SELECT * FROM commandes WHERE id = ? AND client_id = ?',
      [commande_id, req.client.id]
    );
    if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
    if (commande.statut !== 'livre') {
      return res.status(400).json({ error: 'Vous ne pouvez noter qu\'une commande livrée.' });
    }
    const [[existingAvis]] = await pool.query('SELECT id FROM avis WHERE commande_id = ?', [commande_id]);
    if (existingAvis) return res.status(409).json({ error: 'Vous avez déjà noté cette commande.' });

    await pool.query(
      `INSERT INTO avis (bon_id, commande_id, client_id, auteur, note, commentaire, date_avis)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
      [commande.bon_id, commande_id, req.client.id,
       `${req.client.prenom} ${req.client.nom}`, note, commentaire || null]
    );
    // Mettre à jour note_moyenne et nb_avis du bon
    await pool.query(
      `UPDATE bons SET
         nb_avis      = (SELECT COUNT(*) FROM avis WHERE bon_id = ?),
         note_moyenne = (SELECT AVG(note)  FROM avis WHERE bon_id = ?)
       WHERE id = ?`,
      [commande.bon_id, commande.bon_id, commande.bon_id]
    );
    res.status(201).json({ ok: true });
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
    if (statut && ['en_attente','confirmee','livre','annulee'].includes(statut)) {
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
    if (!['en_attente','confirmee','livre','annulee'].includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }
    await pool.query('UPDATE commandes SET statut = ? WHERE id = ?', [statut, req.params.id]);

    // Envoyer un email si le statut déclenche une notification
    if (['confirmee','livre','annulee'].includes(statut)) {
      try {
        const [[cmd]] = await pool.query(
          `SELECT c.reference, c.statut, c.prenom_acheteur, c.nom_acheteur, c.email_acheteur,
                  c.prenom_dest, c.nom_dest, c.message,
                  b.titre AS bon_titre, b.prix, b.devise,
                  f.nom AS fournisseur_nom, f.adresse AS fournisseur_adresse,
                  f.telephone AS fournisseur_telephone, f.email AS fournisseur_email
           FROM commandes c
           JOIN bons b ON b.id = c.bon_id
           JOIN fournisseurs f ON f.id = b.fournisseur_id
           WHERE c.id = ?`,
          [req.params.id]
        );
        if (cmd) {
          cmd.statut = statut;
          await envoyerEmailStatut(cmd);
        }
      } catch (emailErr) {
        console.error('[Email] Erreur envoi notification statut :', emailErr.message);
      }
    }

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
   ADMIN – IMAGE BON
   POST /api/admin/bons/:id/image
   ════════════════════════════════════════════════════════════ */
app.post('/api/admin/bons/:id/image', requireAdmin, (req, res, next) => {
  uploadBonImage.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    // Supprimer l'ancienne image si différente extension
    const ext      = path.extname(req.file.filename);
    const imageUrl = `/assets/images/bons/${req.file.filename}`;

    await pool.query('UPDATE bons SET image_url = ? WHERE id = ?', [imageUrl, id]);
    res.json({ image_url: imageUrl });
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

/* ════════════════════════════════════════════════════════════
   GET /api/admin/utilisateurs — Tous les comptes inscrits
   ════════════════════════════════════════════════════════════ */
app.get('/api/admin/utilisateurs', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.prenom, c.nom, c.email, c.telephone, c.created_at,
              COUNT(cmd.id) AS nb_commandes
       FROM clients c
       LEFT JOIN commandes cmd ON cmd.email_acheteur = c.email
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   GET /api/admin/clients-actifs — Tous les acheteurs (avec ou sans compte)
   ════════════════════════════════════════════════════════════ */
app.get('/api/admin/clients-actifs', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         cmd.email_acheteur                              AS email,
         MAX(cmd.prenom_acheteur)                        AS prenom,
         MAX(cmd.nom_acheteur)                           AS nom,
         MAX(cmd.tel_acheteur)                           AS telephone,
         COUNT(cmd.id)                                   AS nb_commandes,
         SUM(b.prix)                                     AS total_depense,
         MAX(cmd.created_at)                             AS derniere_commande,
         MIN(c.created_at)                               AS compte_cree_le,
         IF(COUNT(c.id) > 0, 1, 0)                      AS a_un_compte
       FROM commandes cmd
       JOIN bons b ON b.id = cmd.bon_id
       LEFT JOIN clients c ON c.email = cmd.email_acheteur
       GROUP BY cmd.email_acheteur
       ORDER BY derniere_commande DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   GET /api/commandes/:reference  (public — page de partage)
   Retourne uniquement les infos affichables publiquement.
   ════════════════════════════════════════════════════════════ */
app.get('/api/commandes/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    // Validation : seuls les caractères de référence BonCadeau
    if (!/^BC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(reference)) {
      return res.status(400).json({ error: 'Référence invalide.' });
    }

    const [[row]] = await pool.query(
      `SELECT
         c.reference, c.statut, c.created_at,
         c.prenom_acheteur, c.nom_acheteur,
         c.prenom_dest, c.nom_dest, c.message,
         b.titre  AS bon_titre,
         b.prix, b.devise,
         b.icone, b.image_url, b.couleur_fond,
         cat.nom  AS categorie,
         f.nom    AS fournisseur,
         f.adresse     AS fournisseur_adresse,
         f.telephone   AS fournisseur_telephone,
         f.email       AS fournisseur_email,
         f.site_web    AS fournisseur_site
       FROM commandes c
       JOIN bons         b   ON b.id   = c.bon_id
       JOIN categories   cat ON cat.id = b.categorie_id
       JOIN fournisseurs f   ON f.id   = b.fournisseur_id
       WHERE c.reference = ?`,
      [reference]
    );

    if (!row) return res.status(404).json({ error: 'Commande introuvable.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Démarrage ──────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`✅  BonCadeau API démarrée sur http://localhost:${PORT}`);
});
