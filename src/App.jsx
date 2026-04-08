import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from '@supabase/supabase-js';

// === SUPABASE CONFIG - CHANGE THESE ===
const SUPABASE_URL = "https://tymgwcprvuqjderxfagd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5bWd3Y3BydnVxamRlcnhmYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTYyOTAsImV4cCI6MjA5MTIzMjI5MH0.03tCcE89WslCNADDoaEf8uX_kvvOU6j4maCM-7CdBuE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════
//  THEME — Olive Garden 🌿
// ═══════════════════════════════════════════════════════════
const T = {
  bg:         "#F8F6F1",
  cat_bg:     "#E7D8B5",
  card:       "#EFE8DA",
  price_bg:   "#6F7F1F",
  price_text: "#ffffff",
  badge_bg:   "#F2C94C",
  badge_text: "#2F3A1C",
  // extended palette
  border:     "#D4C8A8",
  accent:     "#6F7F1F",
  accent2:    "#8A9E28",
  text:       "#2F3A1C",
  text2:      "#5A6A40",
  text3:      "#9AAA78",
  green:      "#4A7C28",
  red:        "#C0392B",
  blue:       "#2980B9",
  yellow:     "#D4A017",
  purple:     "#7D5A9A",
  sidebar:    "#2F3A1C",
  sidebarText:"#C8D8A0",
  sidebarActive:"#6F7F1F",
  white:      "#FFFFFF",
  shadow:     "rgba(47,58,28,0.12)",
};

// ═══════════════════════════════════════════════════════════
//  DATABASE — IndexedDB-backed storage with localStorage fallback
// ═══════════════════════════════════════════════════════════
const DB_NAME = "BrikiDB";
const DB_VERSION = 1;
const STORES = ["settings", "employees", "attendance", "dailyData", "schedule", "busyDays", "links", "althData", "affiliates", "cashRegisters", "daysOff"];

let _db = null;
const getDB = () => new Promise((resolve, reject) => {
  if (_db) return resolve(_db);
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
  };
  req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
  req.onerror = () => reject(req.error);
});

const idb = {
  get: async (store, key) => {
    try {
      const db = await getDB();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => res(req.result ?? null);
        req.onerror = () => rej(req.error);
      });
    } catch { return localStorage.getItem(`briki_${store}_${key}`) ? JSON.parse(localStorage.getItem(`briki_${store}_${key}`)) : null; }
  },
  set: async (store, key, val) => {
    try {
      const db = await getDB();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(val, key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch { localStorage.setItem(`briki_${store}_${key}`, JSON.stringify(val)); }
  },
  getAll: async (store) => {
    try {
      const db = await getDB();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, "readonly");
        const results = {};
        const req = tx.objectStore(store).openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { results[cursor.key] = cursor.value; cursor.continue(); }
          else res(results);
        };
        req.onerror = () => rej(req.error);
      });
    } catch { return {}; }
  },
  exportAll: async () => {
    const data = {};
    for (const store of STORES) data[store] = await idb.getAll(store);
    return data;
  },
  importAll: async (data) => {
    for (const [store, entries] of Object.entries(data)) {
      for (const [key, val] of Object.entries(entries || {})) await idb.set(store, key, val);
    }
  }
};

function useIDB(store, key, def) {
  const [val, setVal] = useState(def);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    idb.get(store, key).then(v => { if (v !== null) setVal(v); setLoaded(true); });
  }, [store, key]);
  const update = useCallback(async (v) => {
    const nv = typeof v === "function" ? v(val) : v;
    setVal(nv);
    await idb.set(store, key, nv);
  }, [store, key, val]);
  return [val, update, loaded];
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
const fmt = (n) => "€" + (parseFloat(n) || 0).toFixed(2);
const pa = (s) => parseFloat(String(s || "").replace(",", ".")) || 0;
const todayISO = () => new Date().toISOString().split("T")[0];
const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const fmtD = (iso) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const uid = () => Math.random().toString(36).slice(2, 9);
const ADMIN_PIN = "1212";
const PARTNER_PIN = "2121";

const DAYS_GR = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"];
const MONTHS_GR = ["Ιαν","Φεβ","Μαρ","Απρ","Μαΐ","Ιουν","Ιουλ","Αυγ","Σεπ","Οκτ","Νοε","Δεκ"];

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════
const st = {
  card:  { background: T.card,  border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, boxShadow: `0 2px 8px ${T.shadow}` },
  input: { background: T.white, border: `1px solid ${T.border}`, borderRadius: 7, padding: "9px 12px", color: T.text, fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "'Georgia', serif" },
  label: { color: T.text2, fontSize: 11, marginBottom: 4, display: "block", fontFamily: "'Trebuchet MS', sans-serif", letterSpacing: 1, textTransform: "uppercase" },
};

// ═══════════════════════════════════════════════════════════
//  MINI COMPONENTS
// ═══════════════════════════════════════════════════════════
const Card = ({ children, style = {} }) => <div style={{ ...st.card, ...style }}>{children}</div>;

const Btn = ({ children, onClick, bg, style = {}, disabled = false, small = false }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: bg || T.accent, color: bg === T.white ? T.text : "#fff",
    border: "none", borderRadius: 7, padding: small ? "5px 10px" : "8px 16px",
    cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700,
    fontSize: small ? 12 : 14, opacity: disabled ? 0.5 : 1,
    fontFamily: "'Trebuchet MS', sans-serif", transition: "all 0.15s",
    boxShadow: disabled ? "none" : `0 2px 4px ${T.shadow}`, ...style
  }}>{children}</button>
);

const Inp = ({ label, value, onChange, type = "text", placeholder = "", style = {}, readOnly = false }) => (
  <div style={{ marginBottom: 10 }}>
    {label && <label style={st.label}>{label}</label>}
    <input type={type} value={value ?? ""} onChange={e => !readOnly && onChange(e.target.value)}
      placeholder={placeholder} readOnly={readOnly}
      style={{ ...st.input, ...style, background: readOnly ? T.cat_bg : T.white, cursor: readOnly ? "default" : "text" }} />
  </div>
);

const Sel = ({ label, value, onChange, options, style = {} }) => (
  <div style={{ marginBottom: 10 }}>
    {label && <label style={st.label}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...st.input, ...style }}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </div>
);

