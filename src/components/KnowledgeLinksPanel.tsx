"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KnowledgeGraph, KnowledgeGraphNode } from "@/lib/types";
import styles from "./KnowledgeLinksPanel.module.css";

interface Props {
  notebookId: string;
  notebookTitle: string;
  pageNumber: number;
  pageText: string;
  onSaveText: (text: string) => void;
  onClose: () => void;
}

interface ActiveWikiQuery {
  start: number;
  query: string;
}

function findActiveWikiQuery(value: string, cursor: number): ActiveWikiQuery | null {
  const beforeCursor = value.slice(0, cursor);
  const start = beforeCursor.lastIndexOf("[[");
  if (start < 0 || beforeCursor.slice(start + 2).includes("]]")) return null;
  const query = beforeCursor.slice(start + 2);
  if (query.includes("\n") || query.length > 120) return null;
  return { start, query };
}

export default function KnowledgeLinksPanel({
  notebookId,
  notebookTitle,
  pageNumber,
  pageText,
  onSaveText,
  onClose,
}: Props) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [text, setText] = useState(pageText);
  const [activeQuery, setActiveQuery] = useState<ActiveWikiQuery | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setText(pageText);
    setActiveQuery(null);
    setSaved(false);
  }, [pageNumber, pageText]);

  const loadGraph = async () => {
    try {
      const response = await fetch("/api/knowledge-graph");
      if (!response.ok) throw new Error("Could not load connections");
      const payload = await response.json();
      setGraph(payload.data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load connections");
    }
  };

  useEffect(() => { void loadGraph(); }, []);

  const nodeById = useMemo(
    () => new Map((graph?.nodes || []).map((node) => [node.id, node])),
    [graph],
  );
  const outgoing = graph?.edges.filter((edge) => edge.source === notebookId) || [];
  const backlinks = graph?.edges.filter((edge) => edge.target === notebookId) || [];
  const suggestions = useMemo(() => {
    if (!graph || !activeQuery) return [];
    const query = activeQuery.query.trim().toLocaleLowerCase();
    return graph.nodes
      .filter((node) => node.id !== notebookId && (!query || node.title.toLocaleLowerCase().includes(query)))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "notebook" ? -1 : 1;
        return a.title.localeCompare(b.title);
      })
      .slice(0, 7);
  }, [activeQuery, graph, notebookId]);

  const updateText = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    setSaved(false);
    setActiveQuery(findActiveWikiQuery(event.target.value, event.target.selectionStart));
  };

  const insertSuggestion = (node: KnowledgeGraphNode) => {
    if (!activeQuery) return;
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const nextText = `${text.slice(0, activeQuery.start)}[[${node.title}]]${text.slice(cursor)}`;
    const nextCursor = activeQuery.start + node.title.length + 4;
    setText(nextText);
    setActiveQuery(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const saveText = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/notebooks/${notebookId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_number: pageNumber, text_content: text }),
      });
      if (!response.ok) throw new Error("Could not save wiki links");
      onSaveText(text);
      setSaved(true);
      await loadGraph();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save wiki links");
    } finally {
      setSaving(false);
    }
  };

  const openNode = (node: KnowledgeGraphNode | undefined) => {
    if (node?.href) router.push(node.href);
  };

  return (
    <aside className={styles.panel} role="complementary" aria-label="Wiki links and backlinks">
      <div className={styles.header}>
        <div><span className={styles.kicker}>Linked thinking</span><h3>Connections</h3></div>
        <button className="btn-icon" onClick={onClose} aria-label="Close connections panel" id="close-links-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className={styles.content}>
        <div className={styles.context}><span>{notebookTitle}</span><small>Page {pageNumber}</small></div>
        <label className={styles.editorLabel}>
          <span>Searchable page text</span>
          <small>Type <code>[[</code> to link a note or concept.</small>
          <div className={styles.editorWrap}>
            <textarea ref={textareaRef} value={text} onChange={updateText} onClick={(event) => setActiveQuery(findActiveWikiQuery(event.currentTarget.value, event.currentTarget.selectionStart))} rows={7} placeholder="Add searchable text and connect ideas with [[Notebook Title]]…" aria-label="Page text with wiki links" id="wiki-link-editor" />
            {activeQuery && (
              <div className={styles.suggestions} role="listbox" aria-label="Wiki link suggestions">
                {suggestions.length > 0 ? suggestions.map((node) => (
                  <button key={node.id} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSuggestion(node)}>
                    <span>{node.title}</span><small>{node.kind} · {node.subject}</small>
                  </button>
                )) : <p>No matching note. Save to create a concept node.</p>}
              </div>
            )}
          </div>
        </label>
        <button className={styles.saveButton} onClick={saveText} disabled={saving || saved} id="save-wiki-links-btn">{saving ? "Saving…" : saved ? "Saved" : "Save page links"}</button>
        {error && <p className={styles.error} role="alert">{error}</p>}

        <section className={styles.section}>
          <div className={styles.sectionTitle}><span>Outgoing</span><strong>{outgoing.length}</strong></div>
          {outgoing.length === 0 ? <p className={styles.empty}>No outgoing links on this notebook yet.</p> : outgoing.map((edge) => {
            const node = nodeById.get(edge.target);
            return <button className={styles.linkRow} key={edge.id} onClick={() => openNode(node)} disabled={!node?.href}><span className={styles.direction}>↗</span><div><strong>{node?.title}</strong><small>{edge.mentions} mention{edge.mentions === 1 ? "" : "s"}</small></div></button>;
          })}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}><span>Backlinks</span><strong>{backlinks.length}</strong></div>
          {backlinks.length === 0 ? <p className={styles.empty}>No other notebooks link here yet.</p> : backlinks.map((edge) => {
            const node = nodeById.get(edge.source);
            const reference = edge.references[0];
            return <button className={styles.linkRow} key={edge.id} onClick={() => openNode(node)}><span className={styles.direction}>↙</span><div><strong>{node?.title}</strong><small>{reference?.source_label || `${edge.mentions} mentions`}</small></div></button>;
          })}
        </section>
      </div>
      <button className={styles.graphButton} onClick={() => router.push("/graph")} id="open-knowledge-graph-btn">Open knowledge graph <span>⌘</span></button>
    </aside>
  );
}
