import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set } from "firebase/database";

// ─── helpers ────────────────────────────────────────────────────────────────
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
  return (
    Math.floor((ms / 3600000) * 10) +
    Math.floor((steps || 0) / 1000) +
    (trained ? 15 : 0)
  );
};

const stepsColor = (n) =>
  !n ? "#333" : n >= 10000 ? "#00ff87" : n >= 7500 ? "#ffd93d" : "#ff9f43";

const fmtSteps = (n) =>
  n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n || 0);

const statusColor = (f) => (f ? "#00ff87" : "#ff4757");

const blank = () => ({
  fastStart: null,
  fastEnd: null,
  drinks: { water: 0, tea: 0, coffee: 0 },
  steps: 0,
  trained: false,
});

// ─── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [members, setMembers] = useState({});
  const [myName, setMyName] = useState(
    () => localStorage.getItem("jejum_name") || ""
  );
  const [nameInput, setNameInput] = useState("");
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState("table");
  const [stepsInput, setStepsInput] = useState("");
  const [connected, setConnected] = useState(false);
  const membersRef = useRef({});

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Firebase realtime listener
  useEffect(() => {
    const r = ref(db, "members");
    const unsub = onValue(
      r,
      (snap) => {
        const val = snap.val() || {};
        membersRef.current = val;
        setMembers(val);
        setConnected(true);
      },
      () => setConnected(false)
    );
    return () => unsub();
  }, []);

  // ── write helpers ──
  const saveMember = (name, data) =>
    set(ref(db, `members/${name}`), data);

  const patchMe = (patch) => {
    const base = membersRef.current[myName] || blank();
    return saveMember(myName, { ...base, ...patch });
  };

  const handleJoin = async () => {
    const name = nameInput.trim();
    if (!name) return;
    if (!membersRef.current[name]) await saveMember(name, blank());
    localStorage.setItem("jejum_name", name);
    setMyName(name);
    setNameInput("");
    setView("profile");
  };

  const toggleFast = () => {
    const me = membersRef.current[myName] || blank();
    if (!me.fastStart || me.fastEnd) {
      patchMe({ fastStart: Date.now(), fastEnd: null });
    } else {
      patchMe({ fastEnd: Date.now() });
    }
  };

  const addDrink = (key) => {
    const me = membersRef.current[myName] || blank();
    const drinks = {
      ...(me.drinks || {}),
      [key]: ((me.drinks || {})[key] || 0) + 1,
    };
    patchMe({ drinks });
  };

  const removeDrink = (key) => {
    const me = membersRef.current[myName] || blank();
    const drinks = {
      ...(me.drinks || {}),
      [key]: Math.max(0, ((me.drinks || {})[key] || 0) - 1),
    };
    patchMe({ drinks });
  };

  const saveSteps = (val) => {
    const v = val !== undefined ? val : parseInt(stepsInput, 10);
    if (!isNaN(v)) {
      patchMe({ steps: v });
      setStepsInput("");
    }
  };

  const addSteps = (n) => {
    const me = membersRef.current[myName] || blank();
    patchMe({ steps: (me.steps || 0) + n });
  };

  const toggleTrained = () => {
    const me = membersRef.current[myName] || blank();
    patchMe({ trained: !me.trained });
  };

  const resetDay = () => saveMember(myName, blank());

  // ── derived ──
  const sorted = Object.entries(members).sort(([, a], [, b]) => {
    const msA = a.fastStart
      ? a.fastEnd ? a.fastEnd - a.fastStart : now - a.fastStart
      : null;
    const msB = b.fastStart
      ? b.fastEnd ? b.fastEnd - b.fastStart : now - b.fastStart
      : null;
    return (
      calcScore(msB, b.steps, b.trained) -
      calcScore(msA, a.steps, a.trained)
    );
  });

  const me = myName ? members[myName] : null;
  const isFasting = me?.fastStart && !me?.fastEnd;
  const fastMs = isFasting
    ? now - me.fastStart
    : me?.fastStart && me?.fastEnd
    ? me.fastEnd - me.fastStart
    : null;
  const myScore = calcScore(fastMs, me?.steps, me?.trained);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: "#0a0a0f",
        minHeight: "100vh",
        fontFamily: "'DM Mono','Courier New',monospace",
        color: "#e8e8e8",
        paddingBottom: 60,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #00ff87; border-radius: 2px; }
        .btn { cursor: pointer; border: none; outline: none; transition: all .15s; font-family: inherit; }
        .btn:active { transform: scale(.96); }
        .rh:hover { background: rgba(0,255,135,.04) !important; }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(0,255,135,.4); }
          50% { box-shadow: 0 0 0 8px rgba(0,255,135,0); }
        }
        .fi { animation: fi .35s ease; }
        @keyframes fi {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        input:focus { outline: none; border-color: #00ff87 !important; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>

      {/* ── HEADER ── */}
      <div
        style={{
          borderBottom: "1px solid #1a1a2e",
          padding: "18px 20px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Syne',sans-serif",
              fontSize: 20,
              fontWeight: 800,
              color: "#00ff87",
            }}
          >
            ⚡ JEJUM.GG
          </div>
          <div
            style={{ fontSize: 9, color: "#333", letterSpacing: 2, marginTop: 1 }}
          >
            GRUPO DE JEJUM INTERMITENTE
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            title={connected ? "Ligado" : "A ligar..."}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: connected ? "#00ff87" : "#ff4757",
              boxShadow: connected ? "0 0 6px #00ff87" : "none",
              transition: "all .5s",
            }}
          />
          {myName && (
            <div style={{ display: "flex", gap: 6 }}>
              {["table", "profile"].map((v) => (
                <button
                  key={v}
                  className="btn"
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? "#00ff87" : "transparent",
                    color: view === v ? "#0a0a0f" : "#555",
                    border: "1px solid " + (view === v ? "#00ff87" : "#222"),
                    borderRadius: 6,
                    padding: "5px 12px",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1,
                  }}
                >
                  {v === "table" ? "TABELA" : "O MEU"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── JOIN ── */}
      {!myName ? (
        <div
          className="fi"
          style={{
            maxWidth: 400,
            margin: "60px auto",
            padding: "0 20px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "'Syne',sans-serif",
              fontSize: 30,
              fontWeight: 800,
              marginBottom: 8,
            }}
          >
            Quem és tu?
          </div>
          <div style={{ color: "#444", fontSize: 13, marginBottom: 32 }}>
            Entra com o teu nome para registares o teu jejum
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="O teu nome..."
              style={{
                flex: 1,
                background: "#111",
                border: "1px solid #222",
                borderRadius: 10,
                padding: "13px 16px",
                color: "#e8e8e8",
                fontSize: 16,
                fontFamily: "inherit",
              }}
            />
            <button
              className="btn"
              onClick={handleJoin}
              style={{
                background: "#00ff87",
                color: "#0a0a0f",
                borderRadius: 10,
                padding: "13px 20px",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              ENTRAR
            </button>
          </div>
          {Object.keys(members).length > 0 && (
            <div style={{ marginTop: 20, color: "#2a2a2a", fontSize: 11 }}>
              Já no grupo: {Object.keys(members).join(", ")}
            </div>
          )}
        </div>

      ) : view === "table" ? (
        /* ── TABLE ── */
        <div className="fi" style={{ padding: "20px 12px 0" }}>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                  {[
                    "#","NOME","ESTADO","JEJUM","TEMPO","SCORE",
                    "💧","🍵","☕","👟 PASSOS","🏋️",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "7px 10px",
                        textAlign: [
                          "#","SCORE","💧","🍵","☕","👟 PASSOS","🏋️",
                        ].includes(h)
                          ? "center"
                          : "left",
                        fontSize: 9,
                        color: "#333",
                        letterSpacing: 1.5,
                        fontWeight: 500,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(([name, data], i) => {
                  const fasting = data.fastStart && !data.fastEnd;
                  const ms = fasting
                    ? now - data.fastStart
                    : data.fastStart && data.fastEnd
                    ? data.fastEnd - data.fastStart
                    : null;
                  const score = calcScore(ms, data.steps, data.trained);
                  const isMe = name === myName;
                  const drinks = data.drinks || {};
                  const steps = data.steps || 0;

                  return (
                    <tr
                      key={name}
                      className="rh"
                      style={{
                        borderBottom: "1px solid #0f0f0f",
                        background: isMe
                          ? "rgba(0,255,135,.03)"
                          : "transparent",
                      }}
                    >
                      <td
                        style={{
                          padding: "12px 10px",
                          textAlign: "center",
                          fontSize: 13,
                        }}
                      >
                        {i === 0
                          ? "🥇"
                          : i === 1
                          ? "🥈"
                          : i === 2
                          ? "🥉"
                          : <span style={{ color: "#333" }}>{i + 1}</span>}
                      </td>
                      <td
                        style={{
                          padding: "12px 10px",
                          color: isMe ? "#00ff87" : "#ccc",
                          fontWeight: isMe ? 700 : 400,
                          fontSize: 13,
                        }}
                      >
                        {name}
                        {isMe ? " ✦" : ""}
                      </td>
                      <td style={{ padding: "12px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div
                            className={fasting ? "pulse" : ""}
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: statusColor(fasting),
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 9,
                              color: statusColor(fasting),
                              letterSpacing: 1,
                            }}
                          >
                            {fasting
                              ? "EM JEJUM"
                              : data.fastStart && data.fastEnd
                              ? "FEITO"
                              : "—"}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: 10, color: "#444" }}>
                        {data.fastStart
                          ? new Date(data.fastStart).toLocaleTimeString("pt-PT", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }) +
                            (data.fastEnd
                              ? " → " +
                                new Date(data.fastEnd).toLocaleTimeString("pt-PT", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : " → agora")
                          : "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 10px",
                          fontSize: 13,
                          color: fasting ? "#e8e8e8" : "#444",
                          letterSpacing: 1,
                        }}
                      >
                        {ms ? fmt(ms) : "—"}
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "center" }}>
                        <span
                          style={{
                            background:
                              score > 0
                                ? "rgba(0,255,135,.1)"
                                : "transparent",
                            color: score > 0 ? "#00ff87" : "#333",
                            padding: "2px 8px",
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {score > 0 ? score : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "center", color: "#4ecdc4", fontSize: 13 }}>
                        {drinks.water || "—"}
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "center", color: "#a8e6cf", fontSize: 13 }}>
                        {drinks.tea || "—"}
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "center", color: "#d4a574", fontSize: 13 }}>
                        {drinks.coffee || "—"}
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "center" }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <span
                            style={{
                              color: stepsColor(steps),
                              fontSize: 12,
                              fontWeight: steps >= 10000 ? 700 : 400,
                            }}
                          >
                            {steps ? steps.toLocaleString("pt-PT") : "—"}
                          </span>
                          {steps > 0 && (
                            <div
                              style={{
                                width: 40,
                                height: 2,
                                background: "#1a1a2e",
                                borderRadius: 1,
                              }}
                            >
                              <div
                                style={{
                                  width:
                                    Math.min(100, (steps / 10000) * 100) + "%",
                                  height: "100%",
                                  background: stepsColor(steps),
                                  borderRadius: 1,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "12px 10px",
                          textAlign: "center",
                          fontSize: 14,
                        }}
                      >
                        {data.trained ? "✅" : (
                          <span style={{ color: "#1a1a2e" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && (
            <div
              style={{ textAlign: "center", padding: "50px 0", color: "#222" }}
            >
              Ainda ninguém. Sê o primeiro!
            </div>
          )}
          <div
            style={{
              textAlign: "center",
              marginTop: 16,
              fontSize: 9,
              color: "#1a1a2e",
              letterSpacing: 1,
            }}
          >
            SCORE = horas×10 + passos/1k + 15 treino · TEMPO REAL
          </div>
        </div>

      ) : (
        /* ── PROFILE ── */
        <div
          className="fi"
          style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: 20,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 9,
                  color: "#333",
                  letterSpacing: 2,
                  marginBottom: 4,
                }}
              >
                O TEU PAINEL
              </div>
              <div
                style={{
                  fontFamily: "'Syne',sans-serif",
                  fontSize: 24,
                  fontWeight: 800,
                  color: "#00ff87",
                }}
              >
                {myName}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#333", letterSpacing: 2 }}>
                SCORE
              </div>
              <div
                style={{
                  fontFamily: "'Syne',sans-serif",
                  fontSize: 30,
                  fontWeight: 800,
                  color: "#00ff87",
                }}
              >
                {myScore}
              </div>
            </div>
          </div>

          {/* Jejum */}
          <div
            style={{
              background: "#111",
              border: "1px solid #1a1a2e",
              borderLeft: "3px solid " + statusColor(isFasting),
              borderRadius: 14,
              padding: 20,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#333",
                letterSpacing: 2,
                marginBottom: 10,
              }}
            >
              ⏱ JEJUM
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  className={isFasting ? "pulse" : ""}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: statusColor(isFasting),
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: statusColor(isFasting),
                    letterSpacing: 1,
                  }}
                >
                  {isFasting
                    ? "EM JEJUM"
                    : me?.fastStart && me?.fastEnd
                    ? "CONCLUÍDO"
                    : "SEM JEJUM"}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "'Syne',sans-serif",
                  fontSize: 24,
                  fontWeight: 800,
                  color: isFasting ? "#e8e8e8" : "#333",
                  letterSpacing: 2,
                }}
              >
                {fastMs ? fmt(fastMs) : "00:00:00"}
              </div>
            </div>
            <button
              className="btn"
              onClick={toggleFast}
              style={{
                width: "100%",
                background: isFasting
                  ? "rgba(255,71,87,.12)"
                  : "rgba(0,255,135,.12)",
                color: isFasting ? "#ff4757" : "#00ff87",
                border:
                  "1px solid " + (isFasting ? "#ff4757" : "#00ff87"),
                borderRadius: 10,
                padding: 14,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              {isFasting
                ? "⏹ TERMINAR JEJUM"
                : me?.fastStart && me?.fastEnd
                ? "↺ NOVO JEJUM"
                : "▶ INICIAR JEJUM"}
            </button>
          </div>

          {/* Drinks */}
          <div
            style={{
              background: "#111",
              border: "1px solid #1a1a2e",
              borderRadius: 14,
              padding: 20,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#333",
                letterSpacing: 2,
                marginBottom: 14,
              }}
            >
              BEBIDAS
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {DRINK_KEYS.map((key) => (
                <div
                  key={key}
                  style={{
                    flex: 1,
                    background: "#0a0a0f",
                    border: "1px solid #1a1a2e",
                    borderRadius: 12,
                    padding: "14px 6px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{DRINK_EMOJI[key]}</span>
                  <span style={{ fontSize: 22, fontWeight: 700 }}>
                    {(me?.drinks || {})[key] || 0}
                  </span>
                  <span style={{ fontSize: 8, color: "#333", letterSpacing: 1 }}>
                    {DRINK_LABEL[key]}
                  </span>
                  <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
                    <button
                      className="btn"
                      onClick={() => removeDrink(key)}
                      style={{
                        background: "#1a1a2e",
                        color: "#555",
                        borderRadius: 5,
                        width: 28,
                        height: 28,
                        fontSize: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      −
                    </button>
                    <button
                      className="btn"
                      onClick={() => addDrink(key)}
                      style={{
                        background: "#1a1a2e",
                        color: "#00ff87",
                        borderRadius: 5,
                        width: 28,
                        height: 28,
                        fontSize: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div
            style={{
              background: "#111",
              border: "1px solid #1a1a2e",
              borderRadius: 14,
              padding: 20,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#333",
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              👟 PASSOS
            </div>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div
                style={{
                  fontFamily: "'Syne',sans-serif",
                  fontSize: 36,
                  fontWeight: 800,
                  color: stepsColor(me?.steps),
                }}
              >
                {(me?.steps || 0).toLocaleString("pt-PT")}
              </div>
              <div style={{ fontSize: 9, color: "#333", marginTop: 2 }}>
                {(me?.steps || 0) >= 10000
                  ? "🎯 META ATINGIDA!"
                  : `faltam ${(10000 - (me?.steps || 0)).toLocaleString(
                      "pt-PT"
                    )} para 10k`}
              </div>
            </div>
            <div
              style={{
                background: "#0a0a0f",
                borderRadius: 4,
                height: 5,
                marginBottom: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width:
                    Math.min(100, ((me?.steps || 0) / 10000) * 100) + "%",
                  height: "100%",
                  background: stepsColor(me?.steps),
                  borderRadius: 4,
                  transition: "width .5s",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={stepsInput}
                onChange={(e) => setStepsInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveSteps()}
                placeholder="Total de passos..."
                type="number"
                style={{
                  flex: 1,
                  background: "#0a0a0f",
                  border: "1px solid #222",
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: "#e8e8e8",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              />
              <button
                className="btn"
                onClick={() => saveSteps()}
                style={{
                  background: "rgba(0,255,135,.12)",
                  color: "#00ff87",
                  border: "1px solid #00ff87",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                OK
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[500, 1000, 2000, 5000, 10000].map((v) => (
                <button
                  key={v}
                  className="btn"
                  onClick={() => addSteps(v)}
                  style={{
                    background: "#0a0a0f",
                    border: "1px solid #1a1a2e",
                    borderRadius: 6,
                    padding: "5px 10px",
                    fontSize: 10,
                    color: "#444",
                    letterSpacing: 1,
                  }}
                >
                  +{fmtSteps(v)}
                </button>
              ))}
            </div>
          </div>

          {/* Workout */}
          <div
            style={{
              background: "#111",
              border: "1px solid #1a1a2e",
              borderRadius: 14,
              padding: 20,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#333",
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              🏋️ TREINO
            </div>
            <button
              className="btn"
              onClick={toggleTrained}
              style={{
                width: "100%",
                background: me?.trained
                  ? "rgba(0,255,135,.1)"
                  : "#0a0a0f",
                color: me?.trained ? "#00ff87" : "#444",
                border:
                  "2px solid " + (me?.trained ? "#00ff87" : "#1a1a2e"),
                borderRadius: 12,
                padding: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 1.5,
                transition: "all .2s",
              }}
            >
              <span style={{ fontSize: 26 }}>
                {me?.trained ? "✅" : "⬜"}
              </span>
              <div style={{ textAlign: "left" }}>
                <div>
                  {me?.trained ? "TREINO FEITO!" : "MARCAR TREINO"}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: me?.trained ? "#00cc66" : "#2a2a2a",
                    marginTop: 2,
                  }}
                >
                  +15 PONTOS
                </div>
              </div>
            </button>
          </div>

          <button
            className="btn"
            onClick={resetDay}
            style={{
              width: "100%",
              background: "transparent",
              color: "#2a2a2a",
              border: "1px solid #1a1a2e",
              borderRadius: 10,
              padding: 11,
              fontSize: 10,
              letterSpacing: 2,
              marginBottom: 12,
            }}
          >
            REINICIAR DIA
          </button>
          <div style={{ textAlign: "center" }}>
            <span
              onClick={() => {
                localStorage.removeItem("jejum_name");
                setMyName("");
              }}
              style={{
                fontSize: 9,
                color: "#1a1a2e",
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              TROCAR DE UTILIZADOR
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
