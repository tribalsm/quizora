import { useEffect, useMemo, useState } from "react";
import { api, getToken, saveToken, uploadImage } from "./api.js";
import { createQuizSocket } from "./socket.js";

const emptyQuiz = {
  title: "",
  description: "",
  category: "Общее",
  rules: "Выберите ответ до окончания таймера.",
  questionTime: 20,
  pointsPerQuestion: 1000
};

function Button({ variant = "primary", className = "", ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ErrorMessage({ error }) {
  return error ? <div className="notice notice-error">{error}</div> : null;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "PARTICIPANT" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(form) });
      onAuthenticated(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-hero">
        <div className="brand"><span>Q</span> Quizora</div>
        <div className="hero-copy">
          <div className="eyebrow">Квизы в реальном времени</div>
          <h1>Соберите друзей.<br />Задайте вопрос.<br /><em>Узнайте победителя.</em></h1>
          <p>Создавайте интерактивные игры, подключайтесь по коду и следите за лидербордом в прямом эфире.</p>
        </div>
        <div className="feature-row">
          <span>⚡ Мгновенные ответы</span><span>🏆 Живой рейтинг</span><span>∞ Любые темы</span>
        </div>
      </section>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="mobile-brand brand"><span>Q</span> Quizora</div>
          <p className="eyebrow">Добро пожаловать</p>
          <h2>{mode === "login" ? "Войдите в аккаунт" : "Создайте аккаунт"}</h2>
          <p className="muted">{mode === "login" ? "Продолжите игру или создайте новый квиз" : "Это займёт меньше минуты"}</p>
          <ErrorMessage error={error} />
          {mode === "register" && (
            <>
              <Field label="Ваше имя"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Алексей" required /></Field>
              <Field label="Роль">
                <div className="role-switch">
                  <button type="button" className={form.role === "PARTICIPANT" ? "active" : ""} onClick={() => setForm({ ...form, role: "PARTICIPANT" })}>Участник</button>
                  <button type="button" className={form.role === "ORGANIZER" ? "active" : ""} onClick={() => setForm({ ...form, role: "ORGANIZER" })}>Организатор</button>
                </div>
              </Field>
            </>
          )}
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required /></Field>
          <Field label="Пароль"><input type="password" minLength="6" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Минимум 6 символов" required /></Field>
          <Button type="submit" disabled={loading}>{loading ? "Подождите…" : mode === "login" ? "Войти" : "Зарегистрироваться"}</Button>
          <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
          </button>
          <div className="demo-hint">Демо: organizer@quizora.local или player@quizora.local · пароль quiz123</div>
        </form>
      </section>
    </main>
  );
}

function AppShell({ user, onLogout, children, page, setPage }) {
  const organizer = user.role === "ORGANIZER";
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span>Q</span> Quizora</div>
        <nav>
          <button className={page === "main" ? "active" : ""} onClick={() => setPage("main")}>{organizer ? "Мои квизы" : "Играть"}</button>
          <button className={page === "history" ? "active" : ""} onClick={() => setPage("history")}>История</button>
        </nav>
        <div className="user-menu">
          <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
          <div><strong>{user.name}</strong><small>{organizer ? "Организатор" : "Участник"}</small></div>
          <button className="icon-button" onClick={onLogout} title="Выйти">↪</button>
        </div>
      </header>
      {children}
    </div>
  );
}

function QuizCreate({ onCreated, onCancel }) {
  const [form, setForm] = useState(emptyQuiz);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    try {
      const data = await api("/quizzes", { method: "POST", body: JSON.stringify(form) });
      onCreated(data.quiz);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-title"><div><p className="eyebrow">Новый проект</p><h2>Создание квиза</h2></div><button type="button" className="icon-button" onClick={onCancel}>×</button></div>
        <ErrorMessage error={error} />
        <Field label="Название"><input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Например, Космическая разминка" required /></Field>
        <div className="form-grid">
          <Field label="Категория"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label="Время на вопрос"><select value={form.questionTime} onChange={(e) => setForm({ ...form, questionTime: Number(e.target.value) })}><option value="10">10 секунд</option><option value="20">20 секунд</option><option value="30">30 секунд</option><option value="60">60 секунд</option></select></Field>
        </div>
        <Field label="Описание"><textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="О чём этот квиз?" /></Field>
        <div className="modal-actions"><Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button><Button type="submit">Создать квиз</Button></div>
      </form>
    </div>
  );
}

