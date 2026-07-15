import crypto from "node:crypto";
import { db, getQuizWithQuestions, leaderboard } from "./db.js";

const activeRooms = new Map();

function respond(ack, payload) {
  if (typeof ack === "function") ack(payload);
}

function roomName(code) {
  return `room:${code}`;
}

function findSession(code) {
  return db.prepare(`
    SELECT s.*, q.organizer_id, q.title, q.question_time, q.points_per_question
    FROM quiz_sessions s JOIN quizzes q ON q.id = s.quiz_id
    WHERE s.room_code = ?
  `).get(String(code || "").trim().toUpperCase());
}

function makeRoomCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!db.prepare("SELECT 1 FROM quiz_sessions WHERE room_code = ?").get(code)) return code;
  }
  throw new Error("Не удалось создать код комнаты");
}

function roomState(session) {
  const players = db.prepare(`
    SELECT u.id, u.name, sp.score FROM session_players sp
    JOIN users u ON u.id = sp.user_id
    WHERE sp.session_id = ? ORDER BY sp.joined_at
  `).all(session.id);
  return {
    code: session.room_code,
    status: session.status,
    title: session.title,
    currentQuestion: session.current_question,
    players
  };
}

function closeQuestion(io, session, runtime) {
  if (!runtime || runtime.closed) return;
  runtime.closed = true;
  if (runtime.timer) clearTimeout(runtime.timer);
  const question = db.prepare("SELECT correct_answers_json FROM questions WHERE id = ?").get(runtime.questionId);
  io.to(roomName(session.room_code)).emit("quiz:question-closed", {
    correctAnswers: JSON.parse(question.correct_answers_json),
    leaderboard: leaderboard(session.id)
  });
}

function finishSession(io, session) {
  const runtime = activeRooms.get(session.room_code);
  if (runtime?.timer) clearTimeout(runtime.timer);
  db.prepare("UPDATE quiz_sessions SET status = 'FINISHED', finished_at = datetime('now') WHERE id = ?")
    .run(session.id);
  const results = leaderboard(session.id);
  io.to(roomName(session.room_code)).emit("quiz:finished", { leaderboard: results });
  activeRooms.delete(session.room_code);
  return results;
}

function startQuestion(io, session, questionIndex) {
  const quiz = getQuizWithQuestions(session.quiz_id, true);
  const question = quiz.questions[questionIndex];
  if (!question) return finishSession(io, session);

  const startedAt = Date.now();
  const durationMs = quiz.questionTime * 1000;
  const runtime = {
    questionId: question.id,
    questionIndex,
    startedAt,
    endsAt: startedAt + durationMs,
    closed: false,
    timer: null
  };
  activeRooms.set(session.room_code, runtime);
  db.prepare("UPDATE quiz_sessions SET status = 'ACTIVE', current_question = ?, started_at = COALESCE(started_at, datetime('now')) WHERE id = ?")
    .run(questionIndex, session.id);

  io.to(roomName(session.room_code)).emit("quiz:question", {
    id: question.id,
    index: questionIndex,
    total: quiz.questions.length,
    text: question.text,
    imageUrl: question.imageUrl,
    type: question.type,
    options: question.options,
    duration: quiz.questionTime,
    endsAt: runtime.endsAt
  });
  runtime.timer = setTimeout(() => closeQuestion(io, session, runtime), durationMs + 50);
  return runtime;
}

function isHost(user, session) {
  return user.role === "ORGANIZER" && session.organizer_id === user.id;
}

