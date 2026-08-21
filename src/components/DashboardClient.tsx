"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Notebook, Tag, Folder } from "@/lib/types";
import NotebookCard from "./NotebookCard";
import ThemeToggle from "./ThemeToggle";
import FlashcardReviewModal from "./FlashcardReviewModal";
import styles from "./Dashboard.module.css";

const TAG_PRESETS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16",
];

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

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Tags & folders state
  const [tags, setTags] = useState<Tag[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notebookTags, setNotebookTags] = useState<Record<string, Tag[]>>({});

  // Tag/folder creation
  const [showTagForm, setShowTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_PRESETS[0]);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const router = useRouter();

  // ── Load tags and folders ──────────────────────────────────────────
  useEffect(() => {
    async function loadMeta() {
      try {
        const [tagsRes, foldersRes] = await Promise.all([
          fetch("/api/tags"),
          fetch("/api/folders"),
        ]);
        if (tagsRes.ok) {
          const json = await tagsRes.json();
          setTags(json.data || []);
        }
        if (foldersRes.ok) {
          const json = await foldersRes.json();
          setFolders(json.data || []);
        }
      } catch (e) {
        console.warn("Failed to load tags/folders:", e);
      }
    }
    loadMeta();
  }, []);

  // ── Hydrate from localStorage on client mount ──────────────────────
  useEffect(() => {
    try {
      const localListStr = localStorage.getItem("synapse_user_notebooks");
      if (localListStr) {
        const localList: Notebook[] = JSON.parse(localListStr);
        setNotebooks(prev => {
          const map = new Map<string, Notebook>();
          for (const nb of prev) map.set(nb.id, nb);
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

  // ── Load tags for each notebook ────────────────────────────────────
  useEffect(() => {
    async function loadNotebookTags() {
      const results: Record<string, Tag[]> = {};
      await Promise.all(
        notebooks.slice(0, 20).map(async (nb) => {
          try {
            const res = await fetch(`/api/notebooks/${nb.id}/tags`);
            if (res.ok) {
              const json = await res.json();
              results[nb.id] = json.data || [];
            }
          } catch {
            results[nb.id] = [];
          }
        })
      );
      setNotebookTags(results);
    }
    if (notebooks.length > 0) loadNotebookTags();
  }, [notebooks]);

  // ── Smart search + tag + folder filtering ─────────────────────────
  const filteredNotebooks = useMemo(() => {
    let list = notebooks;

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (nb) =>
          nb.title.toLowerCase().includes(q) ||
          nb.subject.toLowerCase().includes(q)
      );
    }

    // Tag filter
    if (activeTagId) {
      list = list.filter((nb) =>
        (notebookTags[nb.id] || []).some((t) => t.id === activeTagId)
      );
    }

    // Folder filter
    if (activeFolderId) {
      list = list.filter((nb) => nb.folder_id === activeFolderId);
    }

    return list;
  }, [notebooks, searchQuery, activeTagId, activeFolderId, notebookTags]);

  // ── Create notebook ────────────────────────────────────────────────
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
                  updated_at: newNb.created_at,
                },
              ],
            })
          );
          const existingListStr = localStorage.getItem("synapse_user_notebooks");
          const existingList: Notebook[] = existingListStr ? JSON.parse(existingListStr) : [];
          localStorage.setItem(
            "synapse_user_notebooks",
            JSON.stringify([newNb, ...existingList.filter(n => n.id !== newNb.id)])
          );
        } catch (storageErr) {
          console.warn("Storage write error:", storageErr);
        }

        router.push(`/notebook/${newNb.id}`);
      } else {
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

  // ── Tag CRUD ───────────────────────────────────────────────────────
  const createTag = useCallback(async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      if (res.ok) {
        const json = await res.json();
        setTags(prev => [...prev, json.data]);
        setNewTagName("");
        setShowTagForm(false);
      }
    } catch (e) {
      console.error("Create tag error:", e);
    }
  }, [newTagName, newTagColor]);

  const deleteTag = useCallback(async (tagId: string) => {
    if (!confirm("Delete this tag from all notebooks?")) return;
    try {
      await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      setTags(prev => prev.filter(t => t.id !== tagId));
      if (activeTagId === tagId) setActiveTagId(null);
    } catch (e) {
      console.error("Delete tag error:", e);
    }
  }, [activeTagId]);

  // ── Folder CRUD ────────────────────────────────────────────────────
  const createFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        setFolders(prev => [...prev, json.data]);
        setNewFolderName("");
        setShowFolderForm(false);
      }
    } catch (e) {
      console.error("Create folder error:", e);
    }
  }, [newFolderName]);

  const deleteFolder = useCallback(async (folderId: string) => {
    if (!confirm("Delete this folder? Notebooks inside will be moved to root.")) return;
    try {
      await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
      setFolders(prev => prev.filter(f => f.id !== folderId));
      if (activeFolderId === folderId) setActiveFolderId(null);
    } catch (e) {
      console.error("Delete folder error:", e);
    }
  }, [activeFolderId]);

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

      {/* Main layout */}
      <div className={styles.mainLayout}>
        {/* Sidebar — tags & folders */}
        <aside className={styles.sidebar}>
          {/* Search */}
          <div className={styles.searchBox}>
            <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="search"
              placeholder="Search notebooks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              aria-label="Search notebooks"
            />
          </div>

          {/* Folders */}
          <div className={styles.sideSection}>
            <div className={styles.sideSectionHeader}>
              <span>Folders</span>
              <button
                className={styles.sideAddBtn}
                onClick={() => setShowFolderForm(v => !v)}
                aria-label="Add folder"
              >+</button>
            </div>
            {showFolderForm && (
              <div className={styles.inlineForm}>
                <input
                  type="text"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createFolder()}
                  className={styles.inlineInput}
                  autoFocus
                />
                <button className={styles.inlineSave} onClick={createFolder}>Add</button>
              </div>
            )}
            <button
              className={`${styles.folderItem} ${activeFolderId === null ? styles.folderItemActive : ""}`}
              onClick={() => setActiveFolderId(null)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
              All Notebooks
            </button>
            {folders.map(f => (
              <div key={f.id} className={styles.folderRow}>
                <button
                  className={`${styles.folderItem} ${activeFolderId === f.id ? styles.folderItemActive : ""}`}
                  onClick={() => setActiveFolderId(activeFolderId === f.id ? null : f.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                  {f.name}
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={() => deleteFolder(f.id)}
                  aria-label={`Delete folder ${f.name}`}
                >×</button>
              </div>
            ))}
          </div>

          {/* Tags */}
          <div className={styles.sideSection}>
            <div className={styles.sideSectionHeader}>
              <span>Tags</span>
              <button
                className={styles.sideAddBtn}
                onClick={() => setShowTagForm(v => !v)}
                aria-label="Add tag"
              >+</button>
            </div>
            {showTagForm && (
              <div className={styles.inlineForm}>
                <input
                  type="text"
                  placeholder="Tag name..."
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createTag()}
                  className={styles.inlineInput}
                  autoFocus
                />
                <div className={styles.colorPicker}>
                  {TAG_PRESETS.map(c => (
                    <button
                      key={c}
                      className={`${styles.colorDot} ${newTagColor === c ? styles.colorDotActive : ""}`}
                      style={{ background: c }}
                      onClick={() => setNewTagColor(c)}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
                <button className={styles.inlineSave} onClick={createTag}>Add</button>
              </div>
            )}
            <button
              className={`${styles.tagChip} ${activeTagId === null ? styles.tagChipActive : ""}`}
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              onClick={() => setActiveTagId(null)}
            >
              All
            </button>
            {tags.map(t => (
              <div key={t.id} className={styles.tagRow}>
                <button
                  className={`${styles.tagChip} ${activeTagId === t.id ? styles.tagChipActive : ""}`}
                  style={{
                    background: activeTagId === t.id ? t.color : `${t.color}22`,
                    color: activeTagId === t.id ? "#fff" : t.color,
                    borderColor: t.color,
                  }}
                  onClick={() => setActiveTagId(activeTagId === t.id ? null : t.id)}
                >
                  {t.name}
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={() => deleteTag(t.id)}
                  aria-label={`Delete tag ${t.name}`}
                >×</button>
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className={styles.main}>
          <div className={styles.topRow}>
            <div>
              <h1>My Notebooks</h1>
              <p className="text-secondary text-sm" style={{ marginTop: 4 }}>
                {filteredNotebooks.length === 0
                  ? searchQuery || activeTagId || activeFolderId
                    ? "No notebooks match your filters"
                    : "Create your first notebook to get started"
                  : `${filteredNotebooks.length} of ${notebooks.length} notebook${notebooks.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className={styles.topActions}>
              <button
                className="btn btn-ghost"
                onClick={() => router.push("/graph")}
                id="knowledge-graph-btn"
                title="Explore linked notebooks and concepts"
                style={{ border: "1px solid var(--border)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="5" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" />
                  <path d="M7.3 10.9 15.6 7M7.3 13.1l8.3 3.9" />
                </svg>
                Knowledge Graph
              </button>
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
          {filteredNotebooks.length === 0 && !showNew ? (
            <div className={styles.empty}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" opacity="0.3">
                <rect x="12" y="8" width="40" height="48" rx="6" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20h24M20 28h16M20 36h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p>{searchQuery || activeTagId || activeFolderId ? "No notebooks match your filters" : "No notebooks yet"}</p>
              {!(searchQuery || activeTagId || activeFolderId) && (
                <button className="btn btn-primary" onClick={() => setShowNew(true)}>
                  Create your first notebook
                </button>
              )}
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredNotebooks.map(nb => (
                <NotebookCard
                  key={nb.id}
                  notebook={{ ...nb, tags: notebookTags[nb.id] || [] }}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Spaced Repetition Flashcard Review Modal */}
      {showReview && (
        <FlashcardReviewModal onClose={() => setShowReview(false)} />
      )}
    </div>
  );
}