function QuestionForm({ quizId, onUpdated, onCancel }) {
  const [text, setText] = useState("");
  const [type, setType] = useState("SINGLE");
  const [options, setOptions] = useState(["", ""]);
  const [correct, setCorrect] = useState([]);
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function markCorrect(index) {
    setCorrect(type === "SINGLE" ? [index] : correct.includes(index) ? correct.filter((item) => item !== index) : [...correct, index]);
  }

  function changeType(nextType) {
    setType(nextType);
    if (nextType === "SINGLE" && correct.length > 1) setCorrect(correct.slice(0, 1));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      let imageUrl = null;
      if (image) imageUrl = (await uploadImage(image)).url;
      const data = await api(`/quizzes/${quizId}/questions`, {
        method: "POST",
        body: JSON.stringify({ text, type, options, correctAnswers: correct, imageUrl })
      });
      onUpdated(data.quiz);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="question-form" onSubmit={submit}>
      <div className="section-heading"><div><p className="eyebrow">Новый вопрос</p><h3>Добавьте задание</h3></div><button type="button" className="icon-button" onClick={onCancel}>×</button></div>
      <ErrorMessage error={error} />
      <Field label="Формулировка"><textarea rows="3" value={text} onChange={(e) => setText(e.target.value)} placeholder="Введите вопрос…" required /></Field>
      <div className="question-toolbar">
        <div className="segmented"><button type="button" className={type === "SINGLE" ? "active" : ""} onClick={() => changeType("SINGLE")}>Один ответ</button><button type="button" className={type === "MULTIPLE" ? "active" : ""} onClick={() => changeType("MULTIPLE")}>Несколько</button></div>
        <label className="upload-control">＋ Изображение<input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)} /></label>
      </div>
      {image && <div className="file-pill">🖼 {image.name}<button type="button" onClick={() => setImage(null)}>×</button></div>}
      <div className="options-editor">
        {options.map((option, index) => (
          <div className={`option-edit ${correct.includes(index) ? "correct" : ""}`} key={index}>
            <button type="button" className="correct-toggle" onClick={() => markCorrect(index)} title="Отметить правильным">{correct.includes(index) ? "✓" : index + 1}</button>
            <input value={option} onChange={(e) => setOptions(options.map((item, itemIndex) => itemIndex === index ? e.target.value : item))} placeholder={`Вариант ${index + 1}`} required />
            {options.length > 2 && <button type="button" className="remove-option" onClick={() => { setOptions(options.filter((_, itemIndex) => itemIndex !== index)); setCorrect(correct.filter((item) => item !== index).map((item) => item > index ? item - 1 : item)); }}>×</button>}
          </div>
        ))}
      </div>
      {options.length < 8 && <button type="button" className="add-option" onClick={() => setOptions([...options, ""])}>＋ Добавить вариант</button>}
      <p className="form-tip">Нажмите на номер варианта, чтобы отметить правильный ответ.</p>
      <div className="modal-actions"><Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button><Button type="submit" disabled={saving}>{saving ? "Сохраняю…" : "Добавить вопрос"}</Button></div>
    </form>
  );
}

function QuizEditor({ quiz: initialQuiz, onBack, onChanged, onLaunch }) {
  const [quiz, setQuiz] = useState(initialQuiz);
  const [form, setForm] = useState(initialQuiz);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  function updateQuiz(nextQuiz) {
    setQuiz(nextQuiz);
    setForm(nextQuiz);
    setAdding(false);
    onChanged(nextQuiz);
  }

  async function saveSettings(event) {
    event.preventDefault();
    try {
      const data = await api(`/quizzes/${quiz.id}`, { method: "PUT", body: JSON.stringify(form) });
      updateQuiz(data.quiz);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function removeQuestion(questionId) {
    const data = await api(`/quizzes/${quiz.id}/questions/${questionId}`, { method: "DELETE" });
    updateQuiz(data.quiz);
  }

  return (
    <main className="page narrow-page">
      <button className="back-button" onClick={onBack}>← Все квизы</button>
      <div className="editor-header">
        <div><span className="category-chip">{quiz.category}</span><h1>{quiz.title}</h1><p>{quiz.description || "Добавьте описание, чтобы участники знали тему."}</p></div>
        <Button onClick={() => onLaunch(quiz.id)} disabled={!quiz.questions.length}>▶ Запустить</Button>
      </div>
      <div className="editor-grid">
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">Содержание</p><h2>Вопросы <span>{quiz.questions.length}</span></h2></div>{!adding && <Button variant="secondary" onClick={() => setAdding(true)}>＋ Вопрос</Button>}</div>
          {adding && <QuestionForm quizId={quiz.id} onUpdated={updateQuiz} onCancel={() => setAdding(false)} />}
          {!quiz.questions.length && !adding && <div className="empty-state"><div>?</div><h3>Пока нет вопросов</h3><p>Добавьте первое задание для будущей игры.</p><Button onClick={() => setAdding(true)}>Добавить вопрос</Button></div>}
          <div className="question-list">
            {quiz.questions.map((question, index) => (
              <article className="question-card" key={question.id}>
                <div className="question-number">{String(index + 1).padStart(2, "0")}</div>
                <div className="question-body">
                  <div className="question-meta"><span>{question.type === "MULTIPLE" ? "Несколько ответов" : "Один ответ"}</span>{question.imageUrl && <span>С изображением</span>}</div>
                  <h3>{question.text}</h3>
                  <div className="answer-preview">{question.options.map((option, optionIndex) => <span className={question.correctAnswers.includes(optionIndex) ? "right" : ""} key={optionIndex}>{question.correctAnswers.includes(optionIndex) && "✓ "}{option}</span>)}</div>
                </div>
                <button className="icon-button danger" onClick={() => removeQuestion(question.id)} title="Удалить">×</button>
              </article>
            ))}
          </div>
        </section>
        <form className="panel settings-panel" onSubmit={saveSettings}>
          <div><p className="eyebrow">Параметры</p><h2>Настройки</h2></div>
          <ErrorMessage error={error} />
          <Field label="Название"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Категория"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label="Описание"><textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Правила"><textarea rows="3" value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="Секунд"><input type="number" min="5" max="120" value={form.questionTime} onChange={(e) => setForm({ ...form, questionTime: Number(e.target.value) })} /></Field>
            <Field label="Баллов"><input type="number" min="100" max="10000" value={form.pointsPerQuestion} onChange={(e) => setForm({ ...form, pointsPerQuestion: Number(e.target.value) })} /></Field>
          </div>
          <Button type="submit" variant="secondary">Сохранить настройки</Button>
        </form>
      </div>
    </main>
  );
}

function OrganizerDashboard({ socket, onLiveRoom }) {
  const [quizzes, setQuizzes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api("/quizzes").then((data) => setQuizzes(data.quizzes)).catch((e) => setError(e.message)); }, []);

  async function openQuiz(id) {
    try { setSelected((await api(`/quizzes/${id}`)).quiz); } catch (requestError) { setError(requestError.message); }
  }

  function launch(quizId) {
    socket.emit("host:create", { quizId }, (result) => {
      if (result.error) return setError(result.error);
      onLiveRoom({ role: "host", ...result.room });
    });
  }

  if (selected) return <QuizEditor quiz={selected} onBack={() => setSelected(null)} onChanged={(updated) => { setSelected(updated); setQuizzes(quizzes.map((quiz) => quiz.id === updated.id ? updated : quiz)); }} onLaunch={launch} />;

  return (
    <main className="page">
      <div className="page-title"><div><p className="eyebrow">Панель организатора</p><h1>Ваши квизы</h1><p>Создавайте игры и запускайте их для своей аудитории.</p></div><Button onClick={() => setCreating(true)}>＋ Создать квиз</Button></div>
      <ErrorMessage error={error} />
      {!quizzes.length ? <div className="empty-state big-empty"><div>✦</div><h2>Создайте свой первый квиз</h2><p>Вопросы, таймер и живой лидерборд уже готовы.</p><Button onClick={() => setCreating(true)}>Начать</Button></div> : (
        <div className="quiz-grid">
          {quizzes.map((quiz, index) => (
            <article className={`quiz-tile accent-${index % 4}`} key={quiz.id} onClick={() => openQuiz(quiz.id)}>
              <div className="tile-top"><span>{quiz.category}</span><span className="tile-arrow">↗</span></div>
              <div><h2>{quiz.title}</h2><p>{quiz.description || "Квиз без описания"}</p></div>
              <div className="tile-stats"><span><strong>{quiz.questionCount}</strong> вопросов</span><span><strong>{quiz.questionTime}</strong> сек.</span></div>
            </article>
          ))}
        </div>
      )}
      {creating && <QuizCreate onCancel={() => setCreating(false)} onCreated={(quiz) => { setCreating(false); setQuizzes([quiz, ...quizzes]); setSelected(quiz); }} />}
    </main>
  );
}

function Countdown({ endsAt }) {
  const [seconds, setSeconds] = useState(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 250);
    return () => clearInterval(timer);
  }, [endsAt]);
  return <div className={`countdown ${seconds <= 5 ? "urgent" : ""}`}>{seconds}</div>;
}