export function attachRealtime(io) {
  io.on("connection", (socket) => {
    const user = socket.data.user;

    socket.on("host:create", ({ quizId } = {}, ack) => {
      if (user.role !== "ORGANIZER") return respond(ack, { error: "Только организатор может запускать квиз" });
      const quiz = getQuizWithQuestions(Number(quizId), true);
      if (!quiz || quiz.organizerId !== user.id) return respond(ack, { error: "Квиз не найден" });
      if (!quiz.questions.length) return respond(ack, { error: "Добавьте хотя бы один вопрос" });

      const code = makeRoomCode();
      const result = db.prepare("INSERT INTO quiz_sessions (quiz_id, room_code) VALUES (?, ?)").run(quiz.id, code);
      const session = findSession(code);
      socket.join(roomName(code));
      socket.data.roomCode = code;
      socket.data.sessionId = Number(result.lastInsertRowid);
      const state = roomState(session);
      io.to(roomName(code)).emit("room:state", state);
      respond(ack, { ok: true, room: state });
    });

    socket.on("player:join", ({ code } = {}, ack) => {
      if (user.role !== "PARTICIPANT") return respond(ack, { error: "Войти в игру может участник" });
      const session = findSession(code);
      if (!session) return respond(ack, { error: "Комната не найдена" });
      if (session.status === "FINISHED") return respond(ack, { error: "Квиз уже завершён" });

      db.prepare("INSERT OR IGNORE INTO session_players (session_id, user_id) VALUES (?, ?)")
        .run(session.id, user.id);
      socket.join(roomName(session.room_code));
      socket.data.roomCode = session.room_code;
      socket.data.sessionId = session.id;
      const state = roomState(session);
      io.to(roomName(session.room_code)).emit("room:state", state);
      respond(ack, { ok: true, room: state });

      const runtime = activeRooms.get(session.room_code);
      if (session.status === "ACTIVE" && runtime && !runtime.closed && Date.now() < runtime.endsAt) {
        const quiz = getQuizWithQuestions(session.quiz_id, false);
        const question = quiz.questions[runtime.questionIndex];
        const alreadyAnswered = Boolean(db.prepare("SELECT 1 FROM answers WHERE session_id = ? AND question_id = ? AND user_id = ?")
          .get(session.id, question.id, user.id));
        socket.emit("quiz:question", {
          ...question,
          index: runtime.questionIndex,
          total: quiz.questions.length,
          duration: quiz.questionTime,
          endsAt: runtime.endsAt,
          alreadyAnswered
        });
      }
    });

    socket.on("host:start", ({ code } = {}, ack) => {
      const session = findSession(code);
      if (!session || !isHost(user, session)) return respond(ack, { error: "Комната не найдена" });
      if (session.status !== "LOBBY") return respond(ack, { error: "Квиз уже запущен" });
      startQuestion(io, session, 0);
      respond(ack, { ok: true });
    });

    socket.on("host:next", ({ code } = {}, ack) => {
      const session = findSession(code);
      if (!session || !isHost(user, session)) return respond(ack, { error: "Комната не найдена" });
      const runtime = activeRooms.get(session.room_code);
      if (runtime && !runtime.closed) closeQuestion(io, session, runtime);
      const quiz = getQuizWithQuestions(session.quiz_id, false);
      const nextIndex = session.current_question + 1;
      if (nextIndex >= quiz.questions.length) {
        const results = finishSession(io, session);
        return respond(ack, { ok: true, finished: true, leaderboard: results });
      }
      startQuestion(io, session, nextIndex);
      respond(ack, { ok: true });
    });

    socket.on("host:finish", ({ code } = {}, ack) => {
      const session = findSession(code);
      if (!session || !isHost(user, session)) return respond(ack, { error: "Комната не найдена" });
      const results = finishSession(io, session);
      respond(ack, { ok: true, leaderboard: results });
    });

    socket.on("player:answer", ({ code, questionId, answers } = {}, ack) => {
      const session = findSession(code);
      const runtime = session && activeRooms.get(session.room_code);
      if (!session || user.role !== "PARTICIPANT") return respond(ack, { error: "Комната не найдена" });
      if (!runtime || runtime.closed || runtime.questionId !== Number(questionId) || Date.now() > runtime.endsAt) {
        return respond(ack, { error: "Время ответа истекло" });
      }
      const player = db.prepare("SELECT * FROM session_players WHERE session_id = ? AND user_id = ?")
        .get(session.id, user.id);
      if (!player) return respond(ack, { error: "Сначала войдите в комнату" });

      const question = db.prepare("SELECT * FROM questions WHERE id = ? AND quiz_id = ?")
        .get(runtime.questionId, session.quiz_id);
      const selected = [...new Set((Array.isArray(answers) ? answers : []).map(Number))].sort((a, b) => a - b);
      const options = JSON.parse(question.options_json);
      if (!selected.length || selected.some((index) => index < 0 || index >= options.length)) {
        return respond(ack, { error: "Выберите вариант ответа" });
      }
      if (question.type === "SINGLE" && selected.length !== 1) {
        return respond(ack, { error: "Можно выбрать только один вариант" });
      }

      const correct = JSON.parse(question.correct_answers_json).map(Number).sort((a, b) => a - b);
      const isCorrect = selected.length === correct.length && selected.every((value, index) => value === correct[index]);
      const responseMs = Math.max(0, Date.now() - runtime.startedAt);
      const remainingRatio = Math.max(0, (runtime.endsAt - Date.now()) / (runtime.endsAt - runtime.startedAt));
      const points = isCorrect ? Math.round(session.points_per_question * (0.6 + remainingRatio * 0.4)) : 0;

      try {
        db.transaction(() => {
          db.prepare(`
            INSERT INTO answers (session_id, question_id, user_id, answers_json, is_correct, points, response_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(session.id, question.id, user.id, JSON.stringify(selected), isCorrect ? 1 : 0, points, responseMs);
          db.prepare("UPDATE session_players SET score = score + ? WHERE session_id = ? AND user_id = ?")
            .run(points, session.id, user.id);
        })();
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) return respond(ack, { error: "Ответ уже принят" });
        throw error;
      }

      const answerCount = db.prepare("SELECT COUNT(*) AS count FROM answers WHERE session_id = ? AND question_id = ?")
        .get(session.id, question.id).count;
      io.to(roomName(session.room_code)).emit("room:answer-count", { count: answerCount });
      respond(ack, { ok: true, points });
    });
  });
}
