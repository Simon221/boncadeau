-- ═══════════════════════════════════════════════════════════
-- BONCADEAU – Schéma MySQL
-- ═══════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
-- Désactivé pendant la création pour éviter les erreurs d'ordre
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS boncadeau CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE boncadeau;

-- ─── Categories ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  slug       VARCHAR(50)  NOT NULL UNIQUE,
  nom        VARCHAR(100) NOT NULL,
  icone      VARCHAR(50)  NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Fournisseurs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fournisseurs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(150) NOT NULL,
  description TEXT,
  adresse     VARCHAR(255),
  telephone   VARCHAR(30),
  email       VARCHAR(150),
  site_web    VARCHAR(255),
  logo_url    VARCHAR(255),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Clients (espace personnel) ──────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  prenom        VARCHAR(100) NOT NULL,
  nom           VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  telephone     VARCHAR(30),
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Bons cadeaux ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bons (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  categorie_id    INT NOT NULL,
  fournisseur_id  INT NOT NULL,
  titre           VARCHAR(200) NOT NULL,
  slug            VARCHAR(200) NOT NULL UNIQUE,
  description_courte TEXT NOT NULL,
  description_longue LONGTEXT,
  prix            DECIMAL(12,2) NOT NULL,
  devise          VARCHAR(10) DEFAULT 'FCFA',
  icone           VARCHAR(50)  DEFAULT 'fa-gift',
  image_url       VARCHAR(255),
  couleur_fond    VARCHAR(200),
  badge           VARCHAR(80),
  note_moyenne    DECIMAL(3,2) DEFAULT 5.00,
  nb_avis         INT DEFAULT 0,
  actif           BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (categorie_id)   REFERENCES categories(id),
  FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
);

-- ─── Inclusions (ce qui est compris dans le bon) ─────────
CREATE TABLE IF NOT EXISTS bon_inclusions (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  bon_id INT NOT NULL,
  texte  VARCHAR(255) NOT NULL,
  FOREIGN KEY (bon_id) REFERENCES bons(id) ON DELETE CASCADE
);

-- ─── Conditions d'utilisation ────────────────────────────
CREATE TABLE IF NOT EXISTS bon_conditions (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  bon_id INT NOT NULL,
  texte  VARCHAR(255) NOT NULL,
  FOREIGN KEY (bon_id) REFERENCES bons(id) ON DELETE CASCADE
);

-- ─── Commandes ────────────────────────────────────────────
-- (doit être créée AVANT avis car avis y fait référence)
CREATE TABLE IF NOT EXISTS commandes (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  reference        VARCHAR(20)  NOT NULL UNIQUE,
  bon_id           INT NOT NULL,
  client_id        INT,
  prenom_acheteur  VARCHAR(100) NOT NULL,
  nom_acheteur     VARCHAR(100) NOT NULL,
  email_acheteur   VARCHAR(150) NOT NULL,
  tel_acheteur     VARCHAR(30)  NOT NULL,
  prenom_dest      VARCHAR(100),
  nom_dest         VARCHAR(100),
  email_dest       VARCHAR(150),
  message          TEXT,
  statut           ENUM('en_attente','confirmee','livre','annulee') DEFAULT 'en_attente',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bon_id)    REFERENCES bons(id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- ─── Avis clients ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS avis (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  bon_id       INT NOT NULL,
  commande_id  INT,
  client_id    INT,
  auteur       VARCHAR(100) NOT NULL,
  note         TINYINT NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire  TEXT,
  date_avis    DATE NOT NULL,
  FOREIGN KEY (bon_id)      REFERENCES bons(id) ON DELETE CASCADE,
  FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id)   REFERENCES clients(id) ON DELETE SET NULL
);

-- ─── Administrateurs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SET FOREIGN_KEY_CHECKS = 1;

-- Admin par défaut : admin@boncadeau.sn / Admin2026!
INSERT IGNORE INTO admins (nom, email, password_hash) VALUES
  ('Super Admin', 'admin@boncadeau.sn', '$2b$12$X5LHanEAGkqNDsDZ4Bdwhew9zfLvmKDJ2gZgPf7bcYbccZ33LHPCG');

-- ═══════════════════════════════════════════════════════════
-- DONNÉES DE DÉMONSTRATION
-- ═══════════════════════════════════════════════════════════