function Leaderboard({ rows = [], currentUserId }) {
  if (!rows.length) return <p className="muted">Баллы появятся после первого вопроса.</p>;
  return (
    <div className="leaderboard">
      {rows.map((row) => <div className={row.userId === currentUserId ? "current" : ""} key={row.userId}><span className={`rank rank-${row.rank}`}>{row.rank}</span><strong>{row.name}</strong><span>{row.score.toLocaleString("ru-RU")}</span></div>)}
    </div>
  );
}

function HostRoom({ socket, room, onExit }) {
  const [state, setState] = useState(room);
  const [question, setQuestion] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [answerCount, setAnswerCount] = useState(0);
  const [closed, setClosed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onState = (next) => setState(next);
    const onQuestion = (next) => { setQuestion(next); setClosed(false); setAnswerCount(0); };
    const onClosed = (data) => { setClosed(true); setLeaderboard(data.leaderboard); };
    const onFinished = (data) => { setFinished(true); setLeaderboard(data.leaderboard); };
    const onCount = (data) => setAnswerCount(data.count);
    socket.on("room:state", onState);
    socket.on("quiz:question", onQuestion);
    socket.on("quiz:question-closed", onClosed);
    socket.on("quiz:finished", onFinished);
    socket.on("room:answer-count", onCount);
    return () => { socket.off("room:state", onState); socket.off("quiz:question", onQuestion); socket.off("quiz:question-closed", onClosed); socket.off("quiz:finished", onFinished); socket.off("room:answer-count", onCount); };
  }, [socket]);

  function emit(event) {
    socket.emit(event, { code: state.code }, (result) => result?.error && setError(result.error));
  }

  if (finished) return <main className="live-stage"><div className="results-card"><div className="trophy">🏆</div><p className="eyebrow">Квиз завершён</p><h1>Финальный рейтинг</h1><Leaderboard rows={leaderboard} /><Button onClick={onExit}>Вернуться к квизам</Button></div></main>;

  return (
    <main className="live-stage host-stage">
      <div className="live-top"><div className="brand light"><span>Q</span> Quizora live</div><div className="room-code-small">Код <strong>{state.code}</strong></div><Button variant="danger" onClick={() => emit("host:finish")}>Завершить</Button></div>
      <ErrorMessage error={error} />
      {!question ? (
        <section className="lobby-card">
          <p className="eyebrow">Комната готова</p><h1>Код подключения</h1><div className="big-code">{state.code}</div><p>Участники вводят код на главном экране.</p>
          <div className="players"><strong>В комнате: {state.players?.length || 0}</strong>{state.players?.map((player) => <span key={player.id}>{player.name}</span>)}</div>
          <Button onClick={() => emit("host:start")} disabled={!state.players?.length}>Начать квиз</Button>
        </section>
      ) : (
        <div className="host-live-grid">
          <section className="live-question-card">
            <div className="question-live-head"><span>Вопрос {question.index + 1} / {question.total}</span><Countdown endsAt={question.endsAt} /></div>
            {question.imageUrl && <img src={question.imageUrl} alt="Иллюстрация к вопросу" />}
            <h1>{question.text}</h1>
            <div className="live-options">{question.options.map((option, index) => <div key={index}><span>{String.fromCharCode(65 + index)}</span>{option}</div>)}</div>
          </section>
          <aside className="live-sidebar">
            <div className="answer-meter"><span>Ответили</span><strong>{answerCount} / {state.players?.length || 0}</strong><div><i style={{ width: `${state.players?.length ? Math.min(100, answerCount / state.players.length * 100) : 0}%` }} /></div></div>
            <h3>Лидерборд</h3><Leaderboard rows={leaderboard} />
            {closed ? <Button onClick={() => emit("host:next")}>{question.index + 1 === question.total ? "Показать результаты" : "Следующий вопрос →"}</Button> : <Button variant="secondary" onClick={() => emit("host:next")}>Закрыть и продолжить</Button>}
          </aside>
        </div>
      )}
    </main>
  );
}

