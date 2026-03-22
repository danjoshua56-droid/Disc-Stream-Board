import { useState, useEffect, useRef } from "react";

const ADMIN_USERNAME = "gooby59";
const ADMIN_PASSWORD = "Bee18four9!frost216qwp";

// In production this file is written by the GitHub Actions bot
// In development it falls back to mock data
const DATA_URL = "./data.json";

// How often the page re-fetches data.json (ms) — free, just a static file fetch
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Roobert:wght@400;500;600;700&family=Inter:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0e0e10; font-family: 'Inter', sans-serif; color: #efeff1; min-height: 100vh; }
  .app { min-height: 100vh; background: #0e0e10; background-image: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(145,71,255,0.15) 0%, transparent 70%); }
  .header { border-bottom: 1px solid #2a2a2e; background: rgba(14,14,16,0.95); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 100; padding: 0 24px; }
  .header-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; height: 60px; gap: 16px; }
  .logo { display: flex; align-items: center; gap: 10px; font-family: 'Roobert', sans-serif; font-weight: 700; font-size: 18px; color: #efeff1; }
  .logo svg { color: #9147ff; }
  .header-actions { display: flex; gap: 10px; align-items: center; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s ease; font-family: 'Inter', sans-serif; white-space: nowrap; }
  .btn-primary { background: #9147ff; color: #fff; }
  .btn-primary:hover { background: #a970ff; transform: translateY(-1px); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .btn-ghost { background: transparent; color: #adadb8; border: 1px solid #2a2a2e; }
  .btn-ghost:hover { background: #1f1f23; color: #efeff1; }
  .btn-danger { background: rgba(235,4,0,0.15); color: #eb0400; border: 1px solid rgba(235,4,0,0.3); }
  .btn-danger:hover { background: rgba(235,4,0,0.25); }
  .btn-success { background: rgba(0,200,100,0.15); color: #00c864; border: 1px solid rgba(0,200,100,0.3); }
  .btn-success:hover { background: rgba(0,200,100,0.25); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .main { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .section-title { font-family: 'Roobert', sans-serif; font-size: 20px; font-weight: 700; color: #efeff1; display: flex; align-items: center; gap: 10px; }
  .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; font-family: 'Inter', sans-serif; letter-spacing: 0.5px; text-transform: uppercase; }
  .badge-live { background: #eb0400; color: #fff; animation: pulse-live 2s infinite; }
  @keyframes pulse-live { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
  .badge-offline { background: #2a2a2e; color: #adadb8; }
  .badge-pending { background: rgba(145,71,255,0.2); color: #a970ff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .card { background: #18181b; border: 1px solid #2a2a2e; border-radius: 10px; overflow: hidden; transition: all 0.2s ease; }
  .card:hover { border-color: #9147ff; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(145,71,255,0.15); }
  .card.is-live { border-color: rgba(235,4,0,0.4); }
  .card.is-live:hover { border-color: #eb0400; box-shadow: 0 8px 24px rgba(235,4,0,0.15); }
  .card-thumb { width: 100%; aspect-ratio: 16/9; background: #0e0e10; position: relative; overflow: hidden; }
  .card-thumb img { width: 100%; height: 100%; object-fit: cover; opacity: 0.85; }
  .card-thumb-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1a1a1f 0%, #0e0e10 100%); }
  .card-thumb-placeholder svg { opacity: 0.15; color: #9147ff; }
  .live-indicator { position: absolute; top: 8px; left: 8px; }
  .viewer-count { position: absolute; bottom: 8px; left: 8px; background: rgba(235,4,0,0.9); color: #fff; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .card-body { padding: 14px; }
  .card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #9147ff, #6b2fc4); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: #fff; flex-shrink: 0; overflow: hidden; }
  .avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  .card-info { flex: 1; min-width: 0; }
  .card-name { font-family: 'Roobert', sans-serif; font-weight: 700; font-size: 15px; color: #efeff1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-meta { font-size: 12px; color: #adadb8; margin-top: 2px; }
  .card-game { font-size: 12px; color: #a970ff; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-title { font-size: 12px; color: #adadb8; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 10px; border-top: 1px solid #2a2a2e; }
  .watch-link { display: inline-flex; align-items: center; gap: 5px; color: #9147ff; font-size: 12px; font-weight: 600; text-decoration: none; transition: color 0.15s; }
  .watch-link:hover { color: #a970ff; }
  .loading-card { background: #18181b; border: 1px solid #2a2a2e; border-radius: 10px; overflow: hidden; }
  .skeleton { background: linear-gradient(90deg, #1f1f23 25%, #2a2a2e 50%, #1f1f23 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; animation: fade-in 0.15s ease; }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  .modal { background: #18181b; border: 1px solid #2a2a2e; border-radius: 12px; width: 100%; max-width: 460px; padding: 28px; animation: slide-up 0.2s ease; }
  @keyframes slide-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  .modal-title { font-family: 'Roobert', sans-serif; font-size: 20px; font-weight: 700; margin-bottom: 6px; }
  .modal-sub { font-size: 13px; color: #adadb8; margin-bottom: 24px; line-height: 1.5; }
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 13px; font-weight: 600; color: #adadb8; margin-bottom: 6px; }
  .form-input { width: 100%; background: #0e0e10; border: 1px solid #2a2a2e; border-radius: 6px; padding: 10px 12px; color: #efeff1; font-size: 14px; font-family: 'Inter', sans-serif; transition: border-color 0.15s; outline: none; }
  .form-input:focus { border-color: #9147ff; }
  .form-input::placeholder { color: #53535f; }
  .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; }
  .admin-panel { background: #18181b; border: 1px solid #2a2a2e; border-radius: 10px; overflow: hidden; margin-bottom: 32px; }
  .admin-panel-header { padding: 16px 20px; border-bottom: 1px solid #2a2a2e; display: flex; align-items: center; justify-content: space-between; }
  .admin-panel-title { font-family: 'Roobert', sans-serif; font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .pending-row { padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1f1f23; gap: 12px; }
  .pending-row:last-child { border-bottom: none; }
  .pending-info { flex: 1; min-width: 0; }
  .pending-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pending-url { font-size: 12px; color: #53535f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pending-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .empty-state { padding: 48px 24px; text-align: center; color: #53535f; }
  .empty-title { font-family: 'Roobert', sans-serif; font-size: 16px; font-weight: 700; color: #adadb8; margin-bottom: 6px; }
  .tabs { display: flex; gap: 2px; background: #0e0e10; border-radius: 8px; padding: 3px; border: 1px solid #2a2a2e; }
  .tab { padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; background: transparent; color: #adadb8; transition: all 0.15s; font-family: 'Inter', sans-serif; }
  .tab.active { background: #18181b; color: #efeff1; }
  .alert { padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
  .alert-success { background: rgba(0,200,100,0.1); border: 1px solid rgba(0,200,100,0.25); color: #00c864; }
  .alert-error { background: rgba(235,4,0,0.1); border: 1px solid rgba(235,4,0,0.3); color: #eb0400; }
  .stats-bar { display: flex; gap: 24px; margin-bottom: 28px; flex-wrap: wrap; align-items: flex-end; }
  .stat { display: flex; flex-direction: column; gap: 2px; }
  .stat-value { font-family: 'Roobert', sans-serif; font-size: 24px; font-weight: 700; color: #efeff1; }
  .stat-value.purple { color: #9147ff; }
  .stat-value.red { color: #eb0400; }
  .stat-label { font-size: 12px; color: #adadb8; }
  .last-updated { margin-left: auto; font-size: 12px; color: #53535f; display: flex; align-items: center; gap: 6px; }
  .last-updated .dot { width: 6px; height: 6px; border-radius: 50%; background: #00c864; display: inline-block; animation: pulse-dot 3s infinite; }
  @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`;

function TwitchIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
    </svg>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatViewers(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function ChannelCard({ channel, isAdmin, onRemove }) {
  const isLive = channel.isLive;
  const initial = (channel.displayName || channel.name)[0].toUpperCase();
  return (
    <div className={`card ${isLive ? "is-live" : ""}`}>
      <div className="card-thumb">
        {isLive && channel.thumbnailUrl
          ? <img src={channel.thumbnailUrl} alt="stream thumbnail" />
          : <div className="card-thumb-placeholder"><TwitchIcon size={48} /></div>
        }
        <div className="live-indicator">
          {isLive
            ? <span className="badge badge-live">● Live</span>
            : <span className="badge badge-offline">Offline</span>
          }
        </div>
        {isLive && channel.viewers > 0 && (
          <div className="viewer-count">👁 {formatViewers(channel.viewers)}</div>
        )}
      </div>
      <div className="card-body">
        <div className="card-top">
          <div className="avatar">
            {channel.profileImage
              ? <img src={channel.profileImage} alt={channel.displayName} />
              : initial
            }
          </div>
          <div className="card-info">
            <div className="card-name">{channel.displayName || channel.name}</div>
            {isLive && channel.game && <div className="card-game">🎮 {channel.game}</div>}
            {isLive && channel.title && <div className="card-title">{channel.title}</div>}
            {!isLive && <div className="card-meta">Last seen {timeAgo(channel.lastSeen)}</div>}
          </div>
        </div>
        <div className="card-footer">
          <a href={`https://twitch.tv/${channel.name}`} target="_blank" rel="noreferrer" className="watch-link">
            <TwitchIcon size={13} /> {isLive ? "Watch Now" : "Channel"}
          </a>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm"
              onClick={() => onRemove(channel.id)}
              style={{ color: "#eb0400", borderColor: "rgba(235,4,0,0.3)", padding: "3px 8px" }}>
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="loading-card">
      <div className="skeleton" style={{ aspectRatio: "16/9", width: "100%" }} />
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 12, width: "40%" }} />
          </div>
        </div>
        <div className="skeleton" style={{ height: 1, marginBottom: 12 }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div className="skeleton" style={{ height: 12, width: 80 }} />
          <div className="skeleton" style={{ height: 12, width: 60 }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [channels, setChannels] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState("live");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showAdminAdd, setShowAdminAdd] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [submitForm, setSubmitForm] = useState({ name: "", url: "" });
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [adminAddForm, setAdminAddForm] = useState({ url: "" });
  const [alert, setAlert] = useState(null);
  const intervalRef = useRef(null);

  const loadData = async () => {
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`);
      if (!res.ok) throw new Error("no data.json yet");
      const data = await res.json();
      setChannels(data.channels || []);
      setPending(data.pending || []);
      setLastUpdated(data.updatedAt || null);
    } catch {
      // Fall back to empty state — bot hasn't run yet
      setChannels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, AUTO_REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, []);

  function showAlert(type, msg) {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 3500);
  }

  const handleAdminLogin = () => {
    if (adminUsername === ADMIN_USERNAME && adminPassword === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowAdmin(false);
      setAdminError("");
      setAdminUsername("");
      setAdminPassword("");
    } else {
      setAdminError("Incorrect username or password.");
    }
  };

  // Admin: save pending/channels back to data.json via a PUT to the repo
  // In practice, admin actions write to storage and the bot picks them up on next run
  const persistPending = async (updated) => {
    setPending(updated);
    try { await window.storage.set("pending-channels", JSON.stringify(updated)); } catch {}
  };

  const persistChannels = async (updated) => {
    setChannels(updated);
    try { await window.storage.set("approved-channels", JSON.stringify(updated)); } catch {}
  };

  const handleSubmit = async () => {
    const raw = submitForm.url.trim();
    const match = raw.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    const name = match ? match[1] : raw.replace(/^@/, "").trim();
    if (!name) return;
    const entry = {
      id: Date.now().toString(),
      name: name.toLowerCase(),
      displayName: name,
      url: `https://twitch.tv/${name.toLowerCase()}`,
      submittedBy: submitForm.name.trim() || "Anonymous",
      submittedAt: Date.now(),
    };
    await persistPending([...pending, entry]);
    setSubmitSuccess(true);
    setSubmitForm({ name: "", url: "" });
    setTimeout(() => { setShowSubmit(false); setSubmitSuccess(false); }, 2000);
  };

  const handleApprove = async (entry) => {
    const newChannel = { id: entry.id, name: entry.name, displayName: entry.displayName, addedAt: Date.now(), lastSeen: null, isLive: false };
    await persistChannels([...channels, newChannel]);
    await persistPending(pending.filter(p => p.id !== entry.id));
    showAlert("success", `${entry.displayName} approved!`);
  };

  const handleReject = async (id) => {
    await persistPending(pending.filter(p => p.id !== id));
  };

  const handleRemove = async (id) => {
    await persistChannels(channels.filter(c => c.id !== id));
  };

  const handleAdminAdd = async () => {
    const raw = adminAddForm.url.trim();
    const match = raw.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    const name = match ? match[1] : raw.replace(/^@/, "").trim();
    if (!name) return;
    if (channels.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      showAlert("error", `${name} is already on the board.`); return;
    }
    const newChannel = { id: Date.now().toString(), name: name.toLowerCase(), displayName: name, addedAt: Date.now(), lastSeen: null, isLive: false };
    await persistChannels([...channels, newChannel]);
    setAdminAddForm({ url: "" });
    setShowAdminAdd(false);
    showAlert("success", `${name} added! Live status will update on the next scheduled check.`);
  };

  const liveChannels = channels.filter(c => c.isLive);
  const offlineChannels = channels.filter(c => !c.isLive);
  const displayed = activeTab === "live" ? liveChannels : activeTab === "offline" ? offlineChannels : channels;

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header className="header">
          <div className="header-inner">
            <div className="logo"><TwitchIcon size={22} /> Stream Board</div>
            <div className="header-actions">
              {isAdmin && (
                <>
                  <button className="btn btn-ghost" onClick={() => setShowAdminAdd(true)}
                    style={{ borderColor: "#9147ff", color: "#a970ff" }}>＋ Add Channel</button>
                </>
              )}
              {!isAdmin
                ? <button className="btn btn-ghost" onClick={() => setShowAdmin(true)}>🔒 Admin</button>
                : <button className="btn btn-ghost" onClick={() => setIsAdmin(false)}>🔓 Exit Admin</button>
              }
              <button className="btn btn-primary" onClick={() => setShowSubmit(true)}>+ Add Your Channel</button>
            </div>
          </div>
        </header>

        <main className="main">
          {alert && (
            <div className={`alert alert-${alert.type}`}>
              {alert.type === "success" ? "✓" : "✕"} {alert.msg}
            </div>
          )}

          {isAdmin && pending.length > 0 && (
            <div className="admin-panel">
              <div className="admin-panel-header">
                <div className="admin-panel-title">
                  ⏳ Pending Approvals <span className="badge badge-pending">{pending.length}</span>
                </div>
              </div>
              {pending.map(entry => (
                <div className="pending-row" key={entry.id}>
                  <div className="pending-info">
                    <div className="pending-name">{entry.displayName}</div>
                    <div className="pending-url">twitch.tv/{entry.name} • Submitted by {entry.submittedBy}</div>
                  </div>
                  <div className="pending-actions">
                    <button className="btn btn-success btn-sm" onClick={() => handleApprove(entry)}>✓ Approve</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleReject(entry.id)}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && (
            <div className="stats-bar">
              <div className="stat"><div className="stat-value">{channels.length}</div><div className="stat-label">Total Channels</div></div>
              <div className="stat"><div className="stat-value red">{liveChannels.length}</div><div className="stat-label">Live Now</div></div>
              <div className="stat"><div className="stat-value purple">{offlineChannels.length}</div><div className="stat-label">Offline</div></div>
              {isAdmin && pending.length > 0 && (
                <div className="stat"><div className="stat-value" style={{ color: "#a970ff" }}>{pending.length}</div><div className="stat-label">Pending</div></div>
              )}
              {lastUpdated && (
                <div className="last-updated">
                  <span className="dot" />
                  Data updated {timeAgo(lastUpdated)}
                </div>
              )}
            </div>
          )}

          <div className="section-header">
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <h2 className="section-title"><TwitchIcon size={18} /> Channels</h2>
              <div className="tabs">
                {["live", "offline", "all"].map(tab => (
                  <button key={tab} className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === "live" && liveChannels.length > 0 && ` (${liveChannels.length})`}
                    {tab === "offline" && offlineChannels.length > 0 && ` (${offlineChannels.length})`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid">
            {loading
              ? Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)
              : displayed.length === 0
                ? (
                  <div className="empty-state" style={{ gridColumn: "1/-1" }}>
                    <TwitchIcon size={40} />
                    <div className="empty-title">{activeTab === "live" ? "Nobody's live right now" : "No channels yet"}</div>
                    <p style={{ marginTop: 6 }}>{activeTab === "live" ? "Check back later!" : "Add channels to get started."}</p>
                  </div>
                )
                : displayed.map(ch => (
                  <ChannelCard key={ch.id} channel={ch} isAdmin={isAdmin} onRemove={handleRemove} />
                ))
            }
          </div>
        </main>

        {/* Submit modal */}
        {showSubmit && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSubmit(false); }}>
            <div className="modal">
              <div className="modal-title">Add Your Channel</div>
              <div className="modal-sub">Submit your Twitch channel. A moderator will review and approve it.</div>
              {submitSuccess ? (
                <div className="alert alert-success">✓ Submitted! You'll be added once a moderator approves.</div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Your Name (optional)</label>
                    <input className="form-input" placeholder="e.g. xQc" value={submitForm.name}
                      onChange={e => setSubmitForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Twitch Channel URL or Username *</label>
                    <input className="form-input" placeholder="twitch.tv/yourchannel or just yourchannel"
                      value={submitForm.url} onChange={e => setSubmitForm(p => ({ ...p, url: e.target.value }))} />
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-ghost" onClick={() => setShowSubmit(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={!submitForm.url.trim()}>Submit</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Admin login modal */}
        {showAdmin && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdmin(false); }}>
            <div className="modal">
              <div className="modal-title">🔒 Admin Login</div>
              <div className="modal-sub">Enter your admin credentials to manage channels and approve submissions.</div>
              {adminError && <div className="alert alert-error">✕ {adminError}</div>}
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" placeholder="Enter username" value={adminUsername}
                  onChange={e => setAdminUsername(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdminLogin()} />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" placeholder="Enter password" value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdminLogin()} />
              </div>
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setShowAdmin(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAdminLogin}>Login</button>
              </div>
            </div>
          </div>
        )}

        {/* Admin add channel modal */}
        {showAdminAdd && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowAdminAdd(false); setAdminAddForm({ url: "" }); } }}>
            <div className="modal">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ background: "rgba(145,71,255,0.2)", color: "#a970ff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.5px" }}>ADMIN</span>
                <div className="modal-title" style={{ marginBottom: 0 }}>Add Channel Directly</div>
              </div>
              <div className="modal-sub">Added instantly to the board. Live status will populate on the next scheduled cron run.</div>
              <div className="form-group">
                <label className="form-label">Twitch Channel URL or Username *</label>
                <input className="form-input" placeholder="twitch.tv/channelname or just channelname"
                  value={adminAddForm.url} onChange={e => setAdminAddForm({ url: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && adminAddForm.url.trim() && handleAdminAdd()}
                  autoFocus />
              </div>
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => { setShowAdminAdd(false); setAdminAddForm({ url: "" }); }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAdminAdd} disabled={!adminAddForm.url.trim()}>Add to Board</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