const Toggle = ({ label, value, onChange }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
    <span style={{ color: T.text2, fontSize: 13, fontFamily: "'Trebuchet MS', sans-serif" }}>{label}</span>
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? T.accent : T.border, cursor: "pointer", position: "relative", transition: "background 0.2s", border: `1px solid ${T.border}` }}>
      <div style={{ position: "absolute", top: 2, left: value ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: value ? "#fff" : T.white, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  </div>
);

const Modal = ({ title, onClose, children, wide = false }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(47,58,28,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div style={{ ...st.card, background: T.bg, width: "100%", maxWidth: wide ? 720 : 480, maxHeight: "92vh", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: T.text, fontSize: 17, fontWeight: 700, fontFamily: "Georgia, serif" }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.text2, fontSize: 22, cursor: "pointer" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const AmtBox = ({ label, value, color, sub, onClick }) => (
  <div onClick={onClick} style={{ ...st.card, textAlign: "center", cursor: onClick ? "pointer" : "default", transition: "border-color 0.2s, box-shadow 0.2s", background: T.white }}
    onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = T.accent)}
    onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = T.border)}>
    <div style={{ color: T.text2, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Trebuchet MS', sans-serif", marginBottom: 6 }}>{label}</div>
    <div style={{ color: color || T.accent, fontSize: 22, fontWeight: 700, fontFamily: "Georgia, serif" }}>{fmt(value)}</div>
    {sub && <div style={{ color: T.text3, fontSize: 11, marginTop: 4, fontFamily: "'Trebuchet MS', sans-serif" }}>{sub}</div>}
  </div>
);

const Badge = ({ text, color, bg }) => (
  <span style={{ background: bg || color + "22", color: color, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700, fontFamily: "'Trebuchet MS', sans-serif" }}>{text}</span>
);

const Sep = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 12px" }}>
    <div style={{ flex: 1, height: 1, background: T.border }} />
    {label && <span style={{ color: T.text3, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Trebuchet MS', sans-serif", whiteSpace: "nowrap" }}>{label}</span>}
    <div style={{ flex: 1, height: 1, background: T.border }} />
  </div>
);

function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div>
        <h1 style={{ color: T.text, fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "Georgia, serif" }}>{title}</h1>
        {subtitle && <div style={{ color: T.text2, fontSize: 13, marginTop: 4, fontFamily: "'Trebuchet MS', sans-serif" }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  BACKUP / RESTORE
// ═══════════════════════════════════════════════════════════
function BackupRestore() {
  const [msg, setMsg] = useState("");
  const fileRef = useRef();

  const doBackup = async () => {
    const data = await idb.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `briki_backup_${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
    setMsg("✅ Backup κατεβήκε!");
    setTimeout(() => setMsg(""), 3000);
  };

  const doRestore = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        await idb.importAll(data);
        setMsg("✅ Επαναφορά επιτυχής! Ανανέωσε τη σελίδα.");
        setTimeout(() => setMsg(""), 5000);
      } catch { setMsg("❌ Σφάλμα αρχείου"); setTimeout(() => setMsg(""), 3000); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <Card style={{ marginBottom: 20, background: T.cat_bg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: T.text, fontWeight: 700, fontFamily: "Georgia, serif", fontSize: 15 }}>💾 Βάση Δεδομένων (IndexedDB)</div>
          <div style={{ color: T.text2, fontSize: 12, fontFamily: "'Trebuchet MS', sans-serif", marginTop: 2 }}>Τα δεδομένα αποθηκεύονται τοπικά στο browser</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={doBackup} bg={T.green} small>⬇️ Backup</Btn>
          <Btn onClick={() => fileRef.current.click()} bg={T.blue} small>⬆️ Επαναφορά</Btn>
          <input ref={fileRef} type="file" accept=".json" onChange={doRestore} style={{ display: "none" }} />
        </div>
      </div>
      {msg && <div style={{ marginTop: 10, color: T.green, fontWeight: 700, fontSize: 13 }}>{msg}</div>}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════
function Login({ onLogin }) {
  const [mode, setMode] = useState("select");
  const [pin, setPin] = useState("");
  const [empId, setEmpId] = useState("");
  const [err, setErr] = useState("");
  const [employees, setEmployees] = useState([]);
  useEffect(() => { idb.get("employees", "list").then(v => setEmployees(v || [])); }, []);

  const handleAdmin = () => {
    if (pin === ADMIN_PIN) onLogin("admin", "Admin");
    else if (pin === PARTNER_PIN) onLogin("partner", "Εταίρος");
    else setErr("Λάθος κωδικός");
  };
  const handleEmp = () => {
    if (!empId) { setErr("Επίλεξε εργαζόμενο"); return; }
    const emp = employees.find(e => e.id === empId);
    if (emp) onLogin("employee", emp.name + " " + emp.surname, emp.id);
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 50%, #E7D8B588 0%, transparent 60%), radial-gradient(circle at 80% 20%, #C8D8A044 0%, transparent 50%)", pointerEvents: "none" }} />
      <div style={{ width: 360, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 56, lineHeight: 1 }}>☕</div>
          <div style={{ color: T.accent, fontSize: 38, fontWeight: 900, letterSpacing: 8, fontFamily: "Georgia, serif", marginTop: 8 }}>BRIKI</div>
          <div style={{ color: T.text3, fontSize: 12, letterSpacing: 3, fontFamily: "'Trebuchet MS', sans-serif", marginTop: 4 }}>ΣΥΣΤΗΜΑ ΔΙΑΧΕΙΡΙΣΗΣ</div>
        </div>
        <Card style={{ background: T.white }}>
          {mode === "select" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Btn onClick={() => setMode("admin")} style={{ padding: 14, fontSize: 15, letterSpacing: 1 }}>🔑 Admin / Εταίρος</Btn>
              <Btn onClick={() => setMode("emp")} bg={T.cat_bg} style={{ padding: 14, fontSize: 15, letterSpacing: 1, border: `1px solid ${T.border}`, color: T.text }}>👤 Εργαζόμενος</Btn>
            </div>
          )}
          {mode === "admin" && (
            <div>
              <div style={{ color: T.text2, fontSize: 13, marginBottom: 14, fontFamily: "'Trebuchet MS', sans-serif" }}></div>
              <Inp label="PIN" type="password" value={pin} onChange={setPin} placeholder="••••" />
              {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Btn onClick={() => { setMode("select"); setPin(""); setErr(""); }} bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text }}>Πίσω</Btn>
                <Btn onClick={handleAdmin} style={{ flex: 1 }}>Είσοδος →</Btn>
              </div>
            </div>
          )}
          {mode === "emp" && (
            <div>
              <Sel label="Εργαζόμενος" value={empId} onChange={setEmpId}
                options={[{ value: "", label: "-- Επίλεξε --" }, ...employees.map(e => ({ value: e.id, label: e.name + " " + e.surname }))]} />
              {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Btn onClick={() => { setMode("select"); setErr(""); }} bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text }}>Πίσω</Btn>
                <Btn onClick={handleEmp} style={{ flex: 1 }}>Είσοδος →</Btn>
              </div>
            </div>
          )}
        </Card>
        <div style={{ textAlign: "center", marginTop: 20, color: T.text3, fontSize: 11, fontFamily: "'Trebuchet MS', sans-serif", letterSpacing: 1 }}>© BRIKI v2.0 🌿</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════════
function Sidebar({ page, nav, role, onLogout, userName }) {
  const [col, setCol] = useState(false);
  const items = role === "employee"
    ? [
        { id: "attendance", label: "Παρουσίες", icon: "⏱️" },
        { id: "schedule",   label: "Πρόγραμμα", icon: "📅" },
        { id: "links",      label: "Σύνδεσμοι", icon: "🔗" },
      ]
    : [
        { id: "dashboard",  label: "Αρχική",       icon: "🏠" },
        { id: "cash",       label: "Ταμείο",        icon: "💵" },
        { id: "accounts",   label: "Λογαριασμοί",  icon: "🏦" },
        { id: "affiliates", label: "Συνεργάτες",   icon: "🤝" },
        { id: "employees",  label: "Εργαζόμενοι",  icon: "👥" },
        { id: "attendance", label: "Παρουσίες",    icon: "⏱️" },
        { id: "schedule",   label: "Πρόγραμμα",    icon: "📅" },
        { id: "reports",    label: "Αναφορές",      icon: "📊" },
        { id: "alth",       label: "ALTH",          icon: "🔐" },
        { id: "links",      label: "Σύνδεσμοι",    icon: "🔗" },
      ];
  return (
    <div style={{ width: col ? 56 : 210, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", minHeight: "100vh", transition: "width 0.2s", flexShrink: 0 }}>
      <div style={{ padding: col ? "14px 8px" : "14px 12px", borderBottom: `1px solid rgba(255,255,255,0.1)`, display: "flex", alignItems: "center", justifyContent: col ? "center" : "space-between", minHeight: 56 }}>
        {!col && <span style={{ color: "#C8D8A0", fontWeight: 900, fontSize: 17, fontFamily: "Georgia, serif", letterSpacing: 2 }}>🌿 BRIKI</span>}
        <button onClick={() => setCol(!col)} style={{ background: "none", border: "none", color: "#C8D8A0", cursor: "pointer", fontSize: 16, padding: 4 }}>{col ? "›" : "‹"}</button>
      </div>
      {!col && <div style={{ padding: "8px 12px 0", color: T.text3, fontSize: 11, fontFamily: "'Trebuchet MS', sans-serif", letterSpacing: 1 }}>{userName}</div>}
      <nav style={{ flex: 1, paddingTop: 8 }}>
        {items.map(item => (
          <button key={item.id} onClick={() => nav(item.id)} title={col ? item.label : ""}
            style={{ width: "100%", background: page === item.id ? "rgba(111,127,31,0.3)" : "none", border: "none", borderLeft: `3px solid ${page === item.id ? T.accent2 : "transparent"}`, color: page === item.id ? "#C8D8A0" : "#8A9E70", padding: col ? "12px" : "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontFamily: "'Trebuchet MS', sans-serif", transition: "all 0.15s" }}>
            <span style={{ fontSize: 17, flexShrink: 0 }}>{item.icon}</span>
            {!col && <span style={{ fontWeight: page === item.id ? 700 : 400 }}>{item.label}</span>}
          </button>
        ))}
      </nav>
      <div style={{ padding: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <button onClick={onLogout} title={col ? "Έξοδος" : ""} style={{ width: "100%", background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "#8A9E70", padding: "8px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontFamily: "'Trebuchet MS', sans-serif" }}>
          {col ? "🚪" : "🚪 Έξοδος"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════
function Dashboard({ role, userName, employees, attendance, dailyData, nav }) {
  const today = todayISO();
  const dd = dailyData[today] || {};
  const m = dd.morning || {}; const n = dd.night || {};
  const days = Object.keys(dailyData).sort();
  const prevDay = days.filter(d => d < today).pop();
  const prev = prevDay ? dailyData[prevDay] : {};

  const mCount = pa(m.xartina) + pa(m.kermata) + pa(m.koutakia);
  const mPayT = (m.payments || []).filter(p => p.from === "tameio").reduce((s, p) => s + pa(p.amount), 0);
  const mTameio = mCount - pa(prev.tameioEnd || 0) + mPayT + pa(m.pos);
  const nCount = pa(n.xartina) + pa(n.kermata) + pa(n.koutakia);
  const nPayT = (n.payments || []).filter(p => p.from === "tameio").reduce((s, p) => s + pa(p.amount), 0);
  const posNight = pa(n.posTotal) - pa(m.pos);
  const nTameio = nCount - mCount + nPayT + posNight - pa(n.addKouti);
  const tameioImeras = mTameio + nTameio;
  const koutiEnd = pa(prev.koutiEnd || 0) + pa(n.addKouti) - [...(m.payments || []), ...(n.payments || [])].filter(p => p.from === "kouti").reduce((s, p) => s + pa(p.amount), 0);
  const trapezaEnd = pa(prev.trapezaEnd || 0) + pa(n.posTotal) - [...(m.payments || []), ...(n.payments || [])].filter(p => p.from === "trapeza").reduce((s, p) => s + pa(p.amount), 0);
  const todayAtt = (attendance || []).filter(a => a.date === today);
  const isAdminOrPartner = role !== "employee";

  return (
    <div style={{ padding: 24, color: T.text }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: T.text, fontSize: 24, fontWeight: 700, margin: 0, fontFamily: "Georgia, serif" }}>
          {new Date().getHours() < 14 ? "Καλημέρα" : "Καλησπέρα"} 🌿
        </h1>
        <div style={{ color: T.text2, fontSize: 13, marginTop: 4, fontFamily: "'Trebuchet MS', sans-serif" }}>
          {fmtD(today)} &nbsp;•&nbsp; {role === "admin" ? "Administrator" : role === "partner" ? "Εταίρος" : userName}
        </div>
      </div>

      {isAdminOrPartner && (
        <>
          <Sep label="Σήμερα" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
            <AmtBox label="Πρωινό Ταμείο" value={mTameio} onClick={() => nav("cash")} />
            <AmtBox label="Βραδινό Ταμείο" value={nTameio} onClick={() => nav("cash")} />
            <AmtBox label="Ταμείο Ημέρας" value={tameioImeras} color={T.accent} onClick={() => nav("cash")} />
            <AmtBox label="Κουτί" value={koutiEnd} color={T.blue} onClick={() => nav("accounts")} />
            <AmtBox label="Τράπεζα" value={trapezaEnd} color={T.green} onClick={() => nav("accounts")} />
          </div>
        </>
      )}

      <Sep label="Παρουσίες Σήμερα" />
      <Card style={{ marginBottom: 16, background: T.white }}>
        {todayAtt.length === 0 ? (
          <div style={{ color: T.text2, fontSize: 13, textAlign: "center", padding: 16, fontFamily: "'Trebuchet MS', sans-serif" }}>Δεν υπάρχουν καταχωρήσεις σήμερα</div>
        ) : (
          <div>
            {todayAtt.map(a => {
              const emp = (employees || []).find(e => e.id === a.employeeId);
              return (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.cat_bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, overflow: "hidden" }}>
                      {emp?.photo ? <img src={emp.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : "👤"}
                    </div>
                    <div>
                      <div style={{ color: T.text, fontSize: 14, fontFamily: "'Trebuchet MS', sans-serif" }}>{emp ? `${emp.name} ${emp.surname}` : a.employeeName}</div>
                      <div style={{ color: T.text2, fontSize: 12, fontFamily: "Georgia, serif" }}>{a.timeIn} → {a.timeOut || "…"}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: T.accent, fontSize: 14, fontFamily: "Georgia, serif" }}>{a.hours != null ? a.hours.toFixed(1) + "ω" : "–"}</div>
                    {isAdminOrPartner && <div style={{ color: T.green, fontSize: 12, fontFamily: "Georgia, serif" }}>{a.dailyCost != null ? fmt(a.dailyCost) : "–"}</div>}
                  </div>
                </div>
              );
            })}
            {isAdminOrPartner && (
              <div style={{ paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.text2, fontSize: 13, fontFamily: "'Trebuchet MS', sans-serif" }}>Σύνολο ημέρας</span>
                <span style={{ color: T.green, fontFamily: "Georgia, serif", fontWeight: 700 }}>{fmt(todayAtt.reduce((s, a) => s + (a.dailyCost || 0), 0))}</span>
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Btn onClick={() => nav("attendance")} small>⏱️ Καταχώρηση Παρουσίας</Btn>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Btn onClick={() => nav("cash")} style={{ padding: 14 }}>💵 Ταμείο</Btn>
        {isAdminOrPartner && <Btn onClick={() => nav("accounts")} bg={T.blue} style={{ padding: 14 }}>🏦 Λογαριασμοί</Btn>}
        <Btn onClick={() => nav("schedule")} bg={T.cat_bg} style={{ padding: 14, border: `1px solid ${T.border}`, color: T.text }}>📅 Πρόγραμμα</Btn>
        {isAdminOrPartner && <Btn onClick={() => nav("reports")} bg={T.cat_bg} style={{ padding: 14, border: `1px solid ${T.border}`, color: T.text }}>📊 Αναφορές</Btn>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  EMPLOYEES
// ═══════════════════════════════════════════════════════════
const ABILITIES_LABELS = [
  { key: "makeCoffee", label: "☕ Barista" },
  { key: "serve", label: "🍽️ Σερβίρισμα" },
  { key: "delivery", label: "🛵 Delivery" },
  { key: "openShop", label: "🔑 Άνοιγμα" },
  { key: "closeShop", label: "🔒 Κλείσιμο" },
];
const EMPTY_EMP = { id: "", name: "", surname: "", erganiName: "", erganiSurname: "", hourlyRate: "", photo: "", role: "employee", experience: "1", abilities: { makeCoffee: false, serve: false, delivery: false, openShop: false, closeShop: false } };

function Employees({ employees, setEmployees }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_EMP);
  const fileRef = useRef();

  const openAdd = () => { setForm({ ...EMPTY_EMP, id: uid() }); setModal("add"); };
  const openEdit = (emp) => { setForm(emp); setModal("edit"); };
  const close = () => setModal(null);
  const save = () => {
    if (!form.name || !form.surname) return alert("Συμπλήρωσε όνομα & επώνυμο");
    if (modal === "add") setEmployees(prev => [...prev, form]);
    else setEmployees(prev => prev.map(e => e.id === form.id ? form : e));
    close();
  };
  const del = (id) => { if (confirm("Διαγραφή εργαζόμενου;")) setEmployees(prev => prev.filter(e => e.id !== id)); };
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setAbility = (k, v) => setForm(f => ({ ...f, abilities: { ...f.abilities, [k]: v } }));
  const handlePhoto = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setField("photo", ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="👥 Εργαζόμενοι" subtitle={`${(employees || []).length} καταχωρήσεις`}
        actions={<Btn onClick={openAdd}>+ Νέος</Btn>} />

      {(employees || []).length === 0 ? (
        <Card style={{ background: T.white }}><div style={{ textAlign: "center", padding: 32, color: T.text2 }}>Δεν υπάρχουν εργαζόμενοι.<br /><br /><Btn onClick={openAdd}>Προσθήκη</Btn></div></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {(employees || []).map(emp => (
            <Card key={emp.id} style={{ background: T.white }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.cat_bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, overflow: "hidden", flexShrink: 0 }}>
                  {emp.photo ? <img src={emp.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : "👤"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.text, fontSize: 16, fontWeight: 700, fontFamily: "Georgia, serif" }}>{emp.name} {emp.surname}</div>
                  <div style={{ color: T.text2, fontSize: 12, fontFamily: "Georgia, serif" }}>{emp.erganiName} {emp.erganiSurname}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <Badge text={emp.role === "partner" ? "Εταίρος" : "Εργαζόμενος"} color={emp.role === "partner" ? T.yellow : T.blue} />
                    <Badge text={`€${String(emp.hourlyRate).replace(".", ",")}/ω`} color={T.green} />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                {ABILITIES_LABELS.map(ab => emp.abilities?.[ab.key] && (
                  <span key={ab.key} style={{ background: T.cat_bg, border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 6px", fontSize: 11, color: T.text2 }}>{ab.label}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={() => openEdit(emp)} small style={{ flex: 1 }}>✏️ Επεξεργασία</Btn>
                <Btn onClick={() => del(emp.id)} small bg={T.red} style={{ flex: 1 }}>🗑️</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal === "add" ? "Νέος Εργαζόμενος" : "Επεξεργασία"} onClose={close} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Inp label="Όνομα" value={form.name} onChange={v => setField("name", v)} />
            <Inp label="Επώνυμο" value={form.surname} onChange={v => setField("surname", v)} />
            <Inp label="ΟΝΟΜΑ Εργάνη" value={form.erganiName} onChange={v => setField("erganiName", v)} />
            <Inp label="ΕΠΩΝΥΜΟ Εργάνη" value={form.erganiSurname} onChange={v => setField("erganiSurname", v)} />
            <Inp label="Ωρομίσθιο (€/ώρα)" value={form.hourlyRate} onChange={v => setField("hourlyRate", v)} placeholder="4.5" />
            <Sel label="Ρόλος" value={form.role} onChange={v => setField("role", v)}
              options={[{ value: "employee", label: "Εργαζόμενος" }, { value: "partner", label: "Εταίρος" }]} />
            <Sel label="Επίπεδο" value={form.experience} onChange={v => setField("experience", v)}
              options={[{ value: "1", label: "Επίπεδο 1 — Αρχάριος" }, { value: "2", label: "Επίπεδο 2 — Έμπειρος" }]} />
          </div>
          <Sep label="Φωτογραφία" />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: T.cat_bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, overflow: "hidden" }}>
              {form.photo ? <img src={form.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : "👤"}
            </div>
            <input type="file" accept="image/*" ref={fileRef} onChange={handlePhoto} style={{ display: "none" }} />
            <Btn onClick={() => fileRef.current.click()} small>📷 Φωτογραφία</Btn>
            {form.photo && <Btn onClick={() => setField("photo", "")} small bg={T.red}>✕</Btn>}
          </div>
          <Sep label="Ικανότητες" />
          {ABILITIES_LABELS.map(ab => (
            <Toggle key={ab.key} label={ab.label} value={!!form.abilities?.[ab.key]} onChange={v => setAbility(ab.key, v)} />
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn onClick={close} bg={T.cat_bg} style={{ flex: 1, border: `1px solid ${T.border}`, color: T.text }}>Ακύρωση</Btn>
            <Btn onClick={save} style={{ flex: 1 }}>💾 Αποθήκευση</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ATTENDANCE — with Άφιξη/Αποχώρηση buttons + admin manual
// ═══════════════════════════════════════════════════════════
function Attendance({ role, userName, empId: currentEmpId, employees, attendance, setAttendance }) {
  const [date, setDate] = useState(todayISO());
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ employeeId: "", timeIn: "", timeOut: "" });
  const [adminPin, setAdminPin] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(role !== "employee");
  const [pinModal, setPinModal] = useState(false);
  const [pinErr, setPinErr] = useState("");

  // Employees see only their own records; admin/partner see all
  const filtered = (attendance || [])
    .filter(a => a.date === date && (role !== "employee" || a.employeeId === currentEmpId))
    .sort((a, b) => a.timeIn.localeCompare(b.timeIn));

  const calcHours = (tin, tout) => {
    if (!tin || !tout) return null;
    const [h1, m1] = tin.split(":").map(Number);
    const [h2, m2] = tout.split(":").map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60;
    return diff / 60;
  };

  // Quick clock-in for employee
  const handleAfixi = () => {
    const emp = employees.find(e => e.id === currentEmpId);
    if (!emp) return alert("Δεν βρέθηκε εργαζόμενος");
    const existing = attendance.find(a => a.date === todayISO() && a.employeeId === currentEmpId && !a.timeOut);
    if (existing) return alert("Έχεις ήδη κάνει άφιξη!");
    const now = nowTime();
    const rec = { id: uid(), employeeId: emp.id, employeeName: emp.name + " " + emp.surname, date: todayISO(), timeIn: now, timeOut: "", hours: null, dailyCost: null };
    setAttendance(prev => [...(prev || []), rec]);
    alert(`✅ Άφιξη: ${now}`);
  };

  const handleApoxorisi = () => {
    const existing = attendance.find(a => a.date === todayISO() && a.employeeId === currentEmpId && !a.timeOut);
    if (!existing) return alert("Δεν βρέθηκε ανοιχτή άφιξη!");
    const now = nowTime();
    setAttendance(prev => prev.map(a => {
      if (a.id !== existing.id) return a;
      const emp = employees.find(e => e.id === a.employeeId);
      const hours = calcHours(a.timeIn, now);
      const rate = pa(emp?.hourlyRate || 0);
      return { ...a, timeOut: now, hours, dailyCost: hours != null ? hours * rate : null };
    }));
    alert(`✅ Αποχώρηση: ${now}`);
  };

  const openAdd = () => {
    const emp = role === "employee" ? employees.find(e => e.id === currentEmpId) : null;
    setForm({ employeeId: emp ? emp.id : "", timeIn: "", timeOut: "" });
    setModal(true);
  };

  const save = () => {
    const empId2 = role === "employee" ? currentEmpId : form.employeeId;
    const emp = employees.find(e => e.id === empId2);
    if (!emp) return alert("Επίλεξε εργαζόμενο");
    if (!form.timeIn) return alert("Συμπλήρωσε ώρα άφιξης");
    const hours = calcHours(form.timeIn, form.timeOut);
    const rate = pa(emp.hourlyRate);
    const dailyCost = hours != null ? hours * rate : null;
    const rec = { id: uid(), employeeId: emp.id, employeeName: emp.name + " " + emp.surname, date, timeIn: form.timeIn, timeOut: form.timeOut, hours, dailyCost };
    setAttendance(prev => [...(prev || []), rec]);
    setModal(false);
  };

  const del = (id) => { if (confirm("Διαγραφή;")) setAttendance(prev => prev.filter(a => a.id !== id)); };

  const updateTimeOut = (id, tout) => {
    setAttendance(prev => prev.map(a => {
      if (a.id !== id) return a;
      const emp = employees.find(e => e.id === a.employeeId);
      const hours = calcHours(a.timeIn, tout);
      const rate = pa(emp?.hourlyRate || 0);
      return { ...a, timeOut: tout, hours, dailyCost: hours != null ? hours * rate : null };
    }));
  };

  const totalCost = filtered.filter(a => a.dailyCost != null).reduce((s, a) => s + a.dailyCost, 0);

  const openShift = role === "employee"
    ? (attendance || []).find(a => a.date === todayISO() && a.employeeId === currentEmpId && !a.timeOut)
    : null;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="⏱️ Παρουσίες" subtitle={fmtD(date)}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {role === "employee" && (
              <>
                <Btn onClick={handleAfixi} bg={T.green} style={{ padding: "8px 20px", fontSize: 15 }}>🟢 Άφιξη</Btn>
                <Btn onClick={handleApoxorisi} bg={T.red} style={{ padding: "8px 20px", fontSize: 15 }}>🔴 Αποχώρηση</Btn>
                {!adminUnlocked && (
                  <Btn onClick={() => setPinModal(true)} bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text }} small>🔑 Admin</Btn>
                )}
              </>
            )}
            {(adminUnlocked || role !== "employee") && (
              <Btn onClick={openAdd}>+ Καταχώρηση</Btn>
            )}
          </div>
        } />

      {/* Employee: show current shift status */}
      {role === "employee" && (
        <Card style={{ marginBottom: 16, background: openShift ? "#F0FFF4" : T.white, border: `1px solid ${openShift ? T.green : T.border}` }}>
          {openShift ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>🟢</span>
              <div>
                <div style={{ color: T.green, fontWeight: 700, fontSize: 16, fontFamily: "Georgia, serif" }}>Είσαι στη δουλειά</div>
                <div style={{ color: T.text2, fontSize: 13 }}>Άφιξη: <b>{openShift.timeIn}</b> — Πάτα «Αποχώρηση» όταν τελειώσεις</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>⚪</span>
              <div>
                <div style={{ color: T.text2, fontWeight: 700, fontSize: 15 }}>Εκτός βάρδιας</div>
                <div style={{ color: T.text3, fontSize: 13 }}>Πάτα «Άφιξη» όταν φτάσεις</div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Admin PIN unlock for employee */}
      {pinModal && (
        <Modal title="Admin Πρόσβαση" onClose={() => { setPinModal(false); setPinErr(""); setAdminPin(""); }}>
          <Inp label="Admin PIN" type="password" value={adminPin} onChange={setAdminPin} placeholder="••••" />
          {pinErr && <div style={{ color: T.red, fontSize: 13, marginBottom: 8 }}>{pinErr}</div>}
          <Btn onClick={() => {
            if (adminPin === ADMIN_PIN) { setAdminUnlocked(true); setPinModal(false); setPinErr(""); setAdminPin(""); }
            else setPinErr("Λάθος PIN");
          }} style={{ width: "100%" }}>Επιβεβαίωση</Btn>
        </Modal>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <div>
          <label style={st.label}>Ημερομηνία</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...st.input, width: "auto" }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card style={{ background: T.white }}><div style={{ textAlign: "center", padding: 24, color: T.text2 }}>Δεν υπάρχουν παρουσίες για {fmtD(date)}</div></Card>
      ) : (
        <Card style={{ background: T.white, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Trebuchet MS', sans-serif" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Εργαζόμενος", "Άφιξη", "Αναχώρηση", "Ώρες", role !== "employee" ? "Κόστος" : "", ""].map((h, i) => h && (
                  <th key={i} style={{ color: T.text2, fontSize: 11, fontWeight: 600, padding: "6px 8px", textAlign: "left", letterSpacing: 1, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                return (
                  <tr key={a.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ color: T.text, fontSize: 14 }}>{emp ? `${emp.name} ${emp.surname}` : a.employeeName}</div>
                      {role !== "employee" && emp && <div style={{ color: T.text2, fontSize: 11 }}>€{String(emp.hourlyRate).replace(".", ",")}/ω</div>}
                    </td>
                    <td style={{ padding: "10px 8px", color: T.accent, fontFamily: "Georgia, serif", fontSize: 14 }}>{a.timeIn}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {adminUnlocked || role !== "employee" ? (
                        <input type="time" value={a.timeOut || ""} onChange={e => updateTimeOut(a.id, e.target.value)}
                          style={{ ...st.input, width: 110, padding: "4px 8px" }} />
                      ) : (
                        <span style={{ color: T.text, fontFamily: "Georgia, serif" }}>{a.timeOut || "–"}</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px", color: T.text, fontFamily: "Georgia, serif", fontSize: 14 }}>{a.hours != null ? a.hours.toFixed(1) + "ω" : "–"}</td>
                    {role !== "employee" && <td style={{ padding: "10px 8px", color: T.green, fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700 }}>{a.dailyCost != null ? fmt(a.dailyCost) : "–"}</td>}
                    {(adminUnlocked || role !== "employee") && <td style={{ padding: "10px 8px" }}><Btn onClick={() => del(a.id)} small bg={T.red}>✕</Btn></td>}
                  </tr>
                );
              })}
            </tbody>
            {role !== "employee" && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding: "10px 8px", color: T.text2, fontSize: 13 }}>Σύνολο</td>
                  <td style={{ padding: "10px 8px", color: T.green, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16 }}>{fmt(totalCost)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </Card>
      )}

      {modal && (
        <Modal title="Καταχώρηση Παρουσίας" onClose={() => setModal(false)}>
          {role !== "employee" || adminUnlocked ? (
            <Sel label="Εργαζόμενος" value={form.employeeId} onChange={v => setForm(f => ({ ...f, employeeId: v }))}
              options={[{ value: "", label: "-- Επίλεξε --" }, ...(employees || []).map(e => ({ value: e.id, label: `${e.name} ${e.surname}` }))]} />
          ) : (
            <div style={{ color: T.text, fontSize: 14, marginBottom: 12 }}>
              👤 {employees.find(e => e.id === currentEmpId)?.name} {employees.find(e => e.id === currentEmpId)?.surname}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Inp label="Ώρα Άφιξης" type="time" value={form.timeIn} onChange={v => setForm(f => ({ ...f, timeIn: v }))} />
            <Inp label="Ώρα Αναχώρησης" type="time" value={form.timeOut} onChange={v => setForm(f => ({ ...f, timeOut: v }))} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={() => setModal(false)} bg={T.cat_bg} style={{ flex: 1, border: `1px solid ${T.border}`, color: T.text }}>Ακύρωση</Btn>
            <Btn onClick={save} style={{ flex: 1 }}>💾 Αποθήκευση</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CASH — ΠΡΩΙΝΟ & ΒΡΑΔΙΝΟ ΤΑΜΕΙΟ
//  Logic: Morning = Μέτρηση - Χθεσινό + Πληρωμές_από_Ταμείο + POS_Πρωί
//         Night   = Μέτρηση_Βράδυ - Μέτρηση_Πρωί + Πληρωμές_από_Ταμείο + (POS_Συνολικό - POS_Πρωί) - Κουτί
// ═══════════════════════════════════════════════════════════
const SUPPLIERS = ["Αργυρίου","Ζακώνης","Μάρκετ","Ματζαρόπουλος","Πήγασος","Ελληνικό","Γάλατα","Φρούτα","Πάγος","Απολύμανση","Λογιστής","COSMOTE","Ρεύμα","ΔΕΥΑΝ","Ένσημα","ΦΠΑ","Εφορία","Nova","Άκης","Λευτέρης","Δωρεά/Χορηγία","ΑΛΛΟ"];

function PaymentRow({ pay, onChange, onDelete }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
      <select value={pay.desc} onChange={e => onChange("desc", e.target.value)} style={{ ...st.input, padding: "6px 8px", fontSize: 13 }}>
        <option value="">-- Περιγραφή --</option>
        {SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input type="text" value={pay.amount} onChange={e => onChange("amount", e.target.value)} placeholder="€" style={{ ...st.input, padding: "6px 8px", fontSize: 13 }} />
      <select value={pay.from} onChange={e => onChange("from", e.target.value)} style={{ ...st.input, padding: "6px 8px", fontSize: 13 }}>
        <option value="tameio">💵 Ταμείο</option>
        <option value="kouti">🔒 Κουτί</option>
        <option value="trapeza">🏦 Τράπεζα</option>
      </select>
      <button onClick={onDelete} style={{ background: T.red, border: "none", borderRadius: 6, color: "#fff", width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>✕</button>
    </div>
  );
}

function ShiftBlock({ title, shift, onChange, prevCount, isNight, prevTameio }) {
  const count = pa(shift.xartina) + pa(shift.kermata) + pa(shift.koutakia);
  const payT = (shift.payments || []).filter(p => p.from === "tameio").reduce((s, p) => s + pa(p.amount), 0);
  const payK = (shift.payments || []).filter(p => p.from === "kouti").reduce((s, p) => s + pa(p.amount), 0);
  const payTr = (shift.payments || []).filter(p => p.from === "trapeza").reduce((s, p) => s + pa(p.amount), 0);
  const posNight = isNight ? pa(shift.posTotal) - pa(shift.posMorning) : 0;
  const tameio = isNight
    ? count - prevCount + payT + posNight - pa(shift.addKouti)
    : count - pa(prevTameio || 0) + payT + pa(shift.pos);
  const apoklisi = count - pa(shift.garsonista);

  const addPayment = () => onChange("payments", [...(shift.payments || []), { id: uid(), desc: "", amount: "", from: "tameio" }]);
  const updPayment = (id, k, v) => onChange("payments", (shift.payments || []).map(p => p.id === id ? { ...p, [k]: v } : p));
  const delPayment = (id) => onChange("payments", (shift.payments || []).filter(p => p.id !== id));

  const headerBg = isNight ? "#2F3A1C" : T.accent;

  return (
    <Card style={{ marginBottom: 12, background: T.white }}>
      <div style={{ background: headerBg, color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "Georgia, serif", marginBottom: 14, borderRadius: 6, padding: "8px 12px" }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 4 }}>
        <Inp label="💵 Χαρτινά (€)" value={shift.xartina} onChange={v => onChange("xartina", v)} placeholder="0" />
        <Inp label="🪙 Κέρματα (€)" value={shift.kermata} onChange={v => onChange("kermata", v)} placeholder="0" />
        <Inp label="📦 Κουτάκια (€)" value={shift.koutakia} onChange={v => onChange("koutakia", v)} placeholder="0" />
      </div>
      <Card style={{ background: T.cat_bg, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: T.text2, fontSize: 13 }}>Μέτρηση Ταμείου</span>
          <span style={{ color: T.accent, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16 }}>{fmt(count)}</span>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Inp label="🖥️ Garsonista (€)" value={shift.garsonista} onChange={v => onChange("garsonista", v)} placeholder="0" />
        {!isNight
          ? <Inp label="💳 POS Πρωί (€)" value={shift.pos} onChange={v => onChange("pos", v)} placeholder="0" />
          : <>
            <Inp label="💳 POS Συνολικό (€)" value={shift.posTotal} onChange={v => onChange("posTotal", v)} placeholder="0" />
            <Inp label="💳 POS Βράδυ (auto)" value={posNight > 0 ? posNight.toFixed(2) : ""} onChange={() => {}} readOnly placeholder="Αυτόματο" />
            <Inp label="🔒 Έβαλα στο Κουτί (€)" value={shift.addKouti} onChange={v => onChange("addKouti", v)} placeholder="0" />
          </>
        }
      </div>
      <Sep label="Πληρωμές / Έξοδα" />
      {(shift.payments || []).map(p => (
        <PaymentRow key={p.id} pay={p} onChange={(k, v) => updPayment(p.id, k, v)} onDelete={() => delPayment(p.id)} />
      ))}
      <Btn onClick={addPayment} small bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text, marginTop: 4 }}>+ Πληρωμή</Btn>
      {(payT > 0 || payK > 0 || payTr > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 8 }}>
          {payT > 0 && <div style={{ background: T.cat_bg, borderRadius: 6, padding: "4px 8px", textAlign: "center" }}><div style={{ color: T.text2, fontSize: 10 }}>Ταμείο</div><div style={{ color: T.accent, fontFamily: "Georgia, serif", fontSize: 13 }}>{fmt(payT)}</div></div>}
          {payK > 0 && <div style={{ background: T.cat_bg, borderRadius: 6, padding: "4px 8px", textAlign: "center" }}><div style={{ color: T.text2, fontSize: 10 }}>Κουτί</div><div style={{ color: T.blue, fontFamily: "Georgia, serif", fontSize: 13 }}>{fmt(payK)}</div></div>}
          {payTr > 0 && <div style={{ background: T.cat_bg, borderRadius: 6, padding: "4px 8px", textAlign: "center" }}><div style={{ color: T.text2, fontSize: 10 }}>Τράπεζα</div><div style={{ color: T.green, fontFamily: "Georgia, serif", fontSize: 13 }}>{fmt(payTr)}</div></div>}
        </div>
      )}
      <Sep label="Αποτέλεσμα" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ background: T.cat_bg, borderRadius: 8, padding: 10, textAlign: "center" }}>
          <div style={{ color: T.text2, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>{isNight ? "Βραδινό" : "Πρωινό"} Ταμείο</div>
          <div style={{ color: T.accent, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, marginTop: 4 }}>{fmt(tameio)}</div>
        </div>
        <div style={{ background: T.cat_bg, borderRadius: 8, padding: 10, textAlign: "center" }}>
          <div style={{ color: T.text2, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>Garsonista</div>
          <div style={{ color: T.text, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, marginTop: 4 }}>{fmt(shift.garsonista || 0)}</div>
        </div>
        <div style={{ background: T.cat_bg, borderRadius: 8, padding: 10, textAlign: "center" }}>
          <div style={{ color: T.text2, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>Απόκλιση</div>
          <div style={{ color: apoklisi >= 0 ? T.green : T.red, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, marginTop: 4 }}>{apoklisi >= 0 ? "+" : ""}{fmt(apoklisi)}</div>
        </div>
      </div>
    </Card>
  );
}

function Cash({ role, dailyData, setDailyData }) {
  const [date, setDate] = useState(todayISO());
  const dd = dailyData[date] || {};
  const m = dd.morning || {}; const n = dd.night || {};
  const days = Object.keys(dailyData).sort();
  const prevDay = days.filter(d => d < date).pop();
  const prev = prevDay ? dailyData[prevDay] : {};
  const prevTameioEnd = prev.tameioEnd || 0;
  const prevKoutiEnd = prev.koutiEnd || 0;
  const prevTrapezaEnd = prev.trapezaEnd || 0;

  const updateM = (k, v) => setDailyData(d => ({ ...d, [date]: { ...d[date], morning: { ...(d[date]?.morning || {}), [k]: v } } }));
  const updateN = (k, v) => setDailyData(d => ({ ...d, [date]: { ...d[date], night: { ...(d[date]?.night || {}), [k]: v, posMorning: d[date]?.morning?.pos || "" } } }));

  const mCount = pa(m.xartina) + pa(m.kermata) + pa(m.koutakia);
  const mPayT = (m.payments || []).filter(p => p.from === "tameio").reduce((s, p) => s + pa(p.amount), 0);
  const mTameio = mCount - pa(prevTameioEnd) + mPayT + pa(m.pos);
  const nCount = pa(n.xartina) + pa(n.kermata) + pa(n.koutakia);
  const nPayT = (n.payments || []).filter(p => p.from === "tameio").reduce((s, p) => s + pa(p.amount), 0);
  const posNight = pa(n.posTotal) - pa(m.pos);
  const nTameio = nCount - mCount + nPayT + posNight - pa(n.addKouti);
  const tameioImeras = mTameio + nTameio;
  const allPays = [...(m.payments || []), ...(n.payments || [])];
  const koutiEnd = pa(prevKoutiEnd) + pa(n.addKouti) - allPays.filter(p => p.from === "kouti").reduce((s, p) => s + pa(p.amount), 0);
  const trapezaEnd = pa(prevTrapezaEnd) + pa(n.posTotal) - allPays.filter(p => p.from === "trapeza").reduce((s, p) => s + pa(p.amount), 0);

  const save = () => {
    setDailyData(d => ({
      ...d,
      [date]: {
        ...d[date],
        tameioEnd: mCount,
        koutiEnd, trapezaEnd, mTameio, nTameio, tameioImeras,
        savedAt: new Date().toISOString(),
      }
    }));
    alert("✅ Αποθηκεύτηκε!");
  };

  const isAdminOrPartner = role !== "employee";

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="💵 Ταμείο" subtitle={fmtD(date)} actions={<Btn onClick={save}>💾 Αποθήκευση</Btn>} />
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <div>
          <label style={st.label}>Ημερομηνία</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...st.input, width: "auto" }} />
        </div>
        {prevDay && (
          <Card style={{ padding: "8px 14px", background: T.cat_bg }}>
            <div style={{ color: T.text2, fontSize: 11 }}>Χθεσινό Ταμείο</div>
            <div style={{ color: T.accent, fontFamily: "Georgia, serif", fontWeight: 700 }}>{fmt(prevTameioEnd)}</div>
          </Card>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <ShiftBlock title="🌅 ΠΡΩΙΝΟ ΤΑΜΕΙΟ (06:30 – 14:30)"
          shift={{ ...m, prevTameio: prevTameioEnd }} onChange={updateM} prevCount={0} isNight={false} prevTameio={prevTameioEnd} />
        <ShiftBlock title="🌙 ΒΡΑΔΙΝΟ ΤΑΜΕΙΟ (14:30 – 22:30)"
          shift={{ ...n, posMorning: m.pos }} onChange={updateN} prevCount={mCount} isNight={true} />
      </div>
      {isAdminOrPartner && (
        <>
          <Sep label="Ημερήσια Σύνοψη" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            <AmtBox label="Πρωινό Ταμείο" value={mTameio} />
            <AmtBox label="Βραδινό Ταμείο" value={nTameio} />
            <AmtBox label="ΤΑΜΕΙΟ ΗΜΕΡΑΣ" value={tameioImeras} color={T.accent} />
            <AmtBox label="Κουτί (Νέο Υπόλ.)" value={koutiEnd} color={T.blue} />
            <AmtBox label="Τράπεζα (Νέο Υπόλ.)" value={trapezaEnd} color={T.green} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn onClick={save} style={{ padding: "10px 28px", fontSize: 15 }}>💾 Αποθήκευση Ημέρας</Btn>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ACCOUNTS
// ═══════════════════════════════════════════════════════════
function Accounts({ dailyData, setDailyData, initBalances, setInitBalances }) {
  const [showInit, setShowInit] = useState(false);
  const [initForm, setInitForm] = useState({ kouti: String(initBalances.kouti), trapeza: String(initBalances.trapeza) });
  const days = Object.keys(dailyData).sort();
  const lastDay = days[days.length - 1];
  const last = lastDay ? dailyData[lastDay] : {};
  const koutiCurrent = last.koutiEnd ?? initBalances.kouti;
  const trapezaCurrent = last.trapezaEnd ?? initBalances.trapeza;
  const saveInit = () => { setInitBalances({ kouti: pa(initForm.kouti), trapeza: pa(initForm.trapeza) }); setShowInit(false); };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="🏦 Λογαριασμοί" subtitle="Κουτί & Τράπεζα"
        actions={<Btn onClick={() => setShowInit(true)} small bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text }}>⚙️ Αρχικά Υπόλοιπα</Btn>} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card style={{ background: T.white }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          <div style={{ color: T.text2, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Κουτί</div>
          <div style={{ color: T.blue, fontSize: 36, fontWeight: 700, fontFamily: "Georgia, serif", margin: "8px 0" }}>{fmt(koutiCurrent)}</div>
          <div style={{ color: T.text3, fontSize: 12 }}>Τελευταία: {lastDay ? fmtD(lastDay) : "–"}</div>
        </Card>
        <Card style={{ background: T.white }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏦</div>
          <div style={{ color: T.text2, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Τράπεζα</div>
          <div style={{ color: T.green, fontSize: 36, fontWeight: 700, fontFamily: "Georgia, serif", margin: "8px 0" }}>{fmt(trapezaCurrent)}</div>
          <div style={{ color: T.text3, fontSize: 12 }}>POS → αυτόματα κάθε βράδυ</div>
        </Card>
      </div>
      <Sep label="Ιστορικό ανά Ημέρα" />
      <Card style={{ background: T.white, overflowX: "auto" }}>
        {days.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: T.text2 }}>Δεν υπάρχουν δεδομένα ακόμα</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Trebuchet MS', sans-serif" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Ημερομηνία", "Ταμείο Ημέρας", "Κουτί", "Τράπεζα", "POS"].map(h => (
                  <th key={h} style={{ color: T.text2, fontSize: 11, fontWeight: 600, padding: "8px 10px", textAlign: "left", letterSpacing: 1, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.slice().reverse().map(day => {
                const d = dailyData[day];
                return (
                  <tr key={day} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "10px", color: T.text, fontSize: 14 }}>{fmtD(day)}</td>
                    <td style={{ padding: "10px", color: T.accent, fontFamily: "Georgia, serif" }}>{d.tameioImeras != null ? fmt(d.tameioImeras) : "–"}</td>
                    <td style={{ padding: "10px", color: T.blue, fontFamily: "Georgia, serif" }}>{d.koutiEnd != null ? fmt(d.koutiEnd) : "–"}</td>
                    <td style={{ padding: "10px", color: T.green, fontFamily: "Georgia, serif" }}>{d.trapezaEnd != null ? fmt(d.trapezaEnd) : "–"}</td>
                    <td style={{ padding: "10px", color: T.text2, fontFamily: "Georgia, serif" }}>{d.night?.posTotal ? fmt(d.night.posTotal) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {showInit && (
        <Modal title="⚙️ Αρχικά Υπόλοιπα" onClose={() => setShowInit(false)}>
          <Inp label="Αρχικό Κουτί (€)" value={initForm.kouti} onChange={v => setInitForm(f => ({ ...f, kouti: v }))} />
          <Inp label="Αρχική Τράπεζα (€)" value={initForm.trapeza} onChange={v => setInitForm(f => ({ ...f, trapeza: v }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={() => setShowInit(false)} bg={T.cat_bg} style={{ flex: 1, border: `1px solid ${T.border}`, color: T.text }}>Ακύρωση</Btn>
            <Btn onClick={saveInit} style={{ flex: 1 }}>💾 Αποθήκευση</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  AFFILIATES (Συνεργάτες) — Payments logic
// ═══════════════════════════════════════════════════════════
function Affiliates({ affiliates, setAffiliates }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ id: "", name: "", type: "supplier", contactName: "", phone: "", email: "", notes: "", balance: "" });
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", date: todayISO(), desc: "", from: "tameio" });

  const TYPES = [
    { value: "supplier", label: "Προμηθευτής" },
    { value: "freelancer", label: "Freelancer" },
    { value: "partner", label: "Εταίρος" },
    { value: "other", label: "Άλλο" },
  ];

  const openAdd = () => { setForm({ id: uid(), name: "", type: "supplier", contactName: "", phone: "", email: "", notes: "", balance: "" }); setModal("add"); };
  const openEdit = (a) => { setForm(a); setModal("edit"); };
  const close = () => setModal(null);

  const save = () => {
    if (!form.name) return alert("Συμπλήρωσε όνομα");
    if (modal === "add") setAffiliates(prev => [...prev, { ...form, payments: [] }]);
    else setAffiliates(prev => prev.map(a => a.id === form.id ? form : a));
    close();
  };
  const del = (id) => { if (confirm("Διαγραφή;")) setAffiliates(prev => prev.filter(a => a.id !== id)); };

  const openPay = (aff) => { setPayModal(aff); setPayForm({ amount: "", date: todayISO(), desc: "", from: "tameio" }); };
  const savePay = () => {
    if (!payForm.amount) return alert("Συμπλήρωσε ποσό");
    const pay = { id: uid(), ...payForm };
    setAffiliates(prev => prev.map(a => a.id === payModal.id ? { ...a, payments: [...(a.payments || []), pay] } : a));
    setPayModal(null);
  };
  const delPay = (affId, payId) => {
    setAffiliates(prev => prev.map(a => a.id === affId ? { ...a, payments: (a.payments || []).filter(p => p.id !== payId) } : a));
  };

  const typeColor = { supplier: T.blue, freelancer: T.purple, partner: T.yellow, other: T.text2 };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="🤝 Συνεργάτες & Πληρωμές" subtitle={`${(affiliates || []).length} καταχωρήσεις`}
        actions={<Btn onClick={openAdd}>+ Νέος Συνεργάτης</Btn>} />

      {(affiliates || []).length === 0 ? (
        <Card style={{ background: T.white }}><div style={{ textAlign: "center", padding: 32, color: T.text2 }}>Δεν υπάρχουν συνεργάτες.<br /><br /><Btn onClick={openAdd}>Προσθήκη</Btn></div></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(affiliates || []).map(aff => {
            const totalPaid = (aff.payments || []).reduce((s, p) => s + pa(p.amount), 0);
            const balance = pa(aff.balance) - totalPaid;
            return (
              <Card key={aff.id} style={{ background: T.white }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ color: T.text, fontSize: 16, fontWeight: 700, fontFamily: "Georgia, serif" }}>{aff.name}</div>
                      <Badge text={TYPES.find(t => t.value === aff.type)?.label || aff.type} color={typeColor[aff.type] || T.text2} />
                    </div>
                    {aff.contactName && <div style={{ color: T.text2, fontSize: 13 }}>👤 {aff.contactName}</div>}
                    {aff.phone && <div style={{ color: T.text2, fontSize: 13 }}>📞 {aff.phone}</div>}
                    {aff.notes && <div style={{ color: T.text3, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>{aff.notes}</div>}
                  </div>
                  <div style={{ textAlign: "right", minWidth: 120 }}>
                    {aff.balance && (
                      <>
                        <div style={{ color: T.text2, fontSize: 11, textTransform: "uppercase" }}>Ισοζύγιο</div>
                        <div style={{ color: balance >= 0 ? T.green : T.red, fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{fmt(balance)}</div>
                        <div style={{ color: T.text3, fontSize: 11 }}>Πληρώθηκε: {fmt(totalPaid)}</div>
                      </>
                    )}
                  </div>
                </div>

                {(aff.payments || []).length > 0 && (
                  <>
                    <Sep label="Πληρωμές" />
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'Trebuchet MS', sans-serif" }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                            {["Ημερ.", "Ποσό", "Από", "Σημείωση", ""].map(h => (
                              <th key={h} style={{ color: T.text2, fontSize: 11, padding: "4px 8px", textAlign: "left" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(aff.payments || []).map(p => (
                            <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                              <td style={{ padding: "6px 8px", color: T.text }}>{fmtD(p.date)}</td>
                              <td style={{ padding: "6px 8px", color: T.green, fontFamily: "Georgia, serif", fontWeight: 700 }}>{fmt(p.amount)}</td>
                              <td style={{ padding: "6px 8px" }}>
                                <Badge text={p.from === "tameio" ? "💵 Ταμείο" : p.from === "kouti" ? "🔒 Κουτί" : "🏦 Τράπεζα"} color={p.from === "tameio" ? T.accent : p.from === "kouti" ? T.blue : T.green} />
                              </td>
                              <td style={{ padding: "6px 8px", color: T.text2 }}>{p.desc}</td>
                              <td style={{ padding: "6px 8px" }}><Btn onClick={() => delPay(aff.id, p.id)} small bg={T.red}>✕</Btn></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Btn onClick={() => openPay(aff)} small bg={T.green}>💳 Πληρωμή</Btn>
                  <Btn onClick={() => openEdit(aff)} small bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text }}>✏️</Btn>
                  <Btn onClick={() => del(aff.id)} small bg={T.red}>🗑️</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal === "add" ? "Νέος Συνεργάτης" : "Επεξεργασία"} onClose={close}>
          <Inp label="Επωνυμία / Όνομα" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
          <Sel label="Τύπος" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={TYPES} />
          <Inp label="Υπεύθυνος" value={form.contactName} onChange={v => setForm(f => ({ ...f, contactName: v }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Inp label="Τηλέφωνο" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
            <Inp label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
            <Inp label="Αρχικό Ισοζύγιο (€)" value={form.balance} onChange={v => setForm(f => ({ ...f, balance: v }))} placeholder="π.χ. 500" />
          </div>
          <Inp label="Σημειώσεις" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={close} bg={T.cat_bg} style={{ flex: 1, border: `1px solid ${T.border}`, color: T.text }}>Ακύρωση</Btn>
            <Btn onClick={save} style={{ flex: 1 }}>💾 Αποθήκευση</Btn>
          </div>
        </Modal>
      )}

      {payModal && (
        <Modal title={`💳 Πληρωμή — ${payModal.name}`} onClose={() => setPayModal(null)}>
          <Inp label="Ποσό (€)" value={payForm.amount} onChange={v => setPayForm(f => ({ ...f, amount: v }))} placeholder="0.00" />
          <Inp label="Ημερομηνία" type="date" value={payForm.date} onChange={v => setPayForm(f => ({ ...f, date: v }))} />
          <Sel label="Από" value={payForm.from} onChange={v => setPayForm(f => ({ ...f, from: v }))}
            options={[{ value: "tameio", label: "💵 Ταμείο" }, { value: "kouti", label: "🔒 Κουτί" }, { value: "trapeza", label: "🏦 Τράπεζα" }]} />
          <Inp label="Σημείωση" value={payForm.desc} onChange={v => setPayForm(f => ({ ...f, desc: v }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={() => setPayModal(null)} bg={T.cat_bg} style={{ flex: 1, border: `1px solid ${T.border}`, color: T.text }}>Ακύρωση</Btn>
            <Btn onClick={savePay} style={{ flex: 1 }}>💾 Καταχώρηση</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  SCHEDULE — Smart auto-schedule with constraints + ρεπό
// ═══════════════════════════════════════════════════════════
const SHIFTS_DEF = [
  { id: "morning", label: "Πρωί", time: "06:30–14:30" },
  { id: "night",   label: "Βράδυ", time: "14:30–22:30" }
];

const getMonday = (d) => {
  const dt = new Date(d); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return dt.toISOString().split("T")[0];
};
const isoToday = () => new Date().toISOString().split("T")[0];
const isPastDay  = (dateISO) => dateISO < isoToday();
const isFrozen   = (dateISO, shift) =>
  isPastDay(dateISO) || (dateISO === isoToday() && shift === "morning");

function Schedule({ employees, role, empId: currentEmpId }) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [schedule, setSchedule, schedLoaded] = useIDB("schedule", "data", {});
  const [busy, setBusy]                       = useIDB("busyDays",  "data", {});
  const [constraints, setConstraints]         = useIDB("settings",  "constraints", []);
  const [dayOff, setDayOff]                   = useIDB("settings",  "dayOff", []);
  const [showBusy, setShowBusy]               = useState(false);
  const [showConstraints, setShowConstraints] = useState(false);
  const [showRep, setShowRep]                 = useState(false);
  const [conForm, setConForm]                 = useState({
    empId: role === "employee" ? (currentEmpId || "") : "", day: "", shift: "morning"
  });
  const [repForm, setRepForm] = useState({
    empId: role === "employee" ? (currentEmpId || "") : "", day: ""
  });

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
  const weekKey = weekStart;

  const getSlot  = (day, shift) => schedule[weekKey]?.[day]?.[shift] || [];
  const setSlot  = (day, shift, emps) =>
    setSchedule(s => ({
      ...s,
      [weekKey]: { ...(s[weekKey] || {}), [day]: { ...(s[weekKey]?.[day] || {}), [shift]: emps } }
    }));

  const toggleEmp = (day, shift, empId) => {
    if (isFrozen(day, shift)) return;
    const cur = getSlot(day, shift);
    setSlot(day, shift, cur.includes(empId) ? cur.filter(id => id !== empId) : [...cur, empId]);
  };

  const getBusy     = (date, shift) => busy[`${date}_${shift}`] ?? 0;
  const setBusySlot = (date, shift, level) =>
    setBusy(b => ({ ...b, [`${date}_${shift}`]: level }));

  const hasConstraint = (empId, date, shift) =>
    (constraints || []).some(c => c.empId === empId && c.date === date && c.shift === shift);
  const addConstraint = () => {
    if (!conForm.empId || !conForm.day) return alert("Επίλεξε εργαζόμενο και ημέρα");
    if ((constraints || []).some(c => c.empId === conForm.empId && c.date === conForm.day && c.shift === conForm.shift))
      return alert("Υπάρχει ήδη αυτός ο περιορισμός");
    setConstraints(prev => [...(prev || []), { id: uid(), empId: conForm.empId, date: conForm.day, shift: conForm.shift }]);
  };
  const delConstraint = (id) => setConstraints(prev => prev.filter(c => c.id !== id));

  const hasRep = (empId, date) => (dayOff || []).some(r => r.empId === empId && r.date === date);
  const addRep = () => {
    if (!repForm.empId || !repForm.day) return alert("Επίλεξε εργαζόμενο και ημέρα");
    if (hasRep(repForm.empId, repForm.day)) return alert("Υπάρχει ήδη ρεπό για αυτή την ημέρα");
    setDayOff(prev => [...(prev || []), { id: uid(), empId: repForm.empId, date: repForm.day }]);
  };
  const delRep = (id) => setDayOff(prev => prev.filter(r => r.id !== id));

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d.toISOString().split("T")[0]); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d.toISOString().split("T")[0]); };

  const shiftWarnings = (assigned, shift) => {
    const emps = assigned.map(id => (employees || []).find(e => e.id === id)).filter(Boolean);
    const has = (ab) => emps.some(e => e.abilities?.[ab]);
    const w = [];
    if (!has("serve"))      w.push("🍽️ Σερβιτόρος");
    if (!has("makeCoffee")) w.push("☕ Barista");
    if (!has("delivery"))   w.push("🛵 Delivery");
    if (shift === "morning" && !has("openShop"))  w.push("🔑 Άνοιγμα");
    if (shift === "night"   && !has("closeShop")) w.push("🔒 Κλείσιμο");
    return w;
  };

  const autoGenerate = () => {
    if (!confirm("Αυτόματη δημιουργία;\n• Δεν αλλάζουν οι περασμένες μέρες και το πρωί της σήμερα.\n• Οι χειροκίνητες επιλογές στις υπόλοιπες μέρες θα αντικατασταθούν.")) return;
    const currentWeek = schedule[weekKey] || {};
    const newSch = { ...currentWeek };
    const partners = (employees || []).filter(e => e.role === "partner");
    const partner1 = partners[0] || null;
    const partner2 = partners[1] || null;

    weekDates.forEach(date => {
      if (isFrozen(date, "morning") && isFrozen(date, "night")) return;
      const busyM = getBusy(date, "morning");
      const busyN = getBusy(date, "night");
      const minM  = 2 + busyM;
      const minN  = 2 + busyN;
      const allNP = (employees || []).filter(e => e.role !== "partner");
      const availM = allNP.filter(e => !hasConstraint(e.id, date, "morning") && !hasRep(e.id, date));
      const availN = allNP.filter(e => !hasConstraint(e.id, date, "night")   && !hasRep(e.id, date));
      const frozenM   = isFrozen(date, "morning");
      const morningCrew = frozenM ? [...(currentWeek[date]?.morning || [])] : [];
      const nightCrew   = [];
      const p2HasRep = partner2 && hasRep(partner2.id, date);

      if (!frozenM && partner1 && !hasRep(partner1.id, date) && !hasConstraint(partner1.id, date, "morning")) {
        morningCrew.push(partner1.id);
      }
      if (partner2 && !hasRep(partner2.id, date) && !hasConstraint(partner2.id, date, "night")) {
        nightCrew.push(partner2.id);
      }
      if (p2HasRep && partner1 && !hasRep(partner1.id, date) && !hasConstraint(partner1.id, date, "night")) {
        if (!nightCrew.includes(partner1.id)) nightCrew.push(partner1.id);
        const idx = morningCrew.indexOf(partner1.id);
        if (idx >= 0) morningCrew.splice(idx, 1);
      }

      if (!frozenM) {
        const addM = (cond) => { const e = availM.find(e => cond(e) && !morningCrew.includes(e.id)); if (e) morningCrew.push(e.id); };
        const hasMC = (ab) => morningCrew.some(id => (employees || []).find(e => e.id === id)?.abilities?.[ab]);
        if (!hasMC("openShop"))   addM(e => e.abilities?.openShop);
        if (!hasMC("makeCoffee")) addM(e => e.abilities?.makeCoffee);
        if (!hasMC("delivery"))   addM(e => e.abilities?.delivery);
        if (!hasMC("serve"))      addM(e => e.abilities?.serve);
        while (morningCrew.length < minM) {
          const e = availM.find(e => !morningCrew.includes(e.id) && !nightCrew.includes(e.id));
          if (e) morningCrew.push(e.id); else break;
        }
      }
      const addN = (cond) => { const e = availN.find(e => cond(e) && !nightCrew.includes(e.id) && !morningCrew.includes(e.id)); if (e) nightCrew.push(e.id); };
      const hasNC = (ab) => nightCrew.some(id => (employees || []).find(e => e.id === id)?.abilities?.[ab]);
      if (!hasNC("closeShop")) addN(e => e.abilities?.closeShop);
      if (!hasNC("makeCoffee")) addN(e => e.abilities?.makeCoffee);
      if (!hasNC("delivery"))   addN(e => e.abilities?.delivery);
      if (!hasNC("serve"))      addN(e => e.abilities?.serve);
      while (nightCrew.length < minN) {
        const e = availN.find(e => !nightCrew.includes(e.id) && !morningCrew.includes(e.id));
        if (e) nightCrew.push(e.id); else break;
      }
      newSch[date] = { morning: morningCrew, night: nightCrew };
    });
    setSchedule(s => ({ ...s, [weekKey]: newSch }));
  };

  if (!schedLoaded) return <div style={{ padding: 24, color: T.text2 }}>Φόρτωση...</div>;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="📅 Εβδομαδιαίο Πρόγραμμα"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={() => setShowConstraints(true)} small bg={T.red} style={{ opacity: 0.85 }}>
              🚫 {role === "employee" ? "Αδυναμία μου" : "Αδυναμίες"}
            </Btn>
            {role !== "employee" && (
              <>
                <Btn onClick={() => setShowRep(true)} small bg={T.purple} style={{ opacity: 0.85 }}>🛌 Ρεπό</Btn>
                <Btn onClick={() => setShowBusy(true)} small bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text }}>⚙️ Πολυσύχναστες</Btn>
                <Btn onClick={autoGenerate} small>🤖 Αυτόματο</Btn>
              </>
            )}
          </div>
        } />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Btn onClick={prevWeek} small bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text }}>‹</Btn>
        <span style={{ color: T.text, fontFamily: "Georgia, serif", fontSize: 15 }}>
          {fmtD(weekDates[0])} – {fmtD(weekDates[6])}
        </span>
        <Btn onClick={nextWeek} small bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text }}>›</Btn>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, fontSize: 11, fontFamily: "'Trebuchet MS', sans-serif" }}>
        <span style={{ background: T.cat_bg, borderRadius: 4, padding: "2px 7px", color: T.text2 }}>Εργαζόμενος</span>
        <span style={{ background: "#FFFDE7", borderRadius: 4, padding: "2px 7px", color: "#B8860B" }}>Εταίρος</span>
        <span style={{ background: "#FFF3F3", border: `1px solid ${T.red}`, borderRadius: 4, padding: "2px 7px", color: T.red }}>⚠️ Αδυναμία</span>
        <span style={{ background: "#F3E8FF", borderRadius: 4, padding: "2px 7px", color: T.purple }}>🛌 Ρεπό</span>
        <span style={{ background: "#F0F0F0", borderRadius: 4, padding: "2px 7px", color: "#888" }}>🔒 Κλειδωμένο</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `120px repeat(7, 1fr)`, gap: 6, minWidth: 960 }}>
          <div />
          {weekDates.map((date, i) => {
            const bm = getBusy(date, "morning");
            const bn = getBusy(date, "night");
            const isToday = date === isoToday();
            return (
              <div key={date} style={{
                textAlign: "center", padding: "8px 4px", background: isToday ? "#F0F4E8" : "transparent",
                borderRadius: 6, border: isToday ? `1px solid ${T.accent}` : "1px solid transparent"
              }}>
                <div style={{ color: T.text, fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif" }}>{DAYS_GR[i]}</div>
                <div style={{ color: isToday ? T.accent : T.text3, fontSize: 11, fontWeight: isToday ? 700 : 400 }}>{fmtD(date)}{isToday ? " ←" : ""}</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 3 }}>
                  {bm > 0 && <span style={{ fontSize: 9, color: bm === 1 ? T.yellow : T.red, background: bm === 1 ? "#FFF8E1" : "#FFEBEE", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>☀️{"●".repeat(bm)}</span>}
                  {bn > 0 && <span style={{ fontSize: 9, color: bn === 1 ? T.yellow : T.red, background: bn === 1 ? "#FFF8E1" : "#FFEBEE", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>🌙{"●".repeat(bn)}</span>}
                </div>
              </div>
            );
          })}

          {SHIFTS_DEF.map(shift => (
            <>
              <div key={shift.id + "_label"} style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8px" }}>
                <div style={{ color: shift.id === "morning" ? T.accent : T.sidebar, fontSize: 13, fontWeight: 700, fontFamily: "Georgia, serif" }}>
                  {shift.id === "morning" ? "☀️" : "🌙"} {shift.label}
                </div>
                <div style={{ color: T.text3, fontSize: 11 }}>{shift.time}</div>
              </div>
              {weekDates.map(date => {
                const frozen   = isFrozen(date, shift.id);
                const assigned = getSlot(date, shift.id);
                const assignedEmps = assigned.map(id => (employees || []).find(e => e.id === id)).filter(Boolean);
                const warnings = shiftWarnings(assigned, shift.id);
                const repEmps  = role !== "employee" && shift.id === "morning"
                  ? (employees || []).filter(e => hasRep(e.id, date) && !getSlot(date, "morning").includes(e.id) && !getSlot(date, "night").includes(e.id))
                  : [];
                const slotConstraints = role !== "employee"
                  ? (constraints || []).filter(c => c.date === date && c.shift === shift.id)
                  : [];
                return (
                  <div key={date + shift.id} style={{
                    ...st.card, background: frozen ? "#F5F5F5" : T.white, padding: 8, minHeight: 90,
                    border: `1px solid ${frozen ? "#DDD" : T.border}`, opacity: frozen ? 0.8 : 1
                  }}>
                    {frozen && <div style={{ fontSize: 9, color: "#AAA", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>🔒 Κλειδωμένο</div>}
                    {assignedEmps.map(emp => {
                      const isConstrained = hasConstraint(emp.id, date, shift.id);
                      const isPartner = emp.role === "partner";
                      return (
                        <div key={emp.id} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          background: isConstrained ? "#FFF3F3" : isPartner ? "#FFFDE7" : T.cat_bg,
                          borderRadius: 4, padding: "3px 6px", marginBottom: 3, fontSize: 12,
                          border: isConstrained ? `1px solid ${T.red}` : "none"
                        }}>
                          <span style={{ color: isPartner ? "#B8860B" : T.text, fontWeight: isPartner ? 700 : 400 }}>
                            {emp.name}{isConstrained ? " ⚠️" : ""}
                          </span>
                          {role !== "employee" && !frozen && (
                            <button onClick={() => toggleEmp(date, shift.id, emp.id)}
                              style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11, padding: 0 }}>✕</button>
                          )}
                        </div>
                      );
                    })}
                    {repEmps.map(emp => (
                      <div key={emp.id} style={{ background: "#F3E8FF", borderRadius: 4, padding: "2px 6px", marginBottom: 3, fontSize: 11, color: T.purple, fontStyle: "italic" }}>
                        🛌 {emp.name}
                      </div>
                    ))}
                    {slotConstraints.length > 0 && (
                      <div style={{ marginTop: 3, borderTop: `1px dashed ${T.border}`, paddingTop: 3 }}>
                        {slotConstraints.map(c => {
                          const emp = (employees || []).find(e => e.id === c.empId);
                          return emp ? <div key={c.id} style={{ fontSize: 10, color: T.red, display: "flex", alignItems: "center", gap: 3 }}>🚫 <span>{emp.name}</span></div> : null;
                        })}
                      </div>
                    )}
                    {assigned.length > 0 && warnings.length > 0 && (
                      <div title={`Λείπει: ${warnings.join(", ")}`} style={{ fontSize: 10, color: T.red, marginTop: 3, fontWeight: 700, cursor: "help" }}>
                        ⚠️ {warnings.map(w => w.split(" ")[0]).join(" ")}
                      </div>
                    )}
                    {role !== "employee" && !frozen && (
                      <select onChange={e => { if (e.target.value) { toggleEmp(date, shift.id, e.target.value); e.target.value = ""; } }}
                        style={{ ...st.input, fontSize: 11, padding: "2px 4px", marginTop: assigned.length > 0 ? 4 : 0, color: T.text3 }}>
                        <option value="">+ Εργαζόμενος</option>
                        {(employees || []).filter(e => !assigned.includes(e.id)).map(e => {
                          const constrained = hasConstraint(e.id, date, shift.id);
                          const rep = hasRep(e.id, date);
                          return <option key={e.id} value={e.id} style={{ color: constrained ? T.red : rep ? T.purple : T.text }}>{e.name} {e.surname}{constrained ? " 🚫" : rep ? " 🛌" : ""}</option>;
                        })}
                      </select>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {showBusy && (
        <Modal title="⚙️ Πολυσύχναστες Μέρες" onClose={() => setShowBusy(false)} wide>
          <div style={{ color: T.text2, fontSize: 13, marginBottom: 12 }}>
            Ορίσε επίπεδο κίνησης <b>ανά βάρδια</b>. Κάθε επίπεδο προσθέτει +1 άτομο στο ελάχιστο πλήρωμα (base: 2).
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div style={{ color: T.text2, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Ημέρα</div>
            <div style={{ color: T.accent, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>☀️ Πρωινή</div>
            <div style={{ color: T.sidebar, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>🌙 Βραδινή</div>
          </div>
          {weekDates.map((date, i) => (
            <div key={date} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "8px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
              <span style={{ color: T.text, fontFamily: "Georgia, serif" }}>{DAYS_GR[i]} <span style={{ color: T.text3, fontSize: 11 }}>{fmtD(date)}</span></span>
              {["morning", "night"].map(sh => (
                <div key={sh} style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2, 3].map(lvl => {
                    const active = getBusy(date, sh) === lvl;
                    const col = lvl === 0 ? T.accent : lvl === 1 ? T.yellow : lvl === 2 ? "#E67E22" : T.red;
                    return (
                      <button key={lvl} onClick={() => setBusySlot(date, sh, lvl)} style={{
                        background: active ? col : T.cat_bg, border: `1px solid ${active ? col : T.border}`,
                        borderRadius: 5, color: active ? "#fff" : T.text2, padding: "3px 8px",
                        cursor: "pointer", fontSize: 11, minWidth: 28, fontWeight: 700
                      }}>{lvl === 0 ? "–" : "●".repeat(lvl)}</button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 10, display: "flex", gap: 12, fontSize: 11, color: T.text2, flexWrap: "wrap" }}>
            <span>– Κανονική (2 min)</span>
            <span style={{ color: T.yellow }}>● Πολυσύχναστη (3)</span>
            <span style={{ color: "#E67E22" }}>●● Πολύ Πολυσύχναστη (4)</span>
            <span style={{ color: T.red }}>●●● Μέγιστη (5)</span>
          </div>
          <Btn onClick={() => setShowBusy(false)} style={{ width: "100%", marginTop: 12 }}>Κλείσιμο</Btn>
        </Modal>
      )}

      {showConstraints && (
        <Modal title={role === "employee" ? "🚫 Αδυναμία μου — Δεν μπορώ να δουλέψω" : "🚫 Αδυναμίες Εργαζομένων"} onClose={() => setShowConstraints(false)} wide>
          {role === "employee" ? (
            <>
              <div style={{ color: T.text2, fontSize: 13, marginBottom: 12 }}>Επίλεξε ημέρα και βάρδια που <b>δεν</b> μπορείς να δουλέψεις.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 12 }}>
                <div>
                  <label style={st.label}>Ημέρα</label>
                  <input type="date" value={conForm.day} onChange={e => setConForm(f => ({ ...f, day: e.target.value }))} style={{ ...st.input }} />
                </div>
                <Sel label="Βάρδια" value={conForm.shift} onChange={v => setConForm(f => ({ ...f, shift: v }))}
                  options={SHIFTS_DEF.map(s => ({ value: s.id, label: `${s.id === "morning" ? "☀️" : "🌙"} ${s.label}` }))} />
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 10 }}>
                  <Btn onClick={() => {
                    if (!conForm.day) return alert("Επίλεξε ημέρα");
                    const empIdToUse = currentEmpId || "";
                    if ((constraints || []).some(c => c.empId === empIdToUse && c.date === conForm.day && c.shift === conForm.shift)) return alert("Υπάρχει ήδη!");
                    setConstraints(prev => [...(prev || []), { id: uid(), empId: empIdToUse, date: conForm.day, shift: conForm.shift }]);
                  }} small>+ Προσθήκη</Btn>
                </div>
              </div>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {(constraints || []).filter(c => c.empId === currentEmpId).length === 0
                  ? <div style={{ textAlign: "center", padding: 16, color: T.text2 }}>Δεν έχεις καταχωρήσει αδυναμίες</div>
                  : (constraints || []).filter(c => c.empId === currentEmpId).map(c => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ color: T.text, fontSize: 14 }}>{fmtD(c.date)} — {c.shift === "morning" ? "☀️ Πρωί" : "🌙 Βράδυ"}</span>
                      <Btn onClick={() => delConstraint(c.id)} small bg={T.red}>✕</Btn>
                    </div>
                  ))
                }
              </div>
            </>
          ) : (
            <>
              <div style={{ color: T.text2, fontSize: 13, marginBottom: 12 }}>Πότε ΔΕΝ μπορεί να δουλέψει κάποιος. Το αυτόματο πρόγραμμα τους παρακάμπτει.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 12 }}>
                <Sel label="Εργαζόμενος" value={conForm.empId} onChange={v => setConForm(f => ({ ...f, empId: v }))}
                  options={[{ value: "", label: "-- Επίλεξε --" }, ...(employees || []).map(e => ({ value: e.id, label: `${e.name} ${e.surname}` }))]} />
                <div>
                  <label style={st.label}>Ημέρα</label>
                  <input type="date" value={conForm.day} onChange={e => setConForm(f => ({ ...f, day: e.target.value }))} style={{ ...st.input }} />
                </div>
                <Sel label="Βάρδια" value={conForm.shift} onChange={v => setConForm(f => ({ ...f, shift: v }))}
                  options={SHIFTS_DEF.map(s => ({ value: s.id, label: `${s.id === "morning" ? "☀️" : "🌙"} ${s.label}` }))} />
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 10 }}>
                  <Btn onClick={addConstraint} small>+ Προσθήκη</Btn>
                </div>
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {(constraints || []).length === 0
                  ? <div style={{ textAlign: "center", padding: 16, color: T.text2 }}>Δεν υπάρχουν αδυναμίες</div>
                  : (constraints || []).map(c => {
                      const emp = (employees || []).find(e => e.id === c.empId);
                      return (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                          <span style={{ color: T.text, fontSize: 14 }}><b>{emp ? `${emp.name} ${emp.surname}` : "–"}</b> — {fmtD(c.date)} — {c.shift === "morning" ? "☀️ Πρωί" : "🌙 Βράδυ"}</span>
                          <Btn onClick={() => delConstraint(c.id)} small bg={T.red}>✕</Btn>
                        </div>
                      );
                    })
                }
              </div>
            </>
          )}
          <Btn onClick={() => setShowConstraints(false)} style={{ width: "100%", marginTop: 12 }}>Κλείσιμο</Btn>
        </Modal>
      )}

      {showRep && role !== "employee" && (
        <Modal title="🛌 Ρεπό Εργαζομένων" onClose={() => setShowRep(false)} wide>
          <div style={{ color: T.text2, fontSize: 13, marginBottom: 12 }}>Ορίσε ρεπό. Εμφανίζεται στο πρόγραμμα και λαμβάνεται υπόψη στο αυτόματο.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 12 }}>
            <Sel label="Εργαζόμενος" value={repForm.empId} onChange={v => setRepForm(f => ({ ...f, empId: v }))}
              options={[{ value: "", label: "-- Επίλεξε --" }, ...(employees || []).map(e => ({ value: e.id, label: `${e.name} ${e.surname}` }))]} />
            <div>
              <label style={st.label}>Ημέρα</label>
              <input type="date" value={repForm.day} onChange={e => setRepForm(f => ({ ...f, day: e.target.value }))} style={{ ...st.input }} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 10 }}>
              <Btn onClick={addRep} small>+ Προσθήκη</Btn>
            </div>
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {(dayOff || []).length === 0
              ? <div style={{ textAlign: "center", padding: 16, color: T.text2 }}>Δεν υπάρχουν ρεπό</div>
              : (dayOff || []).map(r => {
                  const emp = (employees || []).find(e => e.id === r.empId);
                  return (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ color: T.text, fontSize: 14 }}>🛌 <b>{emp ? `${emp.name} ${emp.surname}` : "–"}</b> — {fmtD(r.date)}</span>
                      <Btn onClick={() => delRep(r.id)} small bg={T.red}>✕</Btn>
                    </div>
                  );
                })
            }
          </div>
          <Btn onClick={() => setShowRep(false)} style={{ width: "100%", marginTop: 12 }}>Κλείσιμο</Btn>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ALTH
// ═══════════════════════════════════════════════════════════
function ALTH({ dailyData, althData, setAlthData }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ month: "", year: new Date().getFullYear(), akis: "", lefteris: "" });

  const checkPin = () => {
    if (pin === ADMIN_PIN) { setUnlocked(true); setErr(""); }
    else setErr("Λάθος PIN");
  };

  if (!unlocked) return (
    <div style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <Card style={{ width: 320, textAlign: "center", background: T.white }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
        <div style={{ color: T.text, fontSize: 18, fontWeight: 700, fontFamily: "Georgia, serif", marginBottom: 4 }}>ALTH</div>
        <div style={{ color: T.text2, fontSize: 12, marginBottom: 20 }}>Άκης · Λευτέρης · Ταμείο Ημέρας</div>
        <Inp label="PIN" type="password" value={pin} onChange={setPin} placeholder="••••" />
        {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <Btn onClick={checkPin} style={{ width: "100%" }}>Είσοδος →</Btn>
      </Card>
    </div>
  );

  const byMonth = {};
  Object.entries(dailyData).forEach(([day, d]) => {
    if (d.tameioImeras == null) return;
    const [y, m] = day.split("-");
    const k = `${y}-${m}`;
    if (!byMonth[k]) byMonth[k] = { days: 0, total: 0 };
    byMonth[k].days++;
    byMonth[k].total += d.tameioImeras;
  });

  const althByMonth = {};
  (althData || []).forEach(r => { althByMonth[`${r.year}-${String(r.month).padStart(2, "0")}`] = r; });
  const allKeys = [...new Set([...Object.keys(byMonth), ...Object.keys(althByMonth)])].sort().reverse();
  const totAkis = (althData || []).reduce((s, r) => s + pa(r.akis), 0);
  const totLef = (althData || []).reduce((s, r) => s + pa(r.lefteris), 0);
  const totTM = Object.values(byMonth).reduce((s, m) => s + m.total, 0);

  const saveAlth = () => {
    const rec = { id: uid(), month: Number(form.month), year: Number(form.year), akis: form.akis, lefteris: form.lefteris };
    const existing = (althData || []).findIndex(r => r.month === rec.month && r.year === rec.year);
    if (existing >= 0) setAlthData(prev => prev.map((r, i) => i === existing ? rec : r));
    else setAlthData(prev => [...(prev || []), rec]);
    setModal(false);
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="🔐 ALTH" subtitle="Α = Άκης · Λ = Λευτέρης · ΤΗ = Ταμείο Ημέρας"
        actions={<><Btn onClick={() => setUnlocked(false)} small bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text, marginRight: 8 }}>🔒</Btn><Btn onClick={() => setModal(true)}>+ Εγγραφή</Btn></>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <AmtBox label="Σύνολο Άκης" value={totAkis} color={T.purple} />
        <AmtBox label="Σύνολο Λευτέρης" value={totLef} color={T.blue} />
        <AmtBox label="Σύνολο Ταμείο Ημέρας" value={totTM} color={T.accent} />
      </div>
      <Card style={{ background: T.white, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Trebuchet MS', sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {["Μήνας", "Ημέρες", "Ταμείο Ημέρας", "Μ.Ο./Ημέρα", "Α (Άκης)", "Λ (Λευτέρης)"].map(h => (
                <th key={h} style={{ color: T.text2, fontSize: 11, fontWeight: 600, padding: "8px 10px", textAlign: "left", letterSpacing: 1, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allKeys.map(k => {
              const [y, mn] = k.split("-");
              const md = byMonth[k] || { days: 0, total: 0 };
              const ar = althByMonth[k] || {};
              return (
                <tr key={k} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: "10px", color: T.text, fontWeight: 700 }}>{MONTHS_GR[Number(mn) - 1]} {y}</td>
                  <td style={{ padding: "10px", color: T.text2, fontFamily: "Georgia, serif" }}>{md.days}</td>
                  <td style={{ padding: "10px", color: T.accent, fontFamily: "Georgia, serif", fontWeight: 700 }}>{fmt(md.total)}</td>
                  <td style={{ padding: "10px", color: T.text2, fontFamily: "Georgia, serif" }}>{md.days > 0 ? fmt(md.total / md.days) : "–"}</td>
                  <td style={{ padding: "10px", color: T.purple, fontFamily: "Georgia, serif" }}>{ar.akis ? fmt(ar.akis) : "–"}</td>
                  <td style={{ padding: "10px", color: T.blue, fontFamily: "Georgia, serif" }}>{ar.lefteris ? fmt(ar.lefteris) : "–"}</td>
                </tr>
              );
            })}
            {allKeys.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: T.text2 }}>Δεν υπάρχουν δεδομένα</td></tr>}
          </tbody>
          {allKeys.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `2px solid ${T.border}`, background: T.cat_bg }}>
                <td style={{ padding: "10px", color: T.text2, fontWeight: 700 }}>ΣΥΝΟΛΟ</td>
                <td style={{ padding: "10px", color: T.text2 }}>{Object.values(byMonth).reduce((s, m) => s + m.days, 0)}</td>
                <td style={{ padding: "10px", color: T.accent, fontWeight: 700, fontSize: 16 }}>{fmt(totTM)}</td>
                <td style={{ padding: "10px", color: T.text2 }}>–</td>
                <td style={{ padding: "10px", color: T.purple, fontWeight: 700, fontSize: 16 }}>{fmt(totAkis)}</td>
                <td style={{ padding: "10px", color: T.blue, fontWeight: 700, fontSize: 16 }}>{fmt(totLef)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
      {modal && (
        <Modal title="+ Εγγραφή ALTH" onClose={() => setModal(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Sel label="Μήνας" value={form.month} onChange={v => setForm(f => ({ ...f, month: v }))}
              options={[{ value: "", label: "-- Μήνας --" }, ...MONTHS_GR.map((m, i) => ({ value: i + 1, label: m }))]} />
            <Sel label="Έτος" value={form.year} onChange={v => setForm(f => ({ ...f, year: v }))}
              options={[2024, 2025, 2026, 2027].map(y => ({ value: y, label: String(y) }))} />
            <Inp label="Α — Άκης (€)" value={form.akis} onChange={v => setForm(f => ({ ...f, akis: v }))} placeholder="0" />
            <Inp label="Λ — Λευτέρης (€)" value={form.lefteris} onChange={v => setForm(f => ({ ...f, lefteris: v }))} placeholder="0" />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={() => setModal(false)} bg={T.cat_bg} style={{ flex: 1, border: `1px solid ${T.border}`, color: T.text }}>Ακύρωση</Btn>
            <Btn onClick={saveAlth} style={{ flex: 1 }}>💾 Αποθήκευση</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════════════════════════
function Reports({ dailyData, attendance, employees }) {
  const [view, setView] = useState("monthly");
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1);
  const months = ["Ιανουάριος","Φεβρουάριος","Μάρτιος","Απρίλιος","Μάιος","Ιούνιος","Ιούλιος","Αύγουστος","Σεπτέμβριος","Οκτώβριος","Νοέμβριος","Δεκέμβριος"];

  const filteredDays = Object.entries(dailyData).filter(([day]) => {
    const [y, m] = day.split("-").map(Number);
    return view === "monthly" ? y === selYear && m === selMonth : y === selYear;
  });

  const totalTameio = filteredDays.reduce((s, [, d]) => s + (d.tameioImeras || 0), 0);
  const totalPOS = filteredDays.reduce((s, [, d]) => s + pa(d.night?.posTotal || 0), 0);
  const totalPayments = filteredDays.reduce((s, [, d]) => {
    const pays = [...(d.morning?.payments || []), ...(d.night?.payments || [])];
    return s + pays.reduce((ss, p) => ss + pa(p.amount), 0);
  }, 0);
  const filtAtt = (attendance || []).filter(a => {
    const [y, m] = a.date.split("-").map(Number);
    return view === "monthly" ? y === selYear && m === selMonth : y === selYear;
  });
  const totalWages = filtAtt.reduce((s, a) => s + (a.dailyCost || 0), 0);
  const years = [...new Set(Object.keys(dailyData).map(d => d.split("-")[0]))].map(Number).sort();

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="📊 Αναφορές" />
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <Btn onClick={() => setView("monthly")} bg={view === "monthly" ? T.accent : T.cat_bg} style={{ border: `1px solid ${T.border}`, color: view === "monthly" ? "#fff" : T.text }}>Μηνιαία</Btn>
        <Btn onClick={() => setView("yearly")} bg={view === "yearly" ? T.accent : T.cat_bg} style={{ border: `1px solid ${T.border}`, color: view === "yearly" ? "#fff" : T.text }}>Ετήσια</Btn>
        <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} style={{ ...st.input, width: "auto" }}>
          {(years.length ? years : [new Date().getFullYear()]).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {view === "monthly" && (
          <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))} style={{ ...st.input, width: "auto" }}>
            {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <AmtBox label="Ταμείο Ημέρας" value={totalTameio} color={T.accent} sub={`${filteredDays.length} ημέρες`} />
        <AmtBox label="POS (→ Τράπεζα)" value={totalPOS} color={T.green} />
        <AmtBox label="Πληρωμές / Έξοδα" value={totalPayments} color={T.red} />
        <AmtBox label="Μισθοδοσία" value={totalWages} color={T.yellow} />
        <AmtBox label="Μ.Ο./Ημέρα" value={filteredDays.length > 0 ? totalTameio / filteredDays.length : 0} sub="ανά ημέρα" />
      </div>
      <Card style={{ background: T.white, overflowX: "auto" }}>
        <div style={{ color: T.text2, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Αναλυτικά ανά Ημέρα</div>
        {filteredDays.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: T.text2 }}>Δεν υπάρχουν δεδομένα</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Trebuchet MS', sans-serif" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Ημερομηνία", "Πρωί", "Βράδυ", "Ταμείο Ημέρας", "POS", "Πληρωμές", "Κουτί", "Τράπεζα"].map(h => (
                  <th key={h} style={{ color: T.text2, fontSize: 11, fontWeight: 600, padding: "6px 8px", textAlign: "left", letterSpacing: 1, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredDays.sort((a, b) => b[0].localeCompare(a[0])).map(([day, d]) => {
                const pays = [...(d.morning?.payments || []), ...(d.night?.payments || [])].reduce((s, p) => s + pa(p.amount), 0);
                return (
                  <tr key={day} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "8px", color: T.text, fontSize: 13 }}>{fmtD(day)}</td>
                    <td style={{ padding: "8px", color: T.accent, fontFamily: "Georgia, serif", fontSize: 13 }}>{d.mTameio != null ? fmt(d.mTameio) : "–"}</td>
                    <td style={{ padding: "8px", color: T.accent, fontFamily: "Georgia, serif", fontSize: 13 }}>{d.nTameio != null ? fmt(d.nTameio) : "–"}</td>
                    <td style={{ padding: "8px", color: T.accent, fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700 }}>{d.tameioImeras != null ? fmt(d.tameioImeras) : "–"}</td>
                    <td style={{ padding: "8px", color: T.green, fontFamily: "Georgia, serif", fontSize: 13 }}>{d.night?.posTotal ? fmt(d.night.posTotal) : "–"}</td>
                    <td style={{ padding: "8px", color: T.red, fontFamily: "Georgia, serif", fontSize: 13 }}>{pays > 0 ? fmt(pays) : "–"}</td>
                    <td style={{ padding: "8px", color: T.blue, fontFamily: "Georgia, serif", fontSize: 13 }}>{d.koutiEnd != null ? fmt(d.koutiEnd) : "–"}</td>
                    <td style={{ padding: "8px", color: T.green, fontFamily: "Georgia, serif", fontSize: 13 }}>{d.trapezaEnd != null ? fmt(d.trapezaEnd) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  LINKS
// ═══════════════════════════════════════════════════════════
function Links({ links, setLinks, role }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ id: "", label: "", url: "", icon: "🔗", category: "Γενικά", empVisible: true });
  const CATS = ["Γενικά", "Τράπεζα", "Προμηθευτές", "Delivery", "Λογιστής", "Άλλο"];
  const ICONS = ["🔗", "🏦", "📦", "🍔", "📊", "📋", "🌐", "💳", "📱"];

  // Employees only see links flagged as empVisible
  const visibleLinks = role === "employee"
    ? (links || []).filter(l => l.empVisible !== false)
    : (links || []);

  const openAdd = () => { setForm({ id: uid(), label: "", url: "", icon: "🔗", category: "Γενικά", empVisible: true }); setModal(true); };
  const save = () => {
    if (!form.label || !form.url) return alert("Συμπλήρωσε όνομα και URL");
    const url = form.url.startsWith("http") ? form.url : "https://" + form.url;
    const rec = { ...form, url };
    const existing = (links || []).findIndex(l => l.id === form.id);
    if (existing >= 0) setLinks(prev => prev.map((l, i) => i === existing ? rec : l));
    else setLinks(prev => [...(prev || []), rec]);
    setModal(false);
  };
  const del = (id) => { if (confirm("Διαγραφή;")) setLinks(prev => prev.filter(l => l.id !== id)); };
  const grouped = CATS.reduce((acc, cat) => { acc[cat] = visibleLinks.filter(l => l.category === cat); return acc; }, {});

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="🔗 Σύνδεσμοι"
        subtitle={role === "employee" ? "Σύνδεσμοι για εργαζόμενους" : undefined}
        actions={role !== "employee" ? <Btn onClick={openAdd}>+ Νέος Σύνδεσμος</Btn> : undefined} />
      {visibleLinks.length === 0 ? (
        <Card style={{ background: T.white }}><div style={{ textAlign: "center", padding: 32, color: T.text2 }}>Δεν υπάρχουν σύνδεσμοι.{role !== "employee" && <><br /><br /><Btn onClick={openAdd}>Προσθήκη</Btn></>}</div></Card>
      ) : (
        CATS.map(cat => grouped[cat].length > 0 && (
          <div key={cat} style={{ marginBottom: 20 }}>
            <Sep label={cat} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {grouped[cat].map(link => (
                <Card key={link.id} style={{ background: T.white }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 24 }}>{link.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ color: T.text, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.label}</div>
                        {role !== "employee" && link.empVisible !== false && (
                          <span title="Ορατό σε εργαζόμενους" style={{ fontSize: 10, color: T.green, fontWeight: 700 }}>👥</span>
                        )}
                      </div>
                      <div style={{ color: T.text3, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.url}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn onClick={() => window.open(link.url, "_blank")} small style={{ flex: 1 }}>🌐 Άνοιγμα</Btn>
                    {role !== "employee" && <>
                      <Btn onClick={() => { setForm(link); setModal(true); }} small bg={T.cat_bg} style={{ border: `1px solid ${T.border}`, color: T.text }}>✏️</Btn>
                      <Btn onClick={() => del(link.id)} small bg={T.red}>✕</Btn>
                    </>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
      {modal && (
        <Modal title="Σύνδεσμος" onClose={() => setModal(false)}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {ICONS.map(ic => <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))} style={{ fontSize: 22, background: form.icon === ic ? T.cat_bg : "none", border: `1px solid ${form.icon === ic ? T.accent : T.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>{ic}</button>)}
          </div>
          <Inp label="Όνομα" value={form.label} onChange={v => setForm(f => ({ ...f, label: v }))} />
          <Inp label="URL" value={form.url} onChange={v => setForm(f => ({ ...f, url: v }))} placeholder="https://..." />
          <Sel label="Κατηγορία" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={CATS} />
          <Toggle label="👥 Ορατό σε εργαζόμενους" value={form.empVisible !== false} onChange={v => setForm(f => ({ ...f, empVisible: v }))} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={() => setModal(false)} bg={T.cat_bg} style={{ flex: 1, border: `1px solid ${T.border}`, color: T.text }}>Ακύρωση</Btn>
            <Btn onClick={save} style={{ flex: 1 }}>💾 Αποθήκευση</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN APP — IDB-backed state
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("login");
  const [role, setRole] = useState(null);
  const [userName, setUserName] = useState("");
  const [empId, setEmpId] = useState(null);

  const [employees,    setEmployees,    empLoaded]    = useIDB("employees",   "list",   []);
  const [attendance,   setAttendance,   attLoaded]    = useIDB("attendance",  "list",   []);
  const [dailyData,    setDailyData,    ddLoaded]     = useIDB("dailyData",   "data",   {});
  const [initBalances, setInitBalances, ibLoaded]     = useIDB("settings",    "initBalances", { kouti: 0, trapeza: 0 });
  const [althData,     setAlthData,     althLoaded]   = useIDB("althData",    "list",   []);
  const [affiliates,   setAffiliates,   affLoaded]    = useIDB("affiliates",  "list",   []);
  const [links,        setLinks,        linksLoaded]  = useIDB("links",       "list",   []);

  const allLoaded = empLoaded && attLoaded && ddLoaded && ibLoaded && althLoaded && affLoaded && linksLoaded;

  const nav = (p) => setPage(p);

  if (page === "login") return (
    <Login onLogin={(r, n, eid) => { setRole(r); setUserName(n); setEmpId(eid || null); setPage(r === "employee" ? "attendance" : "dashboard"); }} />
  );

  if (!allLoaded) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: T.text2, fontSize: 16 }}>🌿 Φόρτωση...</div>
    </div>
  );

  const ctx = { role, userName, empId, employees, setEmployees, attendance, setAttendance, dailyData, setDailyData, initBalances, setInitBalances, althData, setAlthData, affiliates, setAffiliates, links, setLinks, nav };

  const pages = {
    dashboard: <Dashboard {...ctx} />,
    cash:      <Cash {...ctx} />,
    accounts:  <Accounts {...ctx} />,
    affiliates:<Affiliates {...ctx} />,
    employees: <Employees {...ctx} />,
    attendance:<Attendance {...ctx} />,
    schedule:  <Schedule {...ctx} />,
    reports:   <Reports {...ctx} />,
    alth:      <ALTH {...ctx} />,
    links:     <Links {...ctx} role={role} />,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg }}>
      <Sidebar page={page} nav={nav} role={role} userName={userName} onLogout={() => { setRole(null); setUserName(""); setPage("login"); }} />
      <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        {/* Backup banner for admin */}

        {role !== "employee" && page === "dashboard" && (
  <div style={{ padding: "16px 24px 0" }}>
    <BackupRestore 
      onSync={async () => {
        const data = await idb.exportAll();
        return await syncToSupabase(data);
      }} 
      onRestore={restoreFromSupabase} 
    />
  </div>
)}
        {pages[page] || <div style={{ padding: 24, color: T.text2 }}>Σελίδα δεν βρέθηκε</div>}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// SUPABASE SYNC FUNCTIONS (Hybrid)
// ═══════════════════════════════════════════════════════════
const syncToSupabase = async () => {
  try {
    const data = await idb.exportAll();

    // Sync Employees
    if (data.employees) {
      const employeesArray = Object.values(data.employees);
      for (const emp of employeesArray) {
        await supabase.from('employees').upsert(emp, { onConflict: 'id' });
      }
    }

    // Sync Attendance
    if (data.attendance) {
      const attArray = Object.values(data.attendance);
      for (const att of attArray) {
        await supabase.from('attendance').upsert(att, { onConflict: 'id' });
      }
    }

    // Sync Daily Data
    if (data.dailyData) {
      for (const [date, row] of Object.entries(data.dailyData)) {
        await supabase.from('daily_data').upsert({ date, ...row }, { onConflict: 'date' });
      }
    }

    console.log("✅ Successfully synced to Supabase");
    return true;
  } catch (error) {
    console.error("Sync failed:", error);
    return false;
  }
};

const restoreFromSupabase = async (setEmployees, setAttendance, setDailyData) => {
  try {
    const { data: emps } = await supabase.from('employees').select('*');
    const { data: atts } = await supabase.from('attendance').select('*');
    const { data: dailyRows } = await supabase.from('daily_data').select('*');

    const dailyObj = {};
    dailyRows.forEach(row => {
      dailyObj[row.date] = row;
    });

    // Import back to IndexedDB
    await idb.importAll({
      employees: emps.reduce((acc, e) => { acc[e.id] = e; return acc; }, {}),
      attendance: atts.reduce((acc, a) => { acc[a.id] = a; return acc; }, {}),
      dailyData: dailyObj
    });

    // Update state
    setEmployees(emps);
    setAttendance(atts);
    setDailyData(dailyObj);

    alert("✅ Data successfully restored from Supabase!");
    return true;
  } catch (error) {
    alert("Restore failed: " + error.message);
    console.error(error);
    return false;
  }
};

// Updated BackupRestore with Cloud Sync
function BackupRestore({ onSync, onRestore }) {
  const [msg, setMsg] = useState("");

  const doBackup = async () => {
    const data = await idb.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `briki_backup_${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
    setMsg("✅ Local Backup downloaded!");
    setTimeout(() => setMsg(""), 3000);
  };

  const doSync = async () => {
    setMsg("☁️ Syncing to Supabase...");
    const success = await onSync();
    setMsg(success ? "✅ Synced successfully to cloud!" : "❌ Sync failed");
    setTimeout(() => setMsg(""), 4000);
  };

  return (
    <Card style={{ marginBottom: 20, background: T.cat_bg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: T.text, fontWeight: 700, fontFamily: "Georgia, serif", fontSize: 15 }}>💾 Local + Cloud Backup</div>
          <div style={{ color: T.text2, fontSize: 12 }}>IndexedDB + Supabase</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={doBackup} bg={T.green} small>⬇️ Local Backup</Btn>
          <Btn onClick={doSync} bg={T.accent} small>☁️ Sync to Cloud</Btn>
          <Btn onClick={onRestore} bg={T.blue} small>☁️ Restore from Cloud</Btn>
        </div>
      </div>
      {msg && <div style={{ marginTop: 10, color: T.green, fontWeight: 700, fontSize: 13 }}>{msg}</div>}
    </Card>
  );
}

// Main App with Sync integration
export default function App() {
  const [page, setPage] = useState("login");
  const [role, setRole] = useState(null);
  const [userName, setUserName] = useState("");
  const [empId, setEmpId] = useState(null);

  const [employees, setEmployees, empLoaded] = useIDB("employees", "list", []);
  const [attendance, setAttendance, attLoaded] = useIDB("attendance", "list", []);
  const [dailyData, setDailyData, ddLoaded] = useIDB("dailyData", "data", {});
  const [initBalances, setInitBalances, ibLoaded] = useIDB("settings", "initBalances", { kouti: 0, trapeza: 0 });
  const [althData, setAlthData, althLoaded] = useIDB("althData", "list", []);
  const [affiliates, setAffiliates, affLoaded] = useIDB("affiliates", "list", []);
  const [links, setLinks, linksLoaded] = useIDB("links", "list", []);

  const allLoaded = empLoaded && attLoaded && ddLoaded && ibLoaded && althLoaded && affLoaded && linksLoaded;

  const nav = (p) => setPage(p);

  if (page === "login") {
    return <Login onLogin={(r, n, eid) => { 
      setRole(r); setUserName(n); setEmpId(eid || null); 
      setPage(r === "employee" ? "attendance" : "dashboard"); 
    }} />;
  }

  if (!allLoaded) {
    return <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: T.text2, fontSize: 16 }}>🌿 Φόρτωση...</div>
    </div>;
  }

  const ctx = { role, userName, empId, employees, setEmployees, attendance, setAttendance, dailyData, setDailyData, initBalances, setInitBalances, althData, setAlthData, affiliates, setAffiliates, links, setLinks, nav };

  const pages = {
    dashboard: <Dashboard {...ctx} />,
    cash: <Cash {...ctx} />,
    accounts: <Accounts {...ctx} />,
    affiliates: <Affiliates {...ctx} />,
    employees: <Employees {...ctx} />,
    attendance: <Attendance {...ctx} />,
    schedule: <Schedule {...ctx} />,
    reports: <Reports {...ctx} />,
    alth: <ALTH {...ctx} />,
    links: <Links {...ctx} role={role} />,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg }}>
      <Sidebar page={page} nav={nav} role={role} userName={userName} onLogout={() => { setRole(null); setUserName(""); setPage("login"); }} />
      <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        {role !== "employee" && page === "dashboard" && (
          <div style={{ padding: "16px 24px 0" }}>
            <BackupRestore 
              onSync={syncToSupabase}
              onRestore={() => restoreFromSupabase(setEmployees, setAttendance, setDailyData)}
            />
          </div>
        )}
        {pages[page] || <div style={{ padding: 24, color: T.text2 }}>Σελίδα δεν βρέθηκε</div>}
      </div>
    </div>
  );
}