function PlayerRoom({ socket, room, user, onExit }) {
  const [state, setState] = useState(room);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [closed, setClosed] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const onState = (next) => setState(next);
    const onQuestion = (next) => { setQuestion(next); setSelected([]); setSubmitted(Boolean(next.alreadyAnswered)); setMessage(next.alreadyAnswered ? "Ваш ответ уже принят" : ""); setClosed(false); };
    const onClosed = (data) => { setClosed(true); setLeaderboard(data.leaderboard); };
    const onFinished = (data) => { setFinished(true); setLeaderboard(data.leaderboard); };
    socket.on("room:state", onState); socket.on("quiz:question", onQuestion); socket.on("quiz:question-closed", onClosed); socket.on("quiz:finished", onFinished);
    return () => { socket.off("room:state", onState); socket.off("quiz:question", onQuestion); socket.off("quiz:question-closed", onClosed); socket.off("quiz:finished", onFinished); };
  }, [socket]);

  function toggle(index) {
    if (submitted || closed) return;
    setSelected(question.type === "SINGLE" ? [index] : selected.includes(index) ? selected.filter((item) => item !== index) : [...selected, index]);
  }

  function answer() {
    socket.emit("player:answer", { code: state.code, questionId: question.id, answers: selected }, (result) => {
      if (result.error) return setMessage(result.error);
      setSubmitted(true);
      setMessage(`Ответ принят${result.points ? ` · +${result.points} баллов` : ""}`);
    });
  }

  if (finished) {
    const own = leaderboard.find((row) => row.userId === user.id);
    return <main className="live-stage"><div className="results-card"><div className="trophy">{own?.rank === 1 ? "🏆" : "✨"}</div><p className="eyebrow">Игра окончена</p><h1>{own ? `${own.rank}-е место` : "Результаты"}</h1><p className="result-score">{own?.score || 0} баллов</p><Leaderboard rows={leaderboard} currentUserId={user.id} /><Button onClick={onExit}>На главную</Button></div></main>;
  }

  if (!question) return <main className="live-stage"><section className="waiting-card"><div className="pulse-logo">Q</div><p className="eyebrow">Вы в игре</p><h1>{state.title}</h1><p>Ждём, когда организатор запустит первый вопрос.</p><div className="participant-list">Участников: <strong>{state.players?.length || 0}</strong></div></section></main>;

  return (
    <main className="live-stage player-stage">
      <div className="player-live-head"><span>Вопрос {question.index + 1} из {question.total}</span><Countdown endsAt={question.endsAt} /></div>
      <section className="player-question">
        {question.imageUrl && <img src={question.imageUrl} alt="Иллюстрация к вопросу" />}
        <h1>{question.text}</h1>
        {question.type === "MULTIPLE" && <p className="muted">Можно выбрать несколько вариантов</p>}
        <div className="player-options">{question.options.map((option, index) => <button className={selected.includes(index) ? "selected" : ""} disabled={submitted || closed} onClick={() => toggle(index)} key={index}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>
        {message && <div className={`answer-message ${submitted ? "success" : ""}`}>{message}</div>}
        {!closed && <Button className="answer-button" onClick={answer} disabled={!selected.length || submitted}>{submitted ? "Ответ принят ✓" : "Ответить"}</Button>}
        {closed && <div className="round-results"><p className="eyebrow">Промежуточный рейтинг</p><Leaderboard rows={leaderboard} currentUserId={user.id} /><p className="muted center">Следующий вопрос скоро появится</p></div>}
      </section>
    </main>
  );
}

function ParticipantHome({ socket, onLiveRoom }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  function join(event) {
    event.preventDefault();
    setJoining(true); setError("");
    socket.emit("player:join", { code }, (result) => {
      setJoining(false);
      if (result.error) return setError(result.error);
      onLiveRoom({ role: "player", ...result.room });
    });
  }

  return (
    <main className="join-page">
      <div className="join-art"><div className="orb orb-one" /><div className="orb orb-two" /><div className="join-symbol">?</div></div>
      <form className="join-card" onSubmit={join}>
        <p className="eyebrow">Готовы играть?</p><h1>Войдите в квиз</h1><p>Получите шестизначный код у организатора.</p>
        <ErrorMessage error={error} />
        <input className="code-input" inputMode="numeric" maxLength="6" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000 000" aria-label="Код комнаты" />
        <Button type="submit" disabled={code.length !== 6 || joining}>{joining ? "Подключаем…" : "Присоединиться →"}</Button>
      </form>
    </main>
  );
}

function History({ user }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api("/history").then((data) => setSessions(data.sessions)).catch((e) => setError(e.message)); }, []);
  return (
    <main className="page narrow-page">
      <div className="page-title"><div><p className="eyebrow">Архив</p><h1>История игр</h1><p>{user.role === "ORGANIZER" ? "Проведённые вами игровые сессии." : "Квизы, в которых вы участвовали."}</p></div></div>
      <ErrorMessage error={error} />
      {!sessions.length ? <div className="empty-state big-empty"><div>◷</div><h2>История пока пуста</h2><p>Завершённые игры появятся здесь.</p></div> : <div className="history-list">{sessions.map((session) => <article key={session.id}><div className="history-icon">Q</div><div><h3>{session.title}</h3><p>Комната {session.room_code} · {session.started_at ? new Date(`${session.started_at}Z`).toLocaleDateString("ru-RU") : "не запускалась"}</p></div><div className="history-result">{user.role === "ORGANIZER" ? <><strong>{session.player_count}</strong><span>участников{session.winner && ` · победитель ${session.winner}`}</span></> : <><strong>{session.score}</strong><span>баллов · верных {session.correct_count}</span></>}</div><span className={`status status-${session.status.toLowerCase()}`}>{session.status === "FINISHED" ? "Завершён" : session.status === "ACTIVE" ? "Идёт" : "Лобби"}</span></article>)}</div>}
    </main>
  );
}

