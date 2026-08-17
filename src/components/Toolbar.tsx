"use client";
import styles from "./Toolbar.module.css";

interface Props {
  tool: "pen" | "highlighter" | "eraser" | "lasso";
  onToolChange: (t: "pen" | "highlighter" | "eraser" | "lasso") => void;
  color: string;
  onColorChange: (c: string) => void;
  size: number;
  onSizeChange: (s: number) => void;
}

const COLORS = [
  "#1a1917", "#ffffff", "#2d6ef6", "#dc2626",
  "#16a34a", "#d97706", "#8b5cf6", "#ec4899",
];

const TOOLS = [
  {
    id: "pen" as const,
    label: "Pen",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    id: "highlighter" as const,
    label: "Highlight",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l-6 6v3h3l6-6" />
        <path d="M22 5.72l-4.6-4.6a1 1 0 0 0-1.41 0l-5 5a1 1 0 0 0 0 1.41l4.6 4.6a1 1 0 0 0 1.41 0l5-5a1 1 0 0 0 0-1.41z" />
      </svg>
    ),
  },
  {
    id: "eraser" as const,
    label: "Eraser",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20H7L3 16l14-14 6 6-3.5 3.5" />
        <path d="M6.5 17.5l3-3" />
      </svg>
    ),
  },
];

export default function Toolbar({ tool, onToolChange, color, onColorChange, size, onSizeChange }: Props) {
  return (
    <nav className={styles.toolbar} aria-label="Drawing toolbar">
      {/* Logo mark */}
      <div className={styles.logoMark}>
        <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
          <rect width="36" height="36" rx="9" fill="var(--accent)" />
          <path d="M10 12h16M10 18h10M10 24h13" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </div>

      <div className={styles.divider} />

      {/* Tools */}
      <div className={styles.section}>
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`btn-icon ${tool === t.id ? "active" : ""}`}
            onClick={() => onToolChange(t.id)}
            title={t.label}
            id={`tool-${t.id}`}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      {/* Colors */}
      <div className={styles.section}>
        {COLORS.map(c => (
          <button
            key={c}
            className={styles.colorSwatch}
            style={{
              background: c,
              outline: color === c ? "2px solid var(--accent)" : "2px solid transparent",
              outlineOffset: "2px",
            }}
            onClick={() => onColorChange(c)}
            title={c}
            id={`color-${c.replace("#", "")}`}
          />
        ))}
        <label className={styles.colorPicker} title="Custom color">
          <input
            type="color"
            value={color}
            onChange={e => onColorChange(e.target.value)}
            style={{ opacity: 0, position: "absolute", width: 0, height: 0 }}
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </label>
      </div>

      <div className={styles.divider} />

      {/* Stroke size */}
      <div className={styles.section} style={{ alignItems: "center", gap: 8 }}>
        {[1, 3, 6, 10].map(s => (
          <button
            key={s}
            className={styles.sizeBtn}
            style={{ outline: size === s ? "2px solid var(--accent)" : "2px solid transparent", outlineOffset: "2px" }}
            onClick={() => onSizeChange(s)}
            title={`Size ${s}`}
            id={`size-${s}`}
          >
            <div
              style={{
                width: Math.max(4, s * 2),
                height: Math.max(4, s * 2),
                borderRadius: "50%",
                background: "currentColor",
              }}
            />
          </button>
        ))}
      </div>
    </nav>
  );
}
