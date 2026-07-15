import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { db } from "./db.js";
import { hashPassword } from "./auth.js";

const app = createApp();

beforeAll(async () => {
  const hash = await hashPassword("quiz123");
  db.prepare("INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run("Тестовый организатор", "test-organizer@quizora.local", hash, "ORGANIZER");
  db.prepare("INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run("Тестовый участник", "test-player@quizora.local", hash, "PARTICIPANT");
});

async function login(email) {
  const response = await request(app).post("/api/auth/login").send({ email, password: "quiz123" });
  return response.body.token;
}

describe("Quizora API", () => {
  it("отвечает на health-check", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("авторизует пользователя", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: "test-organizer@quizora.local", password: "quiz123" });
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("ORGANIZER");
    expect(response.body.token).toBeTruthy();
  });

  it("создаёт квиз и вопрос", async () => {
    const token = await login("test-organizer@quizora.local");
    const quizResponse = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${token}`).send({
      title: `Тестовый квиз ${Date.now()}`,
      category: "Тест",
      questionTime: 15
    });
    expect(quizResponse.status).toBe(201);
    const questionResponse = await request(app)
      .post(`/api/quizzes/${quizResponse.body.quiz.id}/questions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "Два плюс два?", type: "SINGLE", options: ["3", "4"], correctAnswers: [1] });
    expect(questionResponse.status).toBe(201);
    expect(questionResponse.body.quiz.questions).toHaveLength(1);
    expect(questionResponse.body.quiz.questions[0].correctAnswers).toEqual([1]);
  });

  it("не разрешает участнику управлять квизами", async () => {
    const token = await login("test-player@quizora.local");
    const response = await request(app).get("/api/quizzes").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
  });
});
