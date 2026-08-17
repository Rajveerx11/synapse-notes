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
  "#1a1917", // Obsidian Black
  "#ffffff", // Clean White
  "#2d6ef6", // Royal Blue
  "#dc2626", // Crimson Red
  "#16a34a", // Emerald Green
  "#d97706", // Amber
  "#8b5cf6", // Violet
  "#ec4899", // Pink
];

const TOOLS = [
  {
    id: "pen" as const,
    label: "Pen (S-Pen Stylus)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    id: "highlighter" as const,
    label: "Highlighter (Marker)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l-6 6v3h3l6-6" />
        <path d="M22 5.72l-4.6-4.6a1 1 0 0 0-1.41 0l-5 5a1 1 0 0 0 0 1.41l4.6 4.6a1 1 0 0 0 1.41 0l5-5a1 1 0 0 0 0-1.41z" />
      </svg>
    ),
  },
  {
    id: "eraser" as const,
    label: "Stroke Eraser",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20H7L3 16l14-14 6 6-3.5 3.5" />
        <path d="M6.5 17.5l3-3" />
      </svg>
    ),
  },
];

export default function Toolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  size,
  onSizeChange,
}: Props) {
  return (
    <nav className={styles.toolbar} aria-label="Stylus tool palette">
      {/* Brand Icon */}
      <div className={styles.logoMark} title="Synapse Notes">
        <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
          <rect width="36" height="36" rx="10" fill="var(--accent)" />
          <path d="M10 12h16M10 18h11M10 24h14" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </div>

      <div className={styles.divider} />

      {/* Tools */}
      <div className={styles.section}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`${styles.toolBtn} ${tool === t.id ? styles.active : ""}`}
            onClick={() => onToolChange(t.id)}
            title={t.label}
            id={`tool-${t.id}`}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      {/* Live Brush Size Preview */}
      <div className={styles.brushPreview} title={`Current Brush: ${size}px`}>
        <div
          className={styles.brushDot}
          style={{
            width: Math.max(4, size * 2.2),
            height: Math.max(4, size * 2.2),
            background: tool === "eraser" ? "var(--text-muted)" : color,
            opacity: tool === "highlighter" ? 0.6 : 1,
          }}
        />
      </div>

      {/* Stroke Sizes */}
      <div className={styles.section}>
        {[1, 3, 6, 10].map((s) => (
          <button
            key={s}
            className={`${styles.sizeBtn} ${size === s ? styles.activeSize : ""}`}
            onClick={() => onSizeChange(s)}
            title={`Stroke Width: ${s}px`}
            id={`size-${s}`}
          >
            <div
              style={{
                width: Math.max(3, s * 1.8),
                height: Math.max(3, s * 1.8),
                borderRadius: "50%",
                background: size === s ? "var(--accent)" : "currentColor",
              }}
            />
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      {/* Color Palette Swatches */}
      <div className={styles.colorGrid}>
        {COLORS.map((c) => (
          <button
            key={c}
            className={`${styles.colorSwatch} ${color === c ? styles.selected : ""}`}
            style={{ background: c }}
            onClick={() => onColorChange(c)}
            title={c}
            id={`color-${c.replace("#", "")}`}
          />
        ))}

        {/* Custom Color Wheel Picker */}
        <label className={styles.colorPicker} title="Choose custom color">
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            style={{ opacity: 0, position: "absolute", width: 0, height: 0 }}
          />
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </label>
      </div>
    </nav>
  );
}