INSERT IGNORE INTO categories (slug, nom, icone) VALUES
  ('bienetre',  'Bien-être',      'fa-spa'),
  ('mode',      'Mode & Montres', 'fa-tshirt'),
  ('hotel',     'Séjours',        'fa-hotel'),
  ('gastro',    'Gastronomie',    'fa-utensils'),
  ('aventure',  'Aventure',       'fa-mountain');

INSERT IGNORE INTO fournisseurs (nom, description, adresse, telephone, email) VALUES
  ('Zénitude Spa',    'Institut de bien-être haut de gamme à Dakar',         'Almadies, Dakar',      '+221 33 820 00 01', 'contact@zenitude.sn'),
  ('Hammam Royal',    'Hammam et spa traditionnel au cœur de Dakar',          'Plateau, Dakar',       '+221 33 820 00 02', 'info@hammamroyal.sn'),
  ('Institut Clarins','Soins visage et corps avec produits Clarins',          'Mermoz, Dakar',        '+221 33 820 00 03', 'dakar@clarins.com'),
  ('Mathydy',         'Montres de luxe et accessoires haut de gamme',         'Centre-ville, Dakar',  '+221 33 820 00 04', 'contact@mathydy.sn'),
  ('Kiabi',           'Mode et vêtements pour toute la famille',              'Ouakam, Dakar',        '+221 33 820 00 05', 'dakar@kiabi.com'),
  ('Bijoux Cauri',    'Bijouterie artisanale et créateurs africains',         'Médina, Dakar',        '+221 33 820 00 06', 'hello@bijouxcauri.sn'),
  ('Radisson Blu',    'Hôtel 5 étoiles avec vue sur l''Atlantique',          'Almadies, Dakar',      '+221 33 869 36 36', 'dakar@radissonblu.com'),
  ('Lamantin Beach',  'Resort balnéaire 5 étoiles à Saly',                  'Saly, Mbour',          '+221 33 957 03 00', 'info@lamantinbeach.com'),
  ('Sunu Voyages',    'Agence de voyages spécialisée Afrique de l''Ouest',   'Plateau, Dakar',       '+221 33 889 00 10', 'reservations@sunuvoyages.sn'),
  ('Le Lagon II',     'Restaurant gastronomique face à l''Atlantique',       'Corniche, Dakar',      '+221 33 820 00 11', 'contact@lelagon.sn'),
  ('Le Jardin',       'Brunch et déjeuner en terrasse dans un cadre fleuri', 'Fann Résidence, Dakar','+221 33 820 00 12', 'info@lejardin.sn'),
  ('Trek Sénégal',    'Randonnées guidées en pleine nature au Sénégal',      'Thiès',                '+221 77 500 00 13', 'guide@treksenegal.sn'),
  ('Dakar Surf Club', 'École de surf et kitesurf sur la plage des Almadies', 'Almadies, Dakar',      '+221 77 500 00 14', 'ride@dakarsurfclub.sn');

