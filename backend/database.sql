-- ============================================================
--  VISIT GALLE — Complete MySQL Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS visitgalle
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE visitgalle;

-- ── 1. users ─────────────────────────────────────────────────
DROP TABLE IF EXISTS itineraries;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS attractions;

CREATE TABLE users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('user','admin') DEFAULT 'user',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login  DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. feedback ──────────────────────────────────────────────
CREATE TABLE feedback (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(255) NOT NULL,
  attraction   VARCHAR(100) DEFAULT NULL,
  visit_date   DATE DEFAULT NULL,
  visit_type   VARCHAR(50) DEFAULT NULL,
  rating       TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message      TEXT NOT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash      VARCHAR(64) DEFAULT NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  INDEX idx_status       (status),
  INDEX idx_submitted_at (submitted_at),
  INDEX idx_attraction   (attraction)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. attractions ───────────────────────────────────────────
CREATE TABLE attractions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  category    VARCHAR(50) NOT NULL,
  icon        VARCHAR(10) DEFAULT NULL,
  distance_km DECIMAL(5,1) DEFAULT NULL,
  rating      DECIMAL(3,1) DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. itineraries ───────────────────────────────────────────
CREATE TABLE itineraries (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  name        VARCHAR(150) NOT NULL,
  visit_date  DATE DEFAULT NULL,
  travel_mode VARCHAR(50) DEFAULT NULL,
  group_size  VARCHAR(50) DEFAULT NULL,
  notes       TEXT DEFAULT NULL,
  stops       JSON DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. SEED: Admin account (Password: Admin@1234) ────────────
INSERT INTO users (name, email, password, role) VALUES (
  'Admin',
  'admin@visitgalle.lk',
  '$2b$12$IBcC4FVlx8G3Ag9LowsT3uue1aBdB2ep/VIqak/8c7ekX795e1rUy',
  'admin'
);

-- ── 6. SEED: Sample approved reviews ────────────────────────
INSERT INTO feedback (name, email, attraction, visit_date, visit_type, rating, message, status) VALUES
('Priya Seneviratne', 'priya.s@email.com',    'Galle Dutch Fort',         '2026-03-10', 'Couple',               5, 'The fort is absolutely magical — we spent the whole morning wandering the old streets. The train ride from Colombo along the coast was unforgettable. This website helped us plan everything perfectly!', 'approved'),
('Thomas Weber',      'thomas.w@email.de',    'Unawatuna Beach',          '2026-03-05', 'Couple',               5, 'Unawatuna was stunning! Crystal clear water, amazing local food, very easy to reach from the fort. A must-do for any visitor. Highly recommend the snorkelling!', 'approved'),
('Nimal Perera',      'nimal.p@email.com',    'Multiple / General Galle', '2026-02-28', 'Group of friends',     4, 'Perfect one-day trip. The itinerary guide here was spot on — managed to see the fort, religious sites and still catch the beach before the evening train home.', 'approved'),
('Sarah Livingston',  'sarah.l@email.com.au', 'Mirissa Whale Watching',   '2026-02-14', 'Couple',               5, 'Went whale watching in Mirissa and then spent the afternoon in Galle. The blue whale sighting was once in a lifetime. The fort at sunset was equally breathtaking.', 'approved'),
('Kamal Fernando',    'kamal.f@email.com',    'Galle Dutch Fort',         '2026-01-20', 'Family with children', 4, 'Great experience for the whole family. Kids loved the lighthouse and the rampart walk. The museum was also fascinating. Fort streets are a bit tricky with a pram though.', 'approved'),
('Amara Silva',       'amara.s@email.com',    'Kanneliya Rainforest',     '2026-03-18', 'Group of friends',     5, 'The rainforest trek was absolutely spectacular. Our guide was fantastic and we spotted so many rare birds. A completely different side of Galle that most tourists miss!', 'approved'),
('James Hartley',     'james.h@email.co.uk',  'Galle Lighthouse',         '2026-03-22', 'Solo traveller',       4, 'Climbed the lighthouse just before sunset — the view over the fort walls and the Indian Ocean was worth every step. A must-see if you are visiting the fort.', 'approved');

-- ── 7. VIEWS ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW approved_feedback AS
  SELECT id, name, attraction, visit_type, rating, message, submitted_at
  FROM feedback WHERE status = 'approved'
  ORDER BY submitted_at DESC;

CREATE OR REPLACE VIEW feedback_stats AS
  SELECT
    COUNT(*)             AS total_reviews,
    ROUND(AVG(rating),1) AS average_rating,
    SUM(rating = 5)      AS five_star_count,
    SUM(rating = 4)      AS four_star_count,
    SUM(rating = 3)      AS three_star_count,
    SUM(rating <= 2)     AS low_rating_count
  FROM feedback WHERE status = 'approved';

SELECT 'Schema ready — admin: admin@visitgalle.lk / Admin@1234' AS result;