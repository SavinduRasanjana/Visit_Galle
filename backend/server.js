// ============================================================
//  VISIT GALLE — Backend Server
//  Node.js + Express + MySQL
//  REQ-F-11, REQ-F-12, REQ-F-13 | REQ-NF-06, REQ-NF-07, REQ-NF-08
// ============================================================

const express    = require('express');
const mysql      = require('mysql2/promise');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const validator  = require('validator');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── SECURITY MIDDLEWARE ─────────────────────────────────────
app.use(helmet());                    // REQ-NF-09: secure HTTP headers
app.use(express.json({ limit: '10kb' })); // body size limit

// CORS — only allow your frontend origin
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting — REQ-NF-06: prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: { success: false, error: 'Too many requests. Please try again later.' }
});
app.use('/api/', limiter);

// ── DATABASE CONNECTION POOL ────────────────────────────────
let db;
async function initDB() {
  db = await mysql.createPool({
    host:               process.env.DB_HOST     || 'localhost',
    port:               process.env.DB_PORT     || 3306,
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'visitgalle',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0
  });

  // Test connection
  const [rows] = await db.query('SELECT 1');
  console.log('✅ MySQL connected successfully');

  // Auto-create table if not exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(100)  NOT NULL,
      email         VARCHAR(255)  NOT NULL,
      attraction    VARCHAR(100)  DEFAULT NULL,
      visit_date    DATE          DEFAULT NULL,
      visit_type    VARCHAR(50)   DEFAULT NULL,
      rating        TINYINT       NOT NULL CHECK (rating BETWEEN 1 AND 5),
      message       TEXT          NOT NULL,
      submitted_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
      ip_hash       VARCHAR(64)   DEFAULT NULL,
      status        ENUM('pending','approved','rejected') DEFAULT 'pending'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✅ feedback table ready');
}

// ── INPUT SANITISATION HELPER ───────────────────────────────
function sanitize(str, maxLen = 255) {
  if (typeof str !== 'string') return '';
  return validator.escape(str.trim()).substring(0, maxLen);
}

// ── ROUTES ──────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'Visit Galle API running', time: new Date() });
});

// ── POST /api/feedback — submit feedback ────────────────────
// REQ-F-11: allow feedback submission
// REQ-F-12: store in MySQL
// REQ-F-13: validate required fields
// REQ-NF-06: validate all inputs
// REQ-NF-07: parameterised queries (no SQL injection)
app.post('/api/feedback', async (req, res) => {
  try {
    const { name, email, attraction, visit_date, visit_type, rating, message } = req.body;

    // ── Server-side validation (REQ-F-13, REQ-NF-06) ──────
    const errors = [];

    const cleanName = sanitize(name, 100);
    if (!cleanName || cleanName.length < 2)
      errors.push('Name must be at least 2 characters.');

    const cleanEmail = sanitize(email, 255);
    if (!cleanEmail || !validator.isEmail(cleanEmail))
      errors.push('A valid email address is required.');

    const cleanRating = parseInt(rating);
    if (isNaN(cleanRating) || cleanRating < 1 || cleanRating > 5)
      errors.push('Rating must be between 1 and 5.');

    const cleanMessage = sanitize(message, 1000);
    if (!cleanMessage || cleanMessage.length < 10)
      errors.push('Message must be at least 10 characters.');

    const cleanAttraction = attraction ? sanitize(attraction, 100) : null;
    const cleanVisitType  = visit_type  ? sanitize(visit_type, 50)  : null;

    // Validate date if provided
    let cleanDate = null;
    if (visit_date) {
      if (validator.isDate(visit_date, { format: 'YYYY-MM-DD' })) {
        cleanDate = visit_date;
      } else {
        errors.push('Invalid visit date format.');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // ── Store in DB (parameterised — REQ-NF-07) ──────────
    const crypto = require('crypto');
    const ipHash = crypto.createHash('sha256')
      .update(req.ip || '')
      .digest('hex');

    const [result] = await db.execute(
      `INSERT INTO feedback
         (name, email, attraction, visit_date, visit_type, rating, message, ip_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
      [cleanName, cleanEmail, cleanAttraction, cleanDate, cleanVisitType, cleanRating, cleanMessage, ipHash]
    );

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your feedback has been submitted and will be reviewed shortly.',
      id: result.insertId
    });

  } catch (err) {
    console.error('POST /api/feedback error:', err);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ── GET /api/feedback — fetch approved feedback ─────────────
app.get('/api/feedback', async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(20, parseInt(req.query.limit) || 10);
    const offset  = (page - 1) * limit;
    const catFilter = req.query.attraction ? sanitize(req.query.attraction, 100) : null;

    let query  = `SELECT id, name, attraction, visit_type, rating, message, submitted_at
                  FROM feedback WHERE status = 'approved'`;
    const params = [];

    if (catFilter) {
      query += ' AND attraction = ?';
      params.push(catFilter);
    }

    query += ' ORDER BY submitted_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);

    // Total count
    let countQuery = `SELECT COUNT(*) AS total FROM feedback WHERE status = 'approved'`;
    const countParams = [];
    if (catFilter) { countQuery += ' AND attraction = ?'; countParams.push(catFilter); }
    const [[{ total }]] = await db.execute(countQuery, countParams);

    return res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });

  } catch (err) {
    console.error('GET /api/feedback error:', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ── GET /api/feedback/stats — summary stats ─────────────────
app.get('/api/feedback/stats', async (req, res) => {
  try {
    const [[stats]] = await db.execute(`
      SELECT
        COUNT(*)                              AS total,
        ROUND(AVG(rating), 1)                AS avg_rating,
        SUM(rating = 5)                       AS five_star,
        SUM(rating = 4)                       AS four_star,
        SUM(rating = 3)                       AS three_star,
        SUM(rating <= 2)                      AS low_star
      FROM feedback WHERE status = 'approved'
    `);

    const [byAttraction] = await db.execute(`
      SELECT attraction, COUNT(*) AS count, ROUND(AVG(rating),1) AS avg_rating
      FROM feedback
      WHERE status = 'approved' AND attraction IS NOT NULL
      GROUP BY attraction ORDER BY count DESC LIMIT 10
    `);

    return res.json({ success: true, stats, byAttraction });
  } catch (err) {
    console.error('GET /api/feedback/stats error:', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ── START ───────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Visit Galle API running on http://localhost:${PORT}`);
      console.log(`   POST /api/feedback       — submit feedback`);
      console.log(`   GET  /api/feedback        — list approved feedback`);
      console.log(`   GET  /api/feedback/stats  — ratings summary`);
      console.log(`   GET  /api/health          — health check`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to connect to database:', err.message);
    process.exit(1);
  });

// ============================================================
//  AUTH ROUTES — Register / Login
//  Requirements: bcrypt password hashing, JWT tokens
//  Install: npm install bcrypt jsonwebtoken
// ============================================================

// ── USERS TABLE (auto-created) ──────────────────────────────
async function initUsersTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      name         VARCHAR(100)  NOT NULL,
      email        VARCHAR(255)  NOT NULL UNIQUE,
      password     VARCHAR(255)  NOT NULL,
      created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP,
      last_login   DATETIME      DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✅ users table ready');
}

// Call this inside initDB() after feedback table creation:
// await initUsersTable();
// (Or add it to your initDB function manually)

// ── POST /api/auth/register ─────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const jwt    = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'visitgalle-change-in-production';

    const { name, email, password } = req.body;
    const errors = [];

    const cleanName = sanitize(name, 100);
    if (!cleanName || cleanName.length < 2) errors.push('Name must be at least 2 characters.');

    const cleanEmail = sanitize(email, 255).toLowerCase();
    if (!cleanEmail || !validator.isEmail(cleanEmail)) errors.push('A valid email address is required.');

    if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');

    if (errors.length) return res.status(400).json({ success: false, error: errors.join(' ') });

    // Check duplicate email
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing.length) return res.status(409).json({ success: false, error: 'An account with this email already exists.' });

    // Hash password (12 rounds)
    const hash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [cleanName, cleanEmail, hash]
    );

    const user = { id: result.insertId, name: cleanName, email: cleanEmail };
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({ success: true, token, user });

  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/login ────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const jwt    = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'visitgalle-change-in-production';

    const { email, password } = req.body;

    const cleanEmail = sanitize(email, 255).toLowerCase();
    if (!cleanEmail || !validator.isEmail(cleanEmail) || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (!rows.length) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // Update last_login
    await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };

    return res.json({ success: true, token, user: safeUser });

  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    return res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// ── GET /api/auth/me — verify token & return user ──────────
app.get('/api/auth/me', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'visitgalle-change-in-production';

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await db.execute('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [decoded.userId]);

    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found.' });

    return res.json({ success: true, user: rows[0] });

  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
});

// ============================================================
//  ROLES, ATTRACTIONS & ITINERARIES
//  Install: (already using bcrypt, jsonwebtoken, validator)
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || 'visitgalle-change-in-production';

// ── TABLES AUTO-CREATE ──────────────────────────────────────
async function initExtendedTables() {
  // Add role column to users if not present
  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role ENUM('user','admin') DEFAULT 'user'
  `).catch(() => {}); // ignore if already exists

  // Attractions table
  await db.query(`
    CREATE TABLE IF NOT EXISTS attractions (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      name         VARCHAR(150)  NOT NULL,
      description  TEXT,
      category     VARCHAR(50)   NOT NULL,
      icon         VARCHAR(10)   DEFAULT NULL,
      distance_km  DECIMAL(5,1)  DEFAULT NULL,
      rating       DECIMAL(3,1)  DEFAULT 0,
      created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Itineraries table
  await db.query(`
    CREATE TABLE IF NOT EXISTS itineraries (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT           NOT NULL,
      name         VARCHAR(150)  NOT NULL,
      visit_date   DATE          DEFAULT NULL,
      travel_mode  VARCHAR(50)   DEFAULT NULL,
      group_size   VARCHAR(50)   DEFAULT NULL,
      notes        TEXT          DEFAULT NULL,
      stops        JSON          DEFAULT NULL,
      created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('✅ attractions + itineraries tables ready');
}
// NOTE: Call initExtendedTables() inside your initDB() function.

// ── AUTH MIDDLEWARE ─────────────────────────────────────────
function requireAuth(req, res, next) {
  const jwt = require('jsonwebtoken');
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

async function requireAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    const [rows] = await db.execute('SELECT role FROM users WHERE id = ?', [req.user.userId]);
    if (!rows.length || rows[0].role !== 'admin')
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    next();
  });
}

// ── ATTRACTIONS ROUTES ──────────────────────────────────────

// GET /api/attractions — public, returns all
app.get('/api/attractions', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM attractions ORDER BY category, name'
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// GET /api/attractions/:id — public
app.get('/api/attractions/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM attractions WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found.' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// POST /api/attractions — admin only
app.post('/api/attractions', requireAdmin, async (req, res) => {
  try {
    const { name, description, category, icon, distance_km, rating } = req.body;
    if (!name || !category)
      return res.status(400).json({ success: false, error: 'Name and category are required.' });

    const [result] = await db.execute(
      `INSERT INTO attractions (name, description, category, icon, distance_km, rating)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sanitize(name, 150), sanitize(description||'', 2000), sanitize(category, 50),
       sanitize(icon||'', 10), distance_km ?? null, rating ?? 0]
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// PUT /api/attractions/:id — admin only
app.put('/api/attractions/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, category, icon, distance_km, rating } = req.body;
    if (!name || !category)
      return res.status(400).json({ success: false, error: 'Name and category are required.' });

    const [result] = await db.execute(
      `UPDATE attractions SET name=?, description=?, category=?, icon=?, distance_km=?, rating=?
       WHERE id=?`,
      [sanitize(name, 150), sanitize(description||'', 2000), sanitize(category, 50),
       sanitize(icon||'', 10), distance_km ?? null, rating ?? 0, req.params.id]
    );
    if (!result.affectedRows)
      return res.status(404).json({ success: false, error: 'Attraction not found.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// DELETE /api/attractions/:id — admin only
app.delete('/api/attractions/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM attractions WHERE id = ?', [req.params.id]);
    if (!result.affectedRows)
      return res.status(404).json({ success: false, error: 'Attraction not found.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ── ITINERARY ROUTES ────────────────────────────────────────

// GET /api/itineraries — user's own plans only
app.get('/api/itineraries', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM itineraries WHERE user_id = ? ORDER BY updated_at DESC',
      [req.user.userId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// GET /api/itineraries/:id — owner only
app.get('/api/itineraries/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM itineraries WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found.' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// POST /api/itineraries — create new plan
app.post('/api/itineraries', requireAuth, async (req, res) => {
  try {
    const { name, visit_date, travel_mode, group_size, notes, stops } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Plan name is required.' });

    const [result] = await db.execute(
      `INSERT INTO itineraries (user_id, name, visit_date, travel_mode, group_size, notes, stops)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.userId, sanitize(name, 150), visit_date || null,
       sanitize(travel_mode||'', 50), sanitize(group_size||'', 50),
       sanitize(notes||'', 2000), JSON.stringify(stops || [])]
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// PUT /api/itineraries/:id — update own plan
app.put('/api/itineraries/:id', requireAuth, async (req, res) => {
  try {
    const { name, visit_date, travel_mode, group_size, notes, stops } = req.body;
    const [result] = await db.execute(
      `UPDATE itineraries SET name=?, visit_date=?, travel_mode=?, group_size=?, notes=?, stops=?
       WHERE id=? AND user_id=?`,
      [sanitize(name||'', 150), visit_date || null,
       sanitize(travel_mode||'', 50), sanitize(group_size||'', 50),
       sanitize(notes||'', 2000), JSON.stringify(stops || []),
       req.params.id, req.user.userId]
    );
    if (!result.affectedRows)
      return res.status(404).json({ success: false, error: 'Plan not found or not yours.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// DELETE /api/itineraries/:id — delete own plan
app.delete('/api/itineraries/:id', requireAuth, async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM itineraries WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (!result.affectedRows)
      return res.status(404).json({ success: false, error: 'Plan not found or not yours.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ── USER'S OWN REVIEWS ──────────────────────────────────────
// GET /api/my-reviews — returns only the logged-in user's feedback
app.get('/api/my-reviews', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, attraction, visit_type, rating, message, submitted_at
       FROM feedback WHERE email = (SELECT email FROM users WHERE id = ?)
       ORDER BY submitted_at DESC`,
      [req.user.userId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found.' });
});