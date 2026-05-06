import { useState, useEffect, useCallback, useRef } from "react";

const DRINK_KEYS = ["water", "tea", "coffee"];
const DRINK_EMOJI = { water: "💧", tea: "🍵", coffee: "☕" };
const DRINK_LABEL = { water: "ÁGUA", tea: "CHÁ", coffee: "CAFÉ" };

const fmt = (ms) => {
  if (!ms || ms < 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((v) => String(v).padStart(2, "0")).join(":");
};

const calcScore = (ms, steps, trained) => {
  if (!ms || ms < 0) return 0;
  return Math.floor((ms / 3600000) * 10) + Math.floor((steps || 0) / 1000) + (trained ? 15 : 0);
};

const stepsColor = (n) => !n ? "#aaa" : n >= 10000 ? "#00a854" : n >= 7500 ? "#e6a817" : "#e07000";
const fmtSteps = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n || 0);
const statusColor = (f) => f ? "#00a854" : "#ff4757";

// Get today's date key in Lisbon time: "2026-05-06"
const getLisbonDateKey = () => {
  return new Date().toLocaleDateString("pt-PT", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).split("/").reverse().join("-"); // dd/mm/yyyy -> yyyy-mm-dd
};

const blank = () => ({
  fastStart: null, fastEnd: null,
  drinks: { water: 0, tea: 0, coffee: 0 },
  steps: 0, trained: false,
  dateKey: getLisbonDateKey(),
});

// Safe storage
const memoryStore = {};
const safeGet = async (key, shared = false) => {
  try {
    if (window.storage) {
      const r = await window.storage.get(key, shared);
      return r?.value ?? null;
    }
  } catch {}
  return memoryStore[key] ?? null;
};
const safeSet = async (key, value, shared = false) => {
  memoryStore[key] = value;
  try {
    if (window.storage) await window.storage.set(key, value, shared);
  } catch {}
};

