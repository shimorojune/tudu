// @ds-adherence-ignore -- device chrome scaffold (adapted omelette starter; reads Tudu theme tokens)
// Adapted from the omelette android_frame starter: Material chrome redrawn on
// Tudu's tokens (flat, zero-radius, ink rules). Exports TuduPhone + parts.

function StatusBar({ time = "9:41" }) {
  const ico = { display: "block" };
  return (
    <div style={{
      height: 30, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 14px", flexShrink: 0, fontSize: 12, fontWeight: 700, letterSpacing: ".01em",
    }}>
      <span>{time}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={ico}>
          <path d="M8 13.4 .8 6.2a10.2 10.2 0 0 1 14.4 0L8 13.4Z" />
        </svg>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={ico}>
          <path d="M14.6 14.6V1.4L1.4 14.6h13.2Z" />
        </svg>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={ico}>
          <rect x="3.6" y="2" width="8.8" height="13" />
          <rect x="5.6" y="0.7" width="4.8" height="2" />
        </svg>
      </span>
    </div>
  );
}

function NavPill() {
  return (
    <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ width: 108, height: 4, background: "currentColor", opacity: 0.45 }} />
    </div>
  );
}

function Keyboard() {
  const key = (l, o = {}) => (
    <div key={l + (o.k || "")} style={{
      height: 38, flex: o.flex || 1, minWidth: o.minW,
      background: o.bg || "var(--card)", border: "1px solid var(--hair)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: o.fs || 15, fontWeight: 500, color: "var(--foreground)",
    }}>{l}</div>
  );
  const row = (keys, style = {}) => (
    <div style={{ display: "flex", gap: 5, ...style }}>{keys.map(l => key(l))}</div>
  );
  return (
    <div style={{
      background: "var(--background)", borderTop: "1px solid var(--rule)",
      padding: "6px 5px 8px", display: "flex", flexDirection: "column", gap: 5, flexShrink: 0,
    }}>
      <div style={{
        height: 30, display: "flex", alignItems: "center", gap: 14, padding: "0 6px",
        fontSize: 12.5, color: "var(--muted-foreground)",
      }}>
        <span style={{ fontWeight: 700, color: "var(--foreground)" }}>tomorrow</span>
        <span>2pm</span>
        <span>tmrw</span>
      </div>
      {row(["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"])}
      {row(["a", "s", "d", "f", "g", "h", "j", "k", "l"], { padding: "0 18px" })}
      <div style={{ display: "flex", gap: 5 }}>
        {key("⇧", { bg: "var(--tint)", minW: 40, k: "s" })}
        <div style={{ display: "flex", gap: 5, flex: 7 }}>{["z", "x", "c", "v", "b", "n", "m"].map(l => key(l))}</div>
        {key("⌫", { bg: "var(--tint)", minW: 40, k: "b" })}
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {key("?123", { minW: 52, fs: 12, bg: "var(--tint)" })}
        {key("", { flex: 4, k: "space" })}
        {key("Add", { minW: 68, fs: 13, bg: "var(--primary)" })}
      </div>
    </div>
  );
}

function TuduPhone({
  children, width = 412, height = 892, time = "9:41",
  keyboard = false, surface = "var(--background)", ink,
}) {
  return (
    <div data-om-starter="android-frame" style={{
      width, height, boxSizing: "content-box", border: "2px solid var(--rule)",
      background: surface, color: ink || "var(--foreground)",
      display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0,
    }}>
      <StatusBar time={time} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
      {keyboard ? <Keyboard /> : null}
      <NavPill />
    </div>
  );
}

Object.assign(window, { TuduPhone, StatusBar, NavPill, Keyboard });
