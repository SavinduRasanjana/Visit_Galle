-- ============================================================
--  VISIT GALLE — MySQL Database Schema
--  Run this file once to set up the database
--  REQ-F-12: MySQL must store feedback
--  REQ-NF-07: SQL injection protection via parameterised queries
-- ============================================================

-- Step 1: Create database
CREATE DATABASE IF NOT EXISTS visitgalle
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE visitgalle;

-- ── TABLE: feedback ─────────────────────────────────────────
-- Stores: Name, Email, Message, Date (REQ from SRS §6)
-- Plus extended fields for richer data
DROP TABLE IF EXISTS feedback;

CREATE TABLE feedback (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL
                  COMMENT 'Visitor full name',
  email         VARCHAR(255)  NOT NULL
                  COMMENT 'Visitor email — not shown publicly',
  attraction    VARCHAR(100)  DEFAULT NULL
                  COMMENT 'Which attraction was visited',
  visit_date    DATE          DEFAULT NULL
                  COMMENT 'Date of the actual visit',
  visit_type    VARCHAR(50)   DEFAULT NULL
                  COMMENT 'Solo / Couple / Family etc.',
  rating        TINYINT       NOT NULL
                  COMMENT '1–5 star rating'
                  CHECK (rating BETWEEN 1 AND 5),
  message       TEXT          NOT NULL
                  COMMENT 'Visitor review text',
  submitted_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                  COMMENT 'Server timestamp of submission',
  ip_hash       VARCHAR(64)   DEFAULT NULL
                  COMMENT 'SHA-256 hash of IP for abuse tracking (not raw IP)',
  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'
                  COMMENT 'Content moderation status',

  INDEX idx_status        (status),
  INDEX idx_submitted_at  (submitted_at),
  INDEX idx_attraction    (attraction),
  INDEX idx_rating        (rating)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Visitor feedback submissions for Visit Galle';

-- ── SEED DATA — sample approved reviews ─────────────────────
INSERT INTO feedback
  (name, email, attraction, visit_date, visit_type, rating, message, status)
VALUES
  ('Priya Seneviratne', 'priya.s@email.com',   'Galle Dutch Fort',       '2026-03-10', 'Couple',           5, 'The fort is absolutely magical — we spent the whole morning wandering the old streets. The train ride from Colombo along the coast was unforgettable. This website helped us plan everything perfectly!', 'approved'),
  ('Thomas Weber',      'thomas.w@email.de',   'Unawatuna Beach',        '2026-03-05', 'Couple',           5, 'Unawatuna was stunning! Crystal clear water, amazing local food, very easy to reach from the fort. A must-do for any visitor. Highly recommend the snorkelling!', 'approved'),
  ('Nimal Perera',      'nimal.p@email.com',   'Multiple / General Galle', '2026-02-28', 'Group of friends', 4, 'Perfect one-day trip. The itinerary guide here was spot on — managed to see the fort, religious sites and still catch the beach before the evening train home.', 'approved'),
  ('Sarah Livingston',  'sarah.l@email.com.au','Mirissa Whale Watching',  '2026-02-14', 'Couple',           5, 'Went whale watching in Mirissa and then spent the afternoon in Galle. The blue whale sighting was once in a lifetime. The fort at sunset was equally breathtaking.', 'approved'),
  ('Kamal Fernando',    'kamal.f@email.com',   'Galle Dutch Fort',       '2026-01-20', 'Family with children', 4, 'Great experience for the whole family. Kids loved the lighthouse and the rampart walk. The museum was also fascinating. Fort streets are a bit tricky with a pram though.', 'approved');

-- ── VIEW: approved_feedback ──────────────────────────────────
CREATE OR REPLACE VIEW approved_feedback AS
  SELECT id, name, attraction, visit_type, rating, message, submitted_at
  FROM   feedback
  WHERE  status = 'approved'
  ORDER  BY submitted_at DESC;

-- ── VIEW: feedback_stats ─────────────────────────────────────
CREATE OR REPLACE VIEW feedback_stats AS
  SELECT
    COUNT(*)                              AS total_reviews,
    ROUND(AVG(rating), 1)                AS average_rating,
    SUM(rating = 5)                       AS five_star_count,
    SUM(rating = 4)                       AS four_star_count,
    SUM(rating = 3)                       AS three_star_count,
    SUM(rating <= 2)                      AS low_rating_count
  FROM feedback
  WHERE status = 'approved';

-- ── VERIFY ───────────────────────────────────────────────────
SELECT 'Schema created successfully.' AS result;
SELECT * FROM feedback_stats;
