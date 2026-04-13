# Visit Galle — Backend Setup Guide
## ITE2953 · E2328015

---

## Project Structure

```
visitgalle/
├── frontend/
│   ├── index.html
│   ├── attractions.html
│   ├── navigation.html
│   ├── itinerary.html
│   ├── feedback.html      ← replace with the API-connected version
│   ├── style.css
│   └── shared.js
│
└── backend/
    ├── server.js          ← Node.js Express API
    ├── database.sql       ← MySQL schema + seed data
    ├── package.json
    ├── .env.example       ← copy to .env and fill in values
    └── README.md
```

---

## Step 1 — MySQL Setup

1. Open MySQL Workbench (or your terminal):
   ```bash
   mysql -u root -p
   ```

2. Run the schema file:
   ```sql
   SOURCE path/to/database.sql;
   ```
   This creates the `visitgalle` database, the `feedback` table, and inserts 5 sample reviews.

3. Verify:
   ```sql
   USE visitgalle;
   SELECT * FROM feedback;
   SELECT * FROM feedback_stats;
   ```

---

## Step 2 — Backend Setup

1. Install Node.js (v18+) from https://nodejs.org

2. Open terminal in the `backend/` folder:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and fill in your MySQL password:
   ```
   DB_PASSWORD=your_password_here
   ```

5. Start the server:
   ```bash
   npm start
   ```
   You should see:
   ```
   ✅ MySQL connected successfully
   ✅ feedback table ready
   🚀 Visit Galle API running on http://localhost:3000
   ```

6. Test it works:
   Open: http://localhost:3000/api/health

---

## Step 3 — Frontend

1. Replace your existing `feedback.html` with the **API-connected version** from the backend folder.

2. Open your frontend using VS Code **Live Server** (right-click index.html → "Open with Live Server").
   - This runs on `http://localhost:5500` — which matches the CORS setting.

3. The feedback form will now:
   - POST to `http://localhost:3000/api/feedback`
   - Show real reviews fetched from MySQL
   - Display live stats (total reviews, average rating, 5-star count)

---

## API Endpoints

| Method | Endpoint                | Description                        |
|--------|-------------------------|------------------------------------|
| GET    | `/api/health`           | Health check                       |
| POST   | `/api/feedback`         | Submit new feedback                |
| GET    | `/api/feedback`         | List approved feedback (paginated) |
| GET    | `/api/feedback/stats`   | Ratings summary statistics         |

### POST /api/feedback — Request Body
```json
{
  "name":       "John Smith",
  "email":      "john@email.com",
  "attraction": "Galle Dutch Fort",
  "visit_date": "2026-03-15",
  "visit_type": "Couple",
  "rating":     5,
  "message":    "Absolutely stunning place!"
}
```

### GET /api/feedback — Query Parameters
- `?page=1` — page number (default: 1)
- `?limit=10` — results per page (max: 20)
- `?attraction=Galle+Dutch+Fort` — filter by attraction

---

## Database Schema

```sql
CREATE TABLE feedback (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  attraction    VARCHAR(100)  DEFAULT NULL,
  visit_date    DATE          DEFAULT NULL,
  visit_type    VARCHAR(50)   DEFAULT NULL,
  rating        TINYINT       NOT NULL,        -- 1 to 5
  message       TEXT          NOT NULL,
  submitted_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  ip_hash       VARCHAR(64)   DEFAULT NULL,
  status        ENUM('pending','approved','rejected') DEFAULT 'pending'
);
```

**To approve submitted feedback** (so it appears publicly):
```sql
USE visitgalle;
UPDATE feedback SET status = 'approved' WHERE id = 6;

-- Or approve all pending at once:
UPDATE feedback SET status = 'approved' WHERE status = 'pending';
```

---

## Security Features (per SRS)

| Requirement | Implementation |
|---|---|
| REQ-NF-06 Input validation | Server-side: `validator.js` checks all fields before DB insert |
| REQ-NF-07 SQL injection    | Parameterised queries via `mysql2` prepared statements |
| REQ-NF-08 HTTPS            | Use HTTPS in production (configure via hosting provider) |
| REQ-NF-09 Unauthorised access | Rate limiting (30 req/15min), no admin routes exposed |

---

## For Development (Auto-restart)

```bash
npm run dev
```
(uses `nodemon` — auto-restarts server on file changes)