INSERT IGNORE INTO bons (categorie_id, fournisseur_id, titre, slug, description_courte, description_longue, prix, icone, couleur_fond, badge, note_moyenne, nb_avis) VALUES
  (1, 1, 'Massage Relaxant 60 min',      'massage-relaxant-60min',
   'Une heure de détente absolue avec notre massage suédois signature. Corps et esprit apaisés.',
   'Offrez-vous une véritable parenthèse de bien-être avec ce massage suédois de 60 minutes réalisé par nos thérapeutes certifiés. Huiles essentielles bio, ambiance tamisée et musique douce : tout est pensé pour vous transporter dans un état de relaxation profond. Idéal après une semaine chargée ou comme cadeau d''anniversaire.',
   75000, 'fa-spa', 'linear-gradient(135deg, #e8d5c4, #c9b8a8)', 'Populaire', 4.90, 47),

  (1, 2, 'Journée Spa & Hammam',         'journee-spa-hammam',
   'Profitez d''une journée complète avec accès hammam, sauna, bain à remous et soins du corps.',
   'Une journée de détente totale vous attend dans notre espace hammam & spa. Au programme : hammam traditionnel, gommage au savon noir, sauna finlandais, bain à remous et massage d''une heure. Un moment de lâcher-prise complet pour recharger les batteries loin du quotidien.',
   120000, 'fa-hot-tub', 'linear-gradient(135deg, #d4edda, #a8d5b5)', NULL, 4.85, 31),

  (1, 3, 'Soin Visage Prestige',         'soin-visage-prestige',
   'Traitement facial haut de gamme avec produits de luxe. Peau lumineuse et régénérée.',
   'Un soin visage d''exception formulé à partir des concentrés actifs Clarins. Nettoyage en profondeur, exfoliation douce, masque repulpant et massage lifting pour un résultat immédiat : peau lissée, hydratée et lumineuse. Convient à tous les types de peau.',
   55000, 'fa-heart', 'linear-gradient(135deg, #fce4ec, #f8bbd0)', NULL, 4.80, 22),

  (2, 4, 'Bon Achat Montre de Luxe',     'bon-achat-montre-luxe',
   'Offrez le temps avec élégance. Ce bon est valable dans notre sélection de montres haut de gamme.',
   'Chez Mathydy, chaque montre raconte une histoire d''élégance et de précision. Ce bon d''achat est valable sur toute la collection de montres haut de gamme : Tissot, Citizen, Seiko Presage et bien d''autres. Le destinataire choisira lui-même le modèle qui correspond à son style, en boutique ou en ligne.',
   200000, 'fa-clock', 'linear-gradient(135deg, #f5e6d3, #e8c99a)', 'Premium', 5.00, 12),

  (2, 5, 'Bon d''Achat Prêt-à-Porter',  'bon-achat-pret-porter',
   'Renouvelez votre garde-robe avec style. Valable sur toute la collection prêt-à-porter.',
   'Ce bon cadeau est utilisable sur l''ensemble du catalogue Kiabi : vêtements homme, femme et enfant. Des basiques du quotidien aux pièces tendance de la saison, c''est l''assurance de faire plaisir sans se tromper. Valable en boutique Kiabi Dakar.',
   50000, 'fa-tshirt', 'linear-gradient(135deg, #e8eaf6, #c5cae9)', NULL, 4.60, 38),

  (2, 6, 'Coffret Accessoires Bijoux',   'coffret-accessoires-bijoux',
   'Bijoux et accessoires de créateurs pour sublimer chaque tenue. Élégance garantie.',
   'Bijoux Cauri propose une sélection exclusive de bijoux artisanaux inspirés de la culture africaine : colliers en cauri, bracelets en bronze, pendentifs en argent. Ce coffret comprend une pièce au choix parmi la collection capsule saison 2026. Livré dans un écrin luxe.',
   85000, 'fa-gem', 'linear-gradient(135deg, #fff8e1, #ffe082)', NULL, 4.75, 19),

  (3, 7, 'Nuit Romantique en Hôtel 5★',  'nuit-romantique-hotel-5-etoiles',
   'Une nuit inoubliable dans un hôtel de luxe avec petit-déjeuner, champagne et décoration florale.',
   'Offrez une nuit de rêve au Radisson Blu Dakar, avec vue sur l''Atlantique. Le pack romantique comprend : chambre Deluxe avec décoration florale, bouteille de champagne à l''arrivée, petit-déjeuner buffet pour deux personnes le lendemain matin, et accès à la piscine. Un moment inoubliable à vivre à deux.',
   150000, 'fa-hotel', 'linear-gradient(135deg, #e3f2fd, #90caf9)', 'Coup de ♥', 4.95, 64),

  (3, 8, 'Week-end Balnéaire 2 jours',   'weekend-balneaire-2-jours',
   'Escapade en bord de mer pour deux personnes. Hébergement, dîner gastronomique inclus.',
   'Évadez-vous le temps d''un week-end au Lamantin Beach Resort & Spa à Saly. Ce forfait 2 jours / 1 nuit pour 2 personnes inclut : nuit en chambre Supérieure vue jardin, dîner gastronomique en demi-pension, accès à la plage privée, piscine et animations. Un bol d''air en bord de mer à seulement 80 km de Dakar.',
   350000, 'fa-umbrella-beach', 'linear-gradient(135deg, #e0f7fa, #80deea)', NULL, 4.85, 41),

  (3, 9, 'Séjour Découverte 3 nuits',    'sejour-decouverte-3-nuits',
   'Explorez une destination de rêve en Afrique de l''Ouest. Vol + hôtel 4★ + visites incluses.',
   'Partez à la découverte de Ziguinchor, Saint-Louis ou Tambacounda avec ce forfait tout inclus signé Sunu Voyages. 3 nuits en hôtel 4 étoiles, transferts aéroport/hôtel, petit-déjeuner quotidien et deux visites guidées (parc naturel ou patrimoine culturel) sont inclus. La destination est confirmée à la réservation.',
   600000, 'fa-plane', 'linear-gradient(135deg, #f3e5f5, #ce93d8)', NULL, 4.70, 28),

  (4, 10, 'Dîner Gastronomique pour 2',  'diner-gastronomique-pour-2',
   'Repas 5 services dans l''un de nos restaurants partenaires étoilés. Vin d''entrée offert.',
   'Le Lagon II vous accueille pour un dîner gastronomique en 5 services avec vue panoramique sur la Corniche de Dakar. Menu dégustation : amuse-bouche, entrée froide, poisson du jour, viande de saison, dessert. Vin ou cocktail de bienvenue offert pour deux personnes. Réservation obligatoire sous 48h.',
   90000, 'fa-utensils', 'linear-gradient(135deg, #fff3e0, #ffcc80)', NULL, 4.90, 53),

  (4, 11, 'Brunch de Luxe Dominical',    'brunch-luxe-dominical',
   'Un brunch somptueux le dimanche matin dans un cadre raffiné. Buffet illimité pour 2.',
   'Chaque dimanche matin, Le Jardin déploie son brunch buffet illimité dans un cadre verdoyant et aéré. Viennoiseries maison, œufs cuisinés à la commande, fromages, charcuterie, fruits frais, smoothies et desserts maison. Jus d''orange pressé et café inclus. Une façon douce et délicieuse de commencer le week-end.',
   45000, 'fa-coffee', 'linear-gradient(135deg, #efebe9, #bcaaa4)', NULL, 4.65, 77),

  (5, 12, 'Randonnée Guidée en Nature',  'randonnee-guidee-nature',
   'Une journée d''aventure avec un guide expert. Découvrez des paysages à couper le souffle.',
   'Trek Sénégal vous emmène pour une journée de randonnée dans les collines de Thiès ou la réserve naturelle de Bandia. Un guide expert vous accompagne sur des sentiers fascinants, vous faisant découvrir la flore et la faune locales. Pique-nique sur le parcours et transport depuis Dakar inclus.',
   35000, 'fa-hiking', 'linear-gradient(135deg, #e8f5e9, #a5d6a7)', NULL, 4.80, 33),

  (5, 13, 'Session Surf & Kitesurf',     'session-surf-kitesurf',
   'Initiez-vous aux sports de glisse avec nos moniteurs certifiés. Matériel inclus.',
   'Dakar Surf Club vous ouvre les portes de la glisse sur les vagues de l''Atlantique ! Cours d''initiation de 2h avec moniteur diplômé d''État, accès à tout le matériel (planche, combinaison, voile), suivi vidéo de votre session et photos souvenir inclus. Disponible en surf longboard ou kitesurf selon les conditions.',
   60000, 'fa-water', 'linear-gradient(135deg, #e1f5fe, #81d4fa)', 'Adrénaline', 4.85, 45);

-- ─── Inclusions ──────────────────────────────────────────
INSERT IGNORE INTO bon_inclusions (bon_id, texte) VALUES
  (1, '60 minutes de massage suédois'), (1, 'Huiles essentielles bio'), (1, 'Tisane de bienvenue'), (1, 'Accès vestiaires & douches'),
  (2, 'Journée complète (9h–19h)'), (2, 'Hammam + gommage savon noir'), (2, 'Sauna finlandais'), (2, 'Bain à remous'), (2, 'Massage 60 min'),
  (3, 'Diagnostic de peau'), (3, 'Nettoyage en profondeur'), (3, 'Masque repulpant'), (3, 'Massage lifting'), (3, 'Produits Clarins offerts'),
  (4, 'Bon valable sur tout le stock'), (4, 'Utilisable en boutique'), (4, 'Valable 12 mois'), (4, 'Échange possible'),
  (5, 'Valable homme, femme, enfant'), (5, 'Utilisable en boutique Dakar'), (5, 'Valable 12 mois'),
  (6, '1 pièce au choix collection capsule'), (6, 'Écrin luxe inclus'), (6, 'Livraison gratuite en boutique'),
  (7, 'Chambre Deluxe (1 nuit)'), (7, 'Décoration florale'), (7, 'Champagne à l''arrivée'), (7, 'Petit-déjeuner buffet x2'), (7, 'Accès piscine'),
  (8, 'Nuit en chambre Supérieure'), (8, 'Dîner gastronomique x2'), (8, 'Accès plage privée'), (8, 'Accès piscine & animations'),
  (9, '3 nuits en hôtel 4★'), (9, 'Transferts inclus'), (9, 'Petit-déjeuner quotidien'), (9, '2 visites guidées'),
  (10, 'Menu dégustation 5 services'), (10, 'Boisson de bienvenue x2'), (10, 'Vue sur l''Atlantique'),
  (11, 'Buffet brunch illimité x2'), (11, 'Jus pressé & café inclus'), (11, 'Cadre jardin privatif'),
  (12, 'Guide certifié toute la journée'), (12, 'Transport depuis Dakar'), (12, 'Pique-nique sur le parcours'),
  (13, 'Cours 2h avec moniteur diplômé'), (13, 'Matériel complet fourni'), (13, 'Photos souvenir de la session');

