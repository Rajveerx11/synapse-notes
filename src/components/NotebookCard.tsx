"use client";
import { useRouter } from "next/navigation";
import { Notebook } from "@/lib/types";
import styles from "./NotebookCard.module.css";

interface Props {
  notebook: Notebook;
  formatDate: (ts: number) => string;
}

const SUBJECT_COLORS: Record<string, string> = {
  "Machine Learning": "#4f8dff",
  "Deep Learning": "#8b5cf6",
  "Mathematics": "#ec4899",
  "Statistics": "#f59e0b",
  "Data Science": "#10b981",
  "Computer Vision": "#3b82f6",
  "NLP": "#6366f1",
};

function subjectColor(subject: string) {
  if (SUBJECT_COLORS[subject]) return SUBJECT_COLORS[subject];
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash = subject.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

export default function NotebookCard({ notebook, formatDate }: Props) {
  const router = useRouter();
  const color = subjectColor(notebook.subject || notebook.title);
  const tags = notebook.tags || [];

  return (
    <button
      className={styles.card}
      onClick={() => router.push(`/notebook/${notebook.id}`)}
      id={`notebook-${notebook.id}`}
    >
      <div className={styles.colorBar} style={{ background: color }} />
      <div className={styles.body}>
        <div className={styles.top}>
          {notebook.subject && (
            <span className={styles.subject} style={{ color, background: `${color}18` }}>
              {notebook.subject}
            </span>
          )}
        </div>
        <h3 className={styles.title}>{notebook.title}</h3>
        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.slice(0, 3).map(t => (
              <span
                key={t.id}
                className={styles.tagBadge}
                style={{ background: `${t.color}22`, color: t.color, borderColor: `${t.color}44` }}
              >
                {t.name}
              </span>
            ))}
            {tags.length > 3 && (
              <span className={styles.tagMore}>+{tags.length - 3}</span>
            )}
          </div>
        )}
        <div className={styles.meta}>
          <span>{notebook.page_count ?? 0} page{notebook.page_count === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{formatDate(notebook.updated_at)}</span>
        </div>
      </div>
    </button>
  );
}

