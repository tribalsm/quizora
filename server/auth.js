import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, publicUser } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "quiz-live-local-secret";

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

export function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub) || null;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const user = userFromToken(token);
  if (!user) return res.status(401).json({ error: "Требуется авторизация" });
  req.user = publicUser(user);
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: "Недостаточно прав" });
    next();
  };
}

export function socketAuth(socket, next) {
  const user = userFromToken(socket.handshake.auth?.token);
  if (!user) return next(new Error("Требуется авторизация"));
  socket.data.user = publicUser(user);
  next();
}