-- ─── Conditions ──────────────────────────────────────────
INSERT IGNORE INTO bon_conditions (bon_id, texte) VALUES
  (1, 'Réservation obligatoire 48h à l''avance'), (1, 'Valable 12 mois à compter de la date d''achat'), (1, 'Non remboursable après utilisation'),
  (2, 'Réservation obligatoire 72h à l''avance'), (2, 'Valable 12 mois'), (2, 'Non disponible les jours fériés'),
  (3, 'Sur rendez-vous uniquement'), (3, 'Valable 12 mois'), (3, 'Convient à tous types de peau'),
  (4, 'Valable en boutique Mathydy Dakar'), (4, 'Non cumulable avec d''autres promotions'), (4, 'Valable 12 mois'),
  (5, 'Valable en boutique Kiabi Dakar'), (5, 'Non cumulable avec les soldes'), (5, 'Valable 12 mois'),
  (6, 'Retrait en boutique uniquement'), (6, 'Stock limité'), (6, 'Valable 12 mois'),
  (7, 'Sous réserve de disponibilité'), (7, 'Non remboursable'), (7, 'Valable 12 mois'),
  (8, 'Réservation 1 semaine minimum'), (8, 'Selon disponibilité des chambres'), (8, 'Valable 12 mois'),
  (9, 'Réservation 2 semaines minimum'), (9, 'Destination confirmée à la réservation'), (9, 'Valable 12 mois'),
  (10, 'Réservation obligatoire 48h'), (10, 'Valable du mardi au samedi soir'), (10, 'Valable 12 mois'),
  (11, 'Disponible uniquement le dimanche'), (11, 'Réservation 24h à l''avance'), (11, 'Valable 12 mois'),
  (12, 'Réservation 48h à l''avance'), (12, 'Tenue de sport obligatoire'), (12, 'Valable 12 mois'),
  (13, 'Selon conditions météo'), (13, 'Âge minimum 14 ans'), (13, 'Valable 12 mois');

-- ─── Avis clients ────────────────────────────────────────
INSERT IGNORE INTO avis (bon_id, auteur, note, commentaire, date_avis) VALUES
  (1, 'Fatou D.', 5, 'Un massage incroyable, je me suis sentie comme une reine !', '2026-04-10'),
  (1, 'Mamadou S.', 5, 'Parfait comme cadeau pour ma femme, elle a adoré.', '2026-03-22'),
  (1, 'Aïssatou B.', 4, 'Très bon massage, personnel aux petits soins.', '2026-02-14'),
  (4, 'Ibrahima K.', 5, 'La montre est magnifique, le service Mathydy est impeccable.', '2026-04-01'),
  (4, 'Rokhaya T.', 5, 'Offert à mon mari pour son anniversaire, il était ravi !', '2026-03-15'),
  (7, 'Cheikh N.', 5, 'La chambre était splendide, vue sur mer à couper le souffle.', '2026-04-20'),
  (7, 'Mariama F.', 5, 'Week-end romantique parfait, champagne et fleurs à l''arrivée.', '2026-03-08'),
  (10, 'Omar L.', 5, 'Le meilleur restaurant de Dakar, vue et cuisine exceptionnelles.', '2026-04-05'),
  (10, 'Ndèye S.', 4, 'Très bon dîner, service impeccable. Je recommande !', '2026-02-28'),
  (13, 'Bamba M.', 5, 'Session de surf top ! Le moniteur était super pédagogue.', '2026-04-12');
