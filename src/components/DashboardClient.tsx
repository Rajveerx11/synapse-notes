"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Notebook } from "@/lib/types";
import NotebookCard from "./NotebookCard";
import ThemeToggle from "./ThemeToggle";
import FlashcardReviewModal from "./FlashcardReviewModal";
import styles from "./Dashboard.module.css";

interface Props {
  notebooks: Notebook[];
  username: string;
}

export default function DashboardClient({ notebooks: initial, username }: Props) {
  const [notebooks, setNotebooks] = useState<Notebook[]>(initial);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const router = useRouter();

  // Hydrate from localStorage on client mount (merge with server data)
  useEffect(() => {
    try {
      const localListStr = localStorage.getItem("synapse_user_notebooks");
      if (localListStr) {
        const localList: Notebook[] = JSON.parse(localListStr);
        setNotebooks(prev => {
          const map = new Map<string, Notebook>();
          // Server items first
          for (const nb of prev) map.set(nb.id, nb);
          // Local items if missing
          for (const nb of localList) {
            if (!map.has(nb.id)) map.set(nb.id, nb);
          }
          return Array.from(map.values()).sort((a, b) => b.updated_at - a.updated_at);
        });
      }
    } catch (e) {
      console.warn("Failed to load local notebooks cache:", e);
    }
  }, []);

  async function createNotebook(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);

    const titleVal = title.trim();
    const subjectVal = subject.trim();

    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleVal, subject: subjectVal }),
      });

      let json: { data?: Notebook; error?: string } = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      setCreating(false);

      if (res.ok && json.data) {
        const newNb = json.data;
        // Save to local cache for instant offline & cross-lambda access
        try {
          localStorage.setItem(
            `synapse_nb_${newNb.id}`,
            JSON.stringify({
              id: newNb.id,
              title: newNb.title,
              subject: newNb.subject,
              pages: [
                {
                  id: "p1",
                  notebook_id: newNb.id,
                  page_number: 1,
                  strokes_json: "[]",
                  text_content: "",
                  pdf_url: null,
                  pdf_page: null,
                  updated_at: Math.floor(Date.now() / 1000),
                },
              ],
            })
          );

          // Update local notebooks list
          const existingList: Notebook[] = JSON.parse(
            localStorage.getItem("synapse_user_notebooks") || "[]"
          );
          localStorage.setItem(
            "synapse_user_notebooks",
            JSON.stringify([newNb, ...existingList.filter(n => n.id !== newNb.id)])
          );
        } catch (storageErr) {
          console.warn("Storage write error:", storageErr);
        }

        router.push(`/notebook/${newNb.id}`);
      } else {
        // If server failed, create a client-side notebook fallback
        const fallbackId = `local-${Date.now()}`;
        const fallbackNb: Notebook = {
          id: fallbackId,
          user_id: "local",
          title: titleVal,
          subject: subjectVal,
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
          page_count: 1,
        };

        localStorage.setItem(
          `synapse_nb_${fallbackId}`,
          JSON.stringify({
            id: fallbackId,
            title: fallbackNb.title,
            subject: fallbackNb.subject,
            pages: [
              {
                id: "p1",
                notebook_id: fallbackId,
                page_number: 1,
                strokes_json: "[]",
                text_content: "",
                pdf_url: null,
                pdf_page: null,
                updated_at: Math.floor(Date.now() / 1000),
              },
            ],
          })
        );

        router.push(`/notebook/${fallbackId}`);
      }
    } catch (err) {
      setCreating(false);
      console.error("Create notebook error:", err);
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
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button
              className="btn btn-ghost"
              onClick={() => setShowReview(true)}
              id="study-flashcards-btn"
              title="Practice active recall spaced repetition"
              style={{ border: "1px solid var(--border)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              </svg>
              Study Flashcards
            </button>
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
        </div>

        {/* New Notebook Form */}
        {showNew && (
          <div className={styles.newForm}>
            <form onSubmit={createNotebook} className={styles.newFormInner}>
              <div className={styles.newFormFields}>
                <input
                  type="text"
                  placeholder="Notebook title (e.g., Organic Chemistry, Linear Algebra)"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ flex: 2, padding: "9px 12px", fontSize: "var(--text-sm)" }}
                  autoFocus
                  required
                />
                <input
                  type="text"
                  placeholder="Subject / Course code (optional, e.g., CS 101)"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={{ flex: 1, padding: "9px 12px", fontSize: "var(--text-sm)" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={creating || !title.trim()} id="create-notebook-submit">
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

      {/* Spaced Repetition Flashcard Review Modal */}
      {showReview && (
        <FlashcardReviewModal onClose={() => setShowReview(false)} />
      )}
    </div>
  );
}