export default function App() {
  const [members, setMembers] = useState({});
  const [history, setHistory] = useState({}); // { "yyyy-mm-dd": { name: score, ... } }
  const [myName, setMyName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState("table"); // "table" | "profile" | "ranking"
  const [stepsInput, setStepsInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [storageStatus, setStorageStatus] = useState("checking");
  const [lisboaTime, setLisboaTime] = useState("");
  const membersRef = useRef({});
  const historyRef = useRef({});
  const lastDateRef = useRef(getLisbonDateKey());

  // Clock + midnight check
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      const t = new Date().toLocaleTimeString("pt-PT", {
        timeZone: "Europe/Lisbon",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      setLisboaTime(t);

      // Check if day changed
      const currentDate = getLisbonDateKey();
      if (currentDate !== lastDateRef.current) {
        lastDateRef.current = currentDate;
        handleMidnightReset(currentDate);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleMidnightReset = async (newDate) => {
    const current = { ...membersRef.current };
    const hist = { ...historyRef.current };

    // Save today's scores to history before resetting
    const prevDate = Object.keys(current)[0]
      ? (membersRef.current[Object.keys(current)[0]]?.dateKey)
      : null;

    if (prevDate && prevDate !== newDate) {
      const dayScores = {};
      Object.entries(current).forEach(([name, data]) => {
        const ms = data.fastStart && data.fastEnd
          ? data.fastEnd - data.fastStart
          : data.fastStart ? Date.now() - data.fastStart : null;
        dayScores[name] = calcScore(ms, data.steps, data.trained);
      });
      hist[prevDate] = dayScores;

      // Keep only last 30 days
      const keys = Object.keys(hist).sort().slice(-30);
      const trimmed = {};
      keys.forEach(k => { trimmed[k] = hist[k]; });
      historyRef.current = trimmed;
      await safeSet("daily_history_v1", JSON.stringify(trimmed), true);
    }

    // Reset all members for new day
    const reset = {};
    Object.keys(current).forEach(name => {
      reset[name] = { ...blank(), dateKey: newDate };
    });
    membersRef.current = reset;
    setMembers({ ...reset });
    await safeSet("daily_members_v2", JSON.stringify(reset), true);
  };

  const loadData = useCallback(async () => {
    try {
      const raw = await safeGet("daily_members_v2", true);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Check if stored data is from today, if not trigger reset
        const todayKey = getLisbonDateKey();
        const anyMember = Object.values(parsed)[0];
        if (anyMember && anyMember.dateKey && anyMember.dateKey !== todayKey) {
          // Data is stale — will be reset by midnight handler
        }
        membersRef.current = parsed;
        setMembers(parsed);
        setStorageStatus("ok");
      } else {
        setStorageStatus("local");
      }
    } catch { setStorageStatus("local"); }

    try {
      const rawHist = await safeGet("daily_history_v1", true);
      if (rawHist) {
        const parsed = JSON.parse(rawHist);
        historyRef.current = parsed;
        setHistory(parsed);
      }
    } catch {}

    try {
      const n = await safeGet("daily_myname");
      if (n) setMyName(n);
    } catch {}

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const t = setInterval(loadData, 8000);
    return () => clearInterval(t);
  }, [loadData]);

  const persistMembers = async (data) => {
    membersRef.current = data;
    setMembers({ ...data });
    await safeSet("daily_members_v2", JSON.stringify(data), true);
  };

  const handleJoin = async () => {
    const name = nameInput.trim();
    if (!name) return;
    const current = { ...membersRef.current };
    if (!current[name]) current[name] = blank();
    await persistMembers(current);
    await safeSet("daily_myname", name);
    setMyName(name);
    setNameInput("");
    setView("profile");
  };

  const patchMe = async (patch) => {
    const current = { ...membersRef.current };
    const base = current[myName] || blank();
    current[myName] = { ...base, ...patch };
    await persistMembers(current);
  };

  const toggleFast = async () => {
    const me = membersRef.current[myName] || blank();
    if (!me.fastStart || me.fastEnd) {
      await patchMe({ fastStart: Date.now(), fastEnd: null });
    } else {
      await patchMe({ fastEnd: Date.now() });
    }
  };

  const addDrink = async (key) => {
    const me = membersRef.current[myName] || blank();
    const drinks = { ...(me.drinks || {}), [key]: ((me.drinks || {})[key] || 0) + 1 };
    await patchMe({ drinks });
  };

  const removeDrink = async (key) => {
    const me = membersRef.current[myName] || blank();
    const drinks = { ...(me.drinks || {}), [key]: Math.max(0, ((me.drinks || {})[key] || 0) - 1) };
    await patchMe({ drinks });
  };

  const saveSteps = async (val) => {
    const v = val !== undefined ? val : parseInt(stepsInput, 10);
    if (!isNaN(v)) { await patchMe({ steps: v }); setStepsInput(""); }
  };

  const addSteps = async (n) => {
    const me = membersRef.current[myName] || blank();
    await patchMe({ steps: (me.steps || 0) + n });
  };

  const toggleTrained = async () => {
    const me = membersRef.current[myName] || blank();
    await patchMe({ trained: !me.trained });
  };

  // Compute 30-day leaderboard
  const leaderboard = (() => {
    const totals = {};
    Object.entries(history).forEach(([, dayScores]) => {
      Object.entries(dayScores).forEach(([name, score]) => {
        totals[name] = (totals[name] || 0) + score;
      });
    });
    // Also add today's live scores
    Object.entries(members).forEach(([name, data]) => {
      const ms = data.fastStart
        ? data.fastEnd ? data.fastEnd - data.fastStart : now - data.fastStart
        : null;
      const score = calcScore(ms, data.steps, data.trained);
      totals[name] = (totals[name] || 0) + score;
    });
    return Object.entries(totals).sort(([, a], [, b]) => b - a);
  })();

  const sorted = Object.entries(members).sort(([, a], [, b]) => {
    const msA = a.fastStart ? (a.fastEnd ? a.fastEnd - a.fastStart : now - a.fastStart) : null;
    const msB = b.fastStart ? (b.fastEnd ? b.fastEnd - b.fastStart : now - b.fastStart) : null;
    return calcScore(msB, b.steps, b.trained) - calcScore(msA, a.steps, a.trained);
  });

  const me = myName ? members[myName] : null;
  const isFasting = me?.fastStart && !me?.fastEnd;
  const fastMs = isFasting ? now - me.fastStart : me?.fastStart && me?.fastEnd ? me.fastEnd - me.fastStart : null;
  const myScore = calcScore(fastMs, me?.steps, me?.trained);

  // Days until midnight Lisbon
  const msUntilMidnight = (() => {
    const now2 = new Date();
    const lisbon = new Date(now2.toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
    const midnight = new Date(lisbon);
    midnight.setHours(24, 0, 0, 0);
    return midnight - lisbon;
  })();
  const untilMidnight = fmt(msUntilMidnight);

  if (loading) return (
    <div style={{ background: "#ffffff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#00a854", fontFamily: "monospace", fontSize: 16 }}>A carregar...</div>
    </div>
  );

  if (showSplash) return (
    <div style={{ background: "#ffffff", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono','Courier New',monospace", padding: "20px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap'); .splash-btn{cursor:pointer;border:none;outline:none;transition:all .2s;font-family:inherit} .splash-btn:active{transform:scale(.97)}`}</style>
      <svg width="100%" viewBox="0 0 680 480" role="img" xmlns="http://www.w3.org/2000/svg" style={{ maxWidth: 480, marginBottom: 32 }}>
        <title>Daily — Saúde, Energia, Felicidade</title>
        <circle cx="340" cy="250" r="310" fill="none" stroke="#f0f0f0" strokeWidth="1"/>
        <circle cx="340" cy="250" r="240" fill="none" stroke="#f5f5f5" strokeWidth="1"/>
        <circle cx="340" cy="250" r="170" fill="none" stroke="#f0f0f0" strokeWidth="1"/>
        <circle cx="148" cy="230" r="96" fill="#e8f7ee"/>
        <path d="M148 292 C96 258 84 220 84 203 C84 178 104 158 128 158 C140 158 148 166 148 166 C148 166 156 158 168 158 C192 158 212 178 212 203 C212 220 200 258 148 292Z" fill="#00a854"/>
        <ellipse cx="120" cy="188" rx="13" ry="9" fill="#ffffff" opacity="0.25" transform="rotate(-30 120 188)"/>
        <circle cx="340" cy="230" r="96" fill="#fff8e6"/>
        <polygon points="358,150 318,232 346,232 322,310 382,218 352,218" fill="#e6a817"/>
        <circle cx="532" cy="230" r="96" fill="#fff1ec"/>
        <circle cx="532" cy="230" r="38" fill="#f07030"/>
        <g stroke="#f07030" strokeWidth="5.5" strokeLinecap="round">
          <line x1="532" y1="172" x2="532" y2="158"/>
          <line x1="532" y1="288" x2="532" y2="302"/>
          <line x1="474" y1="230" x2="460" y2="230"/>
          <line x1="590" y1="230" x2="604" y2="230"/>
          <line x1="491" y1="189" x2="481" y2="179"/>
          <line x1="573" y1="271" x2="583" y2="281"/>
          <line x1="573" y1="189" x2="583" y2="179"/>
          <line x1="491" y1="271" x2="481" y2="281"/>
        </g>
        <circle cx="519" cy="218" r="9" fill="#ffffff" opacity="0.22"/>
        <circle cx="250" cy="230" r="5" fill="#ddd"/>
        <circle cx="263" cy="230" r="3" fill="#eee"/>
        <circle cx="417" cy="230" r="5" fill="#ddd"/>
        <circle cx="430" cy="230" r="3" fill="#eee"/>
        <text x="340" y="50" textAnchor="middle" fontFamily="'Syne','Arial Black',sans-serif" fontWeight="800" fontSize="18" fill="#00a854" letterSpacing="-0.5">⚡ DAILY</text>
        <line x1="200" y1="62" x2="480" y2="62" stroke="#e0e0e0" strokeWidth="1"/>
        <line x1="200" y1="380" x2="480" y2="380" stroke="#e0e0e0" strokeWidth="1"/>
        <text x="340" y="404" textAnchor="middle" fontFamily="'DM Mono','Courier New',monospace" fontSize="12" fill="#aaa" letterSpacing="3">O TEU GRUPO. O TEU RITMO.</text>
        <circle cx="80" cy="430" r="4" fill="#e8f7ee"/>
        <circle cx="95" cy="430" r="4" fill="#fff8e6"/>
        <circle cx="110" cy="430" r="4" fill="#fff1ec"/>
        <circle cx="570" cy="430" r="4" fill="#e8f7ee"/>
        <circle cx="585" cy="430" r="4" fill="#fff8e6"/>
        <circle cx="600" cy="430" r="4" fill="#fff1ec"/>
      </svg>
      <button className="splash-btn" onClick={() => setShowSplash(false)} style={{
        background: "#00a854", color: "#ffffff",
        borderRadius: 14, padding: "16px 48px",
        fontSize: 15, fontWeight: 700, letterSpacing: 2,
        boxShadow: "0 4px 20px rgba(0,168,84,0.25)",
      }}>
        ENTRAR
      </button>
      <div style={{ marginTop: 12, fontSize: 10, color: "#ccc", letterSpacing: 2 }}>JEJUM INTERMITENTE</div>
    </div>
  );

  const medalFor = (i) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

  return (
    <div style={{ background: "#ffffff", minHeight: "100vh", fontFamily: "'DM Mono','Courier New',monospace", color: "#111111", paddingBottom: 60 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#00a854;border-radius:2px}
        .btn{cursor:pointer;border:none;outline:none;transition:all .15s;font-family:inherit}
        .btn:active{transform:scale(.96)}
        .rh:hover{background:rgba(0,168,84,.05)!important}
        .pulse{animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,168,84,.4)}50%{box-shadow:0 0 0 8px rgba(0,168,84,0)}}
        .fi{animation:fi .35s ease}
        @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        input:focus{outline:none;border-color:#00a854!important}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
      `}</style>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid #e0e0e0", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: "#00a854", letterSpacing: -0.5 }}>⚡ DAILY</div>
          <div style={{ fontSize: 9, color: "#aaaaaa", letterSpacing: 2, marginTop: 1 }}>GRUPO DE JEJUM INTERMITENTE</div>
        </div>

        {/* Clock */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: "#111111", letterSpacing: 2 }}>{lisboaTime}</div>
          <div style={{ fontSize: 8, color: "#aaaaaa", letterSpacing: 2, marginTop: 1 }}>LISBOA · RESET {untilMidnight}</div>
        </div>

        {myName && (
          <div style={{ display: "flex", gap: 6 }}>
            {["table","profile","ranking"].map(v => (
              <button key={v} className="btn" onClick={() => setView(v)} style={{
                background: view === v ? "#00a854" : "transparent",
                color: view === v ? "#ffffff" : "#666666",
                border: "1px solid " + (view === v ? "#00a854" : "#e0e0e0"),
                borderRadius: 6, padding: "5px 10px", fontSize: 9, fontWeight: 600, letterSpacing: 1,
              }}>
                {v === "table" ? "HOJE" : v === "profile" ? "O MEU" : "🏆"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* JOIN */}
      {!myName ? (
        <div className="fi" style={{ maxWidth: 400, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 800, marginBottom: 8 }}>Quem és tu?</div>
          <div style={{ color: "#777777", fontSize: 13, marginBottom: 32 }}>Entra com o teu nome para registares o teu jejum</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleJoin()}
              placeholder="O teu nome..."
              style={{ flex: 1, background: "#f4f4f4", border: "1px solid #e0e0e0", borderRadius: 10, padding: "13px 16px", color: "#111111", fontSize: 16, fontFamily: "inherit" }} />
            <button className="btn" onClick={handleJoin} style={{ background: "#00a854", color: "#ffffff", borderRadius: 10, padding: "13px 20px", fontSize: 14, fontWeight: 800 }}>ENTRAR</button>
          </div>
          {Object.keys(members).length > 0 && (
            <div style={{ marginTop: 20, color: "#aaaaaa", fontSize: 11 }}>Já no grupo: {Object.keys(members).join(", ")}</div>
          )}
        </div>

      ) : view === "table" ? (
        /* TODAY TABLE */
        <div className="fi" style={{ padding: "20px 12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 4px" }}>
            <div style={{ fontSize: 10, color: "#aaaaaa", letterSpacing: 2 }}>HOJE · {getLisbonDateKey()}</div>
            <div style={{ fontSize: 10, color: "#aaaaaa" }}>reset em <span style={{ color: "#111", fontWeight: 700 }}>{untilMidnight}</span></div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
                  {["#","NOME","ESTADO","JEJUM","TEMPO","SCORE","💧","🍵","☕","👟","🏋️"].map(h => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: ["#","SCORE","💧","🍵","☕","👟","🏋️"].includes(h) ? "center" : "left", fontSize: 9, color: "#aaaaaa", letterSpacing: 1.5, fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(([name, data], i) => {
                  const fasting = data.fastStart && !data.fastEnd;
                  const ms = fasting ? now - data.fastStart : data.fastStart && data.fastEnd ? data.fastEnd - data.fastStart : null;
                  const score = calcScore(ms, data.steps, data.trained);
                  const isMe = name === myName;
                  const drinks = data.drinks || {};
                  const steps = data.steps || 0;
                  return (
                    <tr key={name} className="rh" style={{ borderBottom: "1px solid #eeeeee", background: isMe ? "rgba(0,168,84,.04)" : "transparent" }}>
                      <td style={{ padding: "12px 10px", textAlign: "center", fontSize: 13 }}>
                        {medalFor(i) || <span style={{ color: "#aaaaaa" }}>{i+1}</span>}
                      </td>
                      <td style={{ padding: "12px 10px", color: isMe ? "#00a854" : "#222222", fontWeight: isMe ? 700 : 400, fontSize: 13 }}>
                        {name}{isMe ? " ✦" : ""}
                      </td>
                      <td style={{ padding: "12px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div className={fasting ? "pulse" : ""} style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(fasting), flexShrink: 0 }} />
                          <span style={{ fontSize: 9, color: statusColor(fasting), letterSpacing: 1 }}>
                            {fasting ? "EM JEJUM" : data.fastStart && data.fastEnd ? "FEITO" : "—"}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: 10, color: "#777777" }}>
                        {data.fastStart
                          ? new Date(data.fastStart).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"}) +
                            (data.fastEnd ? " → " + new Date(data.fastEnd).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"}) : " → agora")
                          : "—"}
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: 13, color: fasting ? "#111111" : "#777777", letterSpacing: 1 }}>{ms ? fmt(ms) : "—"}</td>
                      <td style={{ padding: "12px 10px", textAlign: "center" }}>
                        <span style={{ background: score > 0 ? "rgba(0,168,84,.1)" : "transparent", color: score > 0 ? "#00a854" : "#aaaaaa", padding: "2px 8px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                          {score > 0 ? score : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "center", color: "#4ecdc4", fontSize: 13 }}>{drinks.water || "—"}</td>
                      <td style={{ padding: "12px 10px", textAlign: "center", color: "#27ae60", fontSize: 13 }}>{drinks.tea || "—"}</td>
                      <td style={{ padding: "12px 10px", textAlign: "center", color: "#d4a574", fontSize: 13 }}>{drinks.coffee || "—"}</td>
                      <td style={{ padding: "12px 10px", textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <span style={{ color: stepsColor(steps), fontSize: 12, fontWeight: steps >= 10000 ? 700 : 400 }}>{steps ? steps.toLocaleString("pt-PT") : "—"}</span>
                          {steps > 0 && <div style={{ width: 40, height: 2, background: "#e0e0e0", borderRadius: 1 }}><div style={{ width: Math.min(100,(steps/10000)*100)+"%", height: "100%", background: stepsColor(steps), borderRadius: 1 }} /></div>}
                        </div>
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "center", fontSize: 14 }}>{data.trained ? "✅" : <span style={{ color: "#e0e0e0" }}>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && <div style={{ textAlign: "center", padding: "50px 0", color: "#aaaaaa" }}>Ainda ninguém. Sê o primeiro!</div>}
        </div>

      ) : view === "ranking" ? (
        /* 30-DAY LEADERBOARD */
        <div className="fi" style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
          <div style={{ fontSize: 10, color: "#aaaaaa", letterSpacing: 2, marginBottom: 4 }}>CLASSIFICAÇÃO GERAL</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🏆 Últimos 30 dias</div>
          <div style={{ fontSize: 10, color: "#aaaaaa", marginBottom: 24 }}>{Object.keys(history).length} dias registados · pontos acumulados</div>

          {leaderboard.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#aaaaaa" }}>Ainda sem histórico. Volta amanhã! 😄</div>
          ) : leaderboard.map(([name, total], i) => {
            const isMe = name === myName;
            const medal = medalFor(i);
            const maxScore = leaderboard[0]?.[1] || 1;
            return (
              <div key={name} style={{
                background: isMe ? "rgba(0,168,84,.05)" : "#f4f4f4",
                border: "1px solid " + (isMe ? "#00a854" : "#e0e0e0"),
                borderRadius: 12, padding: "16px 18px", marginBottom: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 20, width: 28 }}>{medal || <span style={{ color: "#aaaaaa", fontSize: 13 }}>{i+1}</span>}</span>
                    <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? "#00a854" : "#111111", fontSize: 15 }}>
                      {name}{isMe ? " ✦" : ""}
                    </span>
                  </div>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: isMe ? "#00a854" : "#111111" }}>
                    {total}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ background: "#e0e0e0", borderRadius: 4, height: 4, overflow: "hidden" }}>
                  <div style={{ width: (total / maxScore * 100) + "%", height: "100%", background: isMe ? "#00a854" : "#bbb", borderRadius: 4, transition: "width .5s" }} />
                </div>
              </div>
            );
          })}

          {/* Daily breakdown */}
          {Object.keys(history).length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 10, color: "#aaaaaa", letterSpacing: 2, marginBottom: 12 }}>HISTÓRICO POR DIA</div>
              {Object.entries(history).sort(([a],[b]) => b.localeCompare(a)).slice(0,10).map(([date, scores]) => {
                const topPlayer = Object.entries(scores).sort(([,a],[,b]) => b-a)[0];
                return (
                  <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eeeeee" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#111111", fontWeight: 500 }}>{date}</div>
                      <div style={{ fontSize: 10, color: "#aaaaaa", marginTop: 2 }}>
                        {Object.entries(scores).map(([n,s]) => `${n}: ${s}pts`).join(" · ")}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "#00a854", fontWeight: 700 }}>🏅 {topPlayer?.[0]}</div>
                      <div style={{ fontSize: 10, color: "#aaaaaa" }}>{topPlayer?.[1]} pts</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      ) : (
        /* PROFILE */
        <div className="fi" style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 9, color: "#aaaaaa", letterSpacing: 2, marginBottom: 4 }}>O TEU PAINEL</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: "#00a854" }}>{myName}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#aaaaaa", letterSpacing: 2 }}>SCORE HOJE</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 800, color: "#00a854" }}>{myScore}</div>
            </div>
          </div>

          {/* Jejum */}
          <div style={{ background: "#f4f4f4", border: "1px solid #e0e0e0", borderLeft: "3px solid " + statusColor(isFasting), borderRadius: 14, padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#aaaaaa", letterSpacing: 2, marginBottom: 10 }}>⏱ JEJUM</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className={isFasting ? "pulse" : ""} style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor(isFasting) }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: statusColor(isFasting), letterSpacing: 1 }}>
                  {isFasting ? "EM JEJUM" : me?.fastStart && me?.fastEnd ? "CONCLUÍDO" : "SEM JEJUM"}
                </span>
              </div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: isFasting ? "#111111" : "#aaaaaa", letterSpacing: 2 }}>
                {fastMs ? fmt(fastMs) : "00:00:00"}
              </div>
            </div>
            <button className="btn" onClick={toggleFast} style={{
              width: "100%",
              background: isFasting ? "rgba(255,71,87,.08)" : "rgba(0,168,84,.1)",
              color: isFasting ? "#ff4757" : "#00a854",
              border: "1px solid " + (isFasting ? "#ff4757" : "#00a854"),
              borderRadius: 10, padding: 14, fontSize: 13, fontWeight: 700, letterSpacing: 2,
            }}>
              {isFasting ? "⏹ TERMINAR JEJUM" : me?.fastStart && me?.fastEnd ? "↺ NOVO JEJUM" : "▶ INICIAR JEJUM"}
            </button>
          </div>

          {/* Drinks */}
          <div style={{ background: "#f4f4f4", border: "1px solid #e0e0e0", borderRadius: 14, padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#aaaaaa", letterSpacing: 2, marginBottom: 14 }}>BEBIDAS</div>
            <div style={{ display: "flex", gap: 8 }}>
              {DRINK_KEYS.map(key => (
                <div key={key} style={{ flex: 1, background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "14px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 22 }}>{DRINK_EMOJI[key]}</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: "#111111" }}>{(me?.drinks || {})[key] || 0}</span>
                  <span style={{ fontSize: 8, color: "#aaaaaa", letterSpacing: 1 }}>{DRINK_LABEL[key]}</span>
                  <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
                    <button className="btn" onClick={() => removeDrink(key)} style={{ background: "#e0e0e0", color: "#777777", borderRadius: 5, width: 28, height: 28, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <button className="btn" onClick={() => addDrink(key)} style={{ background: "#e0e0e0", color: "#00a854", borderRadius: 5, width: 28, height: 28, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div style={{ background: "#f4f4f4", border: "1px solid #e0e0e0", borderRadius: 14, padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#aaaaaa", letterSpacing: 2, marginBottom: 12 }}>👟 PASSOS</div>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 36, fontWeight: 800, color: stepsColor(me?.steps) }}>
                {(me?.steps || 0).toLocaleString("pt-PT")}
              </div>
              <div style={{ fontSize: 9, color: "#aaaaaa", marginTop: 2 }}>
                {(me?.steps || 0) >= 10000 ? "🎯 META ATINGIDA!" : `faltam ${(10000-(me?.steps||0)).toLocaleString("pt-PT")} para 10k`}
              </div>
            </div>
            <div style={{ background: "#e0e0e0", borderRadius: 4, height: 5, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ width: Math.min(100,((me?.steps||0)/10000)*100)+"%", height: "100%", background: stepsColor(me?.steps), borderRadius: 4, transition: "width .5s" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={stepsInput} onChange={e => setStepsInput(e.target.value)} onKeyDown={e => e.key === "Enter" && saveSteps()}
                placeholder="Total de passos..." type="number"
                style={{ flex: 1, background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "10px 12px", color: "#111111", fontSize: 14, fontFamily: "inherit" }} />
              <button className="btn" onClick={() => saveSteps()} style={{ background: "rgba(0,168,84,.1)", color: "#00a854", border: "1px solid #00a854", borderRadius: 8, padding: "10px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>OK</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[500,1000,2000,5000,10000].map(v => (
                <button key={v} className="btn" onClick={() => addSteps(v)} style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 6, padding: "5px 10px", fontSize: 10, color: "#666666", letterSpacing: 1 }}>+{fmtSteps(v)}</button>
              ))}
            </div>
          </div>

          {/* Workout */}
          <div style={{ background: "#f4f4f4", border: "1px solid #e0e0e0", borderRadius: 14, padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#aaaaaa", letterSpacing: 2, marginBottom: 12 }}>🏋️ TREINO</div>
            <button className="btn" onClick={toggleTrained} style={{
              width: "100%",
              background: me?.trained ? "rgba(0,168,84,.1)" : "#ffffff",
              color: me?.trained ? "#00a854" : "#777777",
              border: "2px solid " + (me?.trained ? "#00a854" : "#e0e0e0"),
              borderRadius: 12, padding: 18,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              fontSize: 14, fontWeight: 700, letterSpacing: 1.5, transition: "all .2s",
            }}>
              <span style={{ fontSize: 26 }}>{me?.trained ? "✅" : "⬜"}</span>
              <div style={{ textAlign: "left" }}>
                <div>{me?.trained ? "TREINO FEITO!" : "MARCAR TREINO"}</div>
                <div style={{ fontSize: 9, color: me?.trained ? "#00a854" : "#aaaaaa", marginTop: 2 }}>+15 PONTOS</div>
              </div>
            </button>
          </div>

          <div style={{ textAlign: "center", marginTop: 8 }}>
            <span onClick={() => { safeSet("daily_myname",""); setMyName(""); }} style={{ fontSize: 9, color: "#cccccc", cursor: "pointer", letterSpacing: 1 }}>
              TROCAR DE UTILIZADOR
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
