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
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Rate limiting — REQ-NF-06: prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found.' });
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
