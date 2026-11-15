(function () {
  const cfg = window.LAMP_CONFIG || {};
  const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js";
  const TABLE = "lamp_state";

  let hooks = null;
  let client = null;
  let user = null;
  let meta = { uid: "", rev: 0, dirty: false };
  let lastJson = null;
  let timer = 0;
  let pushing = false;
  let again = false;
  let applying = false;
  let lastPush = 0;
  let lastPull = 0;
  let conflict = null;
  const view = { phase: "off", error: "", at: "", recovery: false };

  function configured() {
    return !!(cfg.supabaseUrl && cfg.supabaseKey);
  }

  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).filter((key) => value[key] !== undefined).sort()
        .map((key) => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function metaKey() { return hooks.key + ":sync"; }

  function readMeta() {
    try {
      const saved = JSON.parse(localStorage.getItem(metaKey()) || "null");
      if (saved) meta = Object.assign(meta, saved);
    } catch (err) { /* keep defaults */ }
  }

  function saveMeta() {
    localStorage.setItem(metaKey(), JSON.stringify(meta));
  }

  function clock() {
    const now = new Date();
    return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  function set(phase, error) {
    view.phase = phase;
    view.error = error || "";
    if (phase === "saved") view.at = clock();
    if (hooks) hooks.status();
  }

  function words(err) {
    const text = String((err && (err.message || err.error_description)) || err || "");
    if (/rate limit|429|too many/i.test(text)) return "요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요.";
    if (/invalid login credentials/i.test(text)) return "이메일 또는 비밀번호가 맞지 않습니다. 처음이라면 가입하기를 눌러 주세요.";
    if (/already registered|already exists/i.test(text)) return "이미 가입된 이메일입니다. 로그인을 눌러 주세요.";
    if (/email not confirmed/i.test(text)) return "가입 확인 메일의 링크를 먼저 눌러 주세요.";
    if (/password.*(at least|characters|weak)|weak.*password/i.test(text)) return "비밀번호를 6자 이상, 더 복잡하게 정해 주세요.";
    if (/valid email|email address.*invalid/i.test(text)) return "이메일 주소를 확인해 주세요.";
    if (/expired|invalid|otp|token/i.test(text)) return "링크가 맞지 않거나 시간이 지났습니다. 다시 요청해 주세요.";
    if (/fetch|network|load failed/i.test(text)) return "서버에 닿지 못했습니다. 인터넷 연결을 확인해 주세요.";
    if (/relation|does not exist|schema cache/i.test(text)) return "서버에 기록 표가 아직 없습니다. 설정 SQL을 실행해 주세요.";
    if (/row-level security|permission/i.test(text)) return "서버가 저장을 막았습니다. 표의 보안 정책을 확인해 주세요.";
    return text || "알 수 없는 문제가 생겼습니다.";
  }

  function fail(err) {
    pushing = false;
    set(navigator.onLine === false ? "offline" : "error", words(err));
  }

  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = LIB;
      tag.onload = () => (window.supabase && window.supabase.createClient ? resolve() : reject(new Error("load failed")));
      tag.onerror = () => reject(new Error("load failed"));
      document.head.appendChild(tag);
    });
  }

  function init(given) {
    hooks = given;
    if (!configured()) return;
    readMeta();
    lastJson = meta.dirty ? null : stable(hooks.read());
    view.phase = "loading";
    loadLib().then(start, (err) => fail(err));
    document.addEventListener("visibilitychange", () => {
      if (!user) return;
      if (document.visibilityState === "hidden") flush();
      else if (Date.now() - lastPull > 20000) pull();
    });
    window.addEventListener("online", () => { if (user) pull(); });
    window.addEventListener("pagehide", flush);
  }

  function start() {
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: hooks.key + ":auth" }
    });
    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") view.recovery = true;
      setTimeout(() => signedIn(session ? session.user : null), 0);
    });
  }

  function signedIn(next) {
    if (!next) {
      user = null;
      conflict = null;
      set("signed-out");
      return;
    }
    const same = user && user.id === next.id;
    user = next;
    if (same) return;
    if (meta.uid !== next.id) {
      meta = { uid: next.id, rev: 0, dirty: true };
      lastJson = null;
      saveMeta();
    }
    set("loading");
    pull();
  }

  function dirtyNow() {
    return meta.dirty || stable(hooks.read()) !== lastJson;
  }

  async function pull() {
    if (!user || !client) return;
    if (pushing) { again = true; return; }
    lastPull = Date.now();
    if (navigator.onLine === false) return set("offline");
    let res;
    try {
      res = await client.from(TABLE).select("state, rev, updated_at").eq("user_id", user.id).maybeSingle();
    } catch (err) {
      return fail(err);
    }
    if (res.error) return fail(res.error);
    const remote = res.data;
    if (!remote) {
      meta.rev = 0;
      meta.dirty = true;
      saveMeta();
      return push();
    }
    if (remote.rev === meta.rev) return dirtyNow() ? push() : set("saved");
    const local = hooks.read();
    if (!dirtyNow() || stable(remote.state) === stable(local) || (meta.rev === 0 && !hooks.meaningful(local))) return adopt(remote);
    conflict = { remote, local };
    set("conflict");
  }

  function adopt(remote) {
    conflict = null;
    applying = true;
    try {
      hooks.apply(remote.state);
    } finally {
      applying = false;
    }
    lastJson = stable(hooks.read());
    meta.rev = remote.rev;
    meta.dirty = false;
    saveMeta();
    set("saved");
  }

  async function push() {
    clearTimeout(timer);
    timer = 0;
    if (!user || !client || conflict) return;
    if (pushing) { again = true; return; }
    if (navigator.onLine === false) return set("offline");
    pushing = true;
    set("saving");
    const local = hooks.read();
    const json = stable(local);
    let res;
    try {
      res = meta.rev === 0
        ? await client.from(TABLE).insert({ user_id: user.id, state: local, rev: 1 }).select("rev").maybeSingle()
        : await client.from(TABLE).update({ state: local, rev: meta.rev + 1 }).eq("user_id", user.id).eq("rev", meta.rev).select("rev").maybeSingle();
    } catch (err) {
      return fail(err);
    }
    pushing = false;
    lastPush = Date.now();
    if (res.error && res.error.code !== "23505") return fail(res.error);
    if (res.error || !res.data) return pull();
    meta.rev = res.data.rev;
    lastJson = json;
    meta.dirty = stable(hooks.read()) !== json;
    saveMeta();
    set("saved");
    if (meta.dirty || again) {
      again = false;
      schedule();
    }
  }

  function schedule() {
    if (timer) return;
    const wait = Math.max(3000, 15000 - (Date.now() - lastPush));
    timer = setTimeout(() => { timer = 0; push(); }, wait);
  }

  function flush() {
    if (user && !conflict && dirtyNow()) push();
  }

  function touched() {
    if (!hooks || !configured() || applying) return;
    if (stable(hooks.read()) === lastJson) return;
    if (!meta.dirty) {
      meta.dirty = true;
      saveMeta();
    }
    if (user && !conflict) schedule();
  }

  function resolve(side) {
    if (!conflict) return;
    const { remote, local } = conflict;
    const loser = side === "remote" ? local : remote.state;
    try {
      localStorage.setItem(hooks.key + ":backup", JSON.stringify({ savedAt: new Date().toISOString(), state: loser }));
    } catch (err) { /* backup is best effort */ }
    if (side === "remote") return adopt(remote);
    conflict = null;
    meta.rev = remote.rev;
    meta.dirty = true;
    saveMeta();
    push();
  }

  function ready() {
    if (!client) throw new Error("동기화 도구를 아직 불러오는 중입니다. 잠시 뒤 다시 눌러 주세요.");
  }

  async function signIn(email, password) {
    ready();
    const res = await client.auth.signInWithPassword({ email, password });
    if (res.error) throw new Error(words(res.error));
  }

  async function signUp(email, password) {
    ready();
    const res = await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (res.error) throw new Error(words(res.error));
    if (res.data && res.data.user && Array.isArray(res.data.user.identities) && !res.data.user.identities.length) {
      throw new Error("이미 가입된 이메일입니다. 로그인을 눌러 주세요.");
    }
    return !res.data.session;
  }

  async function forgot(email) {
    ready();
    const res = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (res.error) throw new Error(words(res.error));
  }

  async function newPassword(password) {
    ready();
    const res = await client.auth.updateUser({ password });
    if (res.error) throw new Error(words(res.error));
    view.recovery = false;
  }

  async function signOut(force) {
    if (!client) return;
    if (user && !conflict && dirtyNow()) await push();
    if (!force && user && (conflict || dirtyNow())) {
      const err = new Error("unsaved");
      err.unsaved = true;
      throw err;
    }
    const res = await client.auth.signOut({ scope: "local" });
    if (res && res.error) throw res.error;
    clearTimeout(timer);
    timer = 0;
    conflict = null;
    lastJson = null;
    meta = { uid: "", rev: 0, dirty: false };
    saveMeta();
  }

  function status() {
    return {
      configured: configured(),
      phase: view.phase,
      error: view.error,
      at: view.at,
      recovery: !!(view.recovery && user),
      email: user ? user.email : "",
      signedIn: !!user,
      conflict
    };
  }

  window.LampSync = { init, touched, pull, resolve, signIn, signUp, forgot, newPassword, signOut, status, stable };
})();
