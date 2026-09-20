const crypto = require("crypto");
const db = require("./db");

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");

  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split(":");

  if (parts.length !== 2) {
    return false;
  }

  const [salt, originalHash] = parts;

  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");

  const originalBuffer = Buffer.from(originalHash, "hex");
  const currentBuffer = Buffer.from(hash, "hex");

  if (originalBuffer.length !== currentBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    originalBuffer,
    currentBuffer
  );
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");

  const sessionId = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const now = new Date();

  const expiresAt = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  db.prepare(`
    INSERT INTO sessions (
      id,
      user_id,
      expires_at,
      created_at
    )
    VALUES (?, ?, ?, ?)
  `).run(
    sessionId,
    userId,
    expiresAt.toISOString(),
    now.toISOString()
  );

  return token;
}

function getUserBySession(token) {
  if (!token) {
    return null;
  }

  const sessionId = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const session = db.prepare(`
    SELECT
      sessions.user_id,
      sessions.expires_at
    FROM sessions
    WHERE sessions.id = ?
  `).get(sessionId);

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    db.prepare(`
      DELETE FROM sessions
      WHERE id = ?
    `).run(sessionId);

    return null;
  }

  return db.prepare(`
    SELECT
      id,
      name,
      email,
      created_at
    FROM users
    WHERE id = ?
  `).get(session.user_id);
}

function deleteSession(token) {
  if (!token) {
    return;
  }

  const sessionId = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  db.prepare(`
    DELETE FROM sessions
    WHERE id = ?
  `).run(sessionId);
}

function requireUser(req, res, next) {
  const token = req.cookies?.trilha4x4_session;

  const user = getUserBySession(token);

  if (!user) {
    return res.status(401).json({
      error: "Você precisa estar logado."
    });
  }

  req.user = user;

  next();
}

module.exports = {
  createId,
  normalizeEmail,
  hashPassword,
  verifyPassword,
  createSession,
  getUserBySession,
  deleteSession,
  requireUser
};