export default function App() {
  const [token, setToken] = useState(getToken());
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(token));
  const [page, setPage] = useState("main");
  const [liveRoom, setLiveRoom] = useState(null);

  const socket = useMemo(() => token ? createQuizSocket(token) : null, [token]);

  useEffect(() => {
    if (!token) return;
    api("/auth/me").then((data) => setUser(data.user)).catch(() => { saveToken(null); setToken(null); }).finally(() => setChecking(false));
  }, [token]);

  useEffect(() => () => socket?.disconnect(), [socket]);

  function authenticated(data) {
    saveToken(data.token); setToken(data.token); setUser(data.user); setChecking(false);
  }

  function logout() {
    socket?.disconnect(); saveToken(null); setToken(null); setUser(null); setLiveRoom(null); setPage("main");
  }

  if (checking) return <div className="loading-screen"><div className="pulse-logo">Q</div></div>;
  if (!user) return <AuthScreen onAuthenticated={authenticated} />;
  if (liveRoom?.role === "host") return <HostRoom socket={socket} room={liveRoom} onExit={() => setLiveRoom(null)} />;
  if (liveRoom?.role === "player") return <PlayerRoom socket={socket} room={liveRoom} user={user} onExit={() => setLiveRoom(null)} />;

  return (
    <AppShell user={user} onLogout={logout} page={page} setPage={setPage}>
      {page === "history" ? <History user={user} /> : user.role === "ORGANIZER" ? <OrganizerDashboard socket={socket} onLiveRoom={setLiveRoom} /> : <ParticipantHome socket={socket} onLiveRoom={setLiveRoom} />}
    </AppShell>
  );
}
