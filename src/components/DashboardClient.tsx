"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notebook } from "@/lib/types";
import NotebookCard from "./NotebookCard";
import ThemeToggle from "./ThemeToggle";
import styles from "./Dashboard.module.css";

interface Props {
  notebooks: Notebook[];
  username: string;
}

export default function DashboardClient({ notebooks: initial, username }: Props) {
  const [notebooks, setNotebooks] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [showNew, setShowNew] = useState(false);
  const router = useRouter();

  async function createNotebook(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);

    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), subject: subject.trim() }),
    });

    const json = await res.json();
    setCreating(false);

    if (res.ok) {
      router.push(`/notebook/${json.data.id}`);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="var(--accent)" />
              <path d="M10 12h16M10 18h10M10 24h13" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="27" cy="24" r="4" fill="white" opacity="0.9" />
            </svg>
            <span>Synapse Notes</span>
          </div>
          <div className={styles.headerRight}>
            <ThemeToggle />
            <span className={styles.username}>{username}</span>
            <button className="btn btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.topRow}>
          <div>
            <h1>My Notebooks</h1>
            <p className="text-secondary text-sm" style={{ marginTop: 4 }}>
              {notebooks.length === 0
                ? "Create your first notebook to get started"
                : `${notebooks.length} notebook${notebooks.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowNew(true)}
            id="new-notebook-btn"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New Notebook
          </button>
        </div>

        {/* New Notebook Form */}
        {showNew && (
          <div className={styles.newForm}>
            <form onSubmit={createNotebook} className={styles.newFormInner}>
              <div className={styles.newFormFields}>
                <input
                  type="text"
                  placeholder="Notebook title (e.g. Machine Learning — Sem 5)"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ flex: 2, padding: "9px 12px", fontSize: "var(--text-sm)" }}
                  autoFocus
                  required
                  id="notebook-title-input"
                />
                <input
                  type="text"
                  placeholder="Subject (e.g. Deep Learning)"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={{ flex: 1, padding: "9px 12px", fontSize: "var(--text-sm)" }}
                  id="notebook-subject-input"
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={creating} id="create-notebook-submit">
                  {creating ? "Creating…" : "Create"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowNew(false); setTitle(""); setSubject(""); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Grid */}
        {notebooks.length === 0 && !showNew ? (
          <div className={styles.empty}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" opacity="0.3">
              <rect x="12" y="8" width="40" height="48" rx="6" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20h24M20 28h16M20 36h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p>No notebooks yet</p>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>
              Create your first notebook
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {notebooks.map(nb => (
              <NotebookCard key={nb.id} notebook={nb} formatDate={formatDate} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
