import "dotenv/config";
import { db } from "./db.js";
import { hashPassword } from "./auth.js";

const organizerEmail = "organizer@quizora.local";
const playerEmail = "player@quizora.local";
const passwordHash = await hashPassword("quiz123");

const insertUser = db.prepare("INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
insertUser.run("Анна Организатор", organizerEmail, passwordHash, "ORGANIZER");
insertUser.run("Максим Участник", playerEmail, passwordHash, "PARTICIPANT");

const organizer = db.prepare("SELECT * FROM users WHERE email = ?").get(organizerEmail);
let quiz = db.prepare("SELECT * FROM quizzes WHERE organizer_id = ? AND title = ?").get(organizer.id, "Разминка: мир технологий");
if (!quiz) {
  const result = db.prepare(`
    INSERT INTO quizzes (organizer_id, title, description, category, rules, question_time, points_per_question)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(organizer.id, "Разминка: мир технологий", "Короткий демонстрационный квиз", "Технологии", "Выберите ответ до окончания таймера. Скорость влияет на количество баллов.", 20, 1000);
  quiz = db.prepare("SELECT * FROM quizzes WHERE id = ?").get(result.lastInsertRowid);
  const insertQuestion = db.prepare(`
    INSERT INTO questions (quiz_id, text, type, options_json, correct_answers_json, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertQuestion.run(quiz.id, "Что означает HTML?", "SINGLE", JSON.stringify(["HyperText Markup Language", "High Transfer Machine Link", "Home Tool Markup Language", "Hyper Terminal Main Logic"]), JSON.stringify([0]), 0);
  insertQuestion.run(quiz.id, "Какие технологии работают в браузере?", "MULTIPLE", JSON.stringify(["HTML", "CSS", "JavaScript", "SQLite"]), JSON.stringify([0, 1, 2]), 1);
  insertQuestion.run(quiz.id, "Какой протокол удобен для двустороннего обмена в реальном времени?", "SINGLE", JSON.stringify(["FTP", "WebSocket", "SMTP", "SSH"]), JSON.stringify([1]), 2);
}

console.log("Демо-данные созданы:");
console.log("Организатор: organizer@quizora.local / quiz123");
console.log("Участник: player@quizora.local / quiz123");
