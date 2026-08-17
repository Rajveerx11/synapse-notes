"use client";
import { useEffect, useRef } from "react";
import { AiCard } from "@/lib/types";
import styles from "./StudyCard.module.css";

interface Props {
  card: AiCard;
}

export default function StudyCard({ card }: Props) {
  const mathRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);

  // Render KaTeX math
  useEffect(() => {
    if (!mathRef.current) return;
    const el = mathRef.current;

    async function renderMath() {
      const katex = (await import("katex")).default;
      await import("katex/dist/katex.min.css" as never);

      // Replace inline $...$ and block $$...$$ with rendered math
      const html = el.innerHTML
        .replace(/\$\$([^$]+)\$\$/g, (_, math) => {
          try {
            return katex.renderToString(math, { displayMode: true, throwOnError: false });
          } catch { return _; }
        })
        .replace(/\$([^$\n]+)\$/g, (_, math) => {
          try {
            return katex.renderToString(math, { displayMode: false, throwOnError: false });
          } catch { return _; }
        });
      el.innerHTML = html;
    }

    renderMath();
  }, [card.content]);

  // Render Mermaid diagram
  useEffect(() => {
    if (!diagramRef.current || !card.diagram_data || card.diagram_type === "none") return;
    const el = diagramRef.current;

    async function renderDiagram() {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, theme: "base", securityLevel: "loose" });
      try {
        const id = `mermaid-${card.id}`;
        const { svg } = await mermaid.render(id, card.diagram_data);
        el.innerHTML = svg;
      } catch {
        el.innerHTML = `<pre class="${styles.diagramError}">${card.diagram_data}</pre>`;
      }
    }

    renderDiagram();
  }, [card.diagram_data, card.diagram_type, card.id]);

  const formattedDate = new Date(card.created_at * 1000).toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  });

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <div className={styles.aiTag}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          AI Study Card
        </div>
        <span className={styles.date}>{formattedDate}</span>
      </div>

      <h3 className={styles.title}>{card.title}</h3>

      <div
        ref={mathRef}
        className={styles.content}
        dangerouslySetInnerHTML={{ __html: mdToHtml(card.content) }}
      />

      {card.diagram_data && card.diagram_type !== "none" && (
        <div ref={diagramRef} className={styles.diagram} />
      )}
    </article>
  );
}

/** Minimal markdown-to-HTML (bold, code, line breaks, lists) */
function mdToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}
