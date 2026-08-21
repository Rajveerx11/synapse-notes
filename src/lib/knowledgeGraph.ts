import {
  AiCard,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeGraphReference,
  Notebook,
  Page,
} from "./types";

const WIKI_LINK_PATTERN = /\[\[([^\[\]\n]{1,120})\]\]/g;

export function normalizeWikiTarget(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function extractWikiLinks(text: string): string[] {
  if (!text) return [];
  const links: string[] = [];
  for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
    const title = match[1].trim();
    if (title) links.push(title);
  }
  return links;
}

function conceptId(title: string): string {
  return `concept:${normalizeWikiTarget(title)}`;
}

export function buildKnowledgeGraph(
  notebooks: Notebook[],
  pages: Page[],
  cards: AiCard[],
): KnowledgeGraph {
  const notebookById = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const notebookByTitle = new Map(
    notebooks.map((notebook) => [normalizeWikiTarget(notebook.title), notebook]),
  );
  const nodeById = new Map<string, KnowledgeGraphNode>();
  const edgeById = new Map<string, KnowledgeGraphEdge>();

  for (const notebook of notebooks) {
    nodeById.set(notebook.id, {
      id: notebook.id,
      title: notebook.title,
      kind: "notebook",
      subject: notebook.subject || "Unsorted",
      href: `/notebook/${notebook.id}`,
      incoming_count: 0,
      outgoing_count: 0,
    });
  }

  const addLinks = (
    sourceNotebookId: string,
    text: string,
    sourceType: "page" | "card",
    sourceLabel: string,
    pageNumber: number,
  ) => {
    const sourceNotebook = notebookById.get(sourceNotebookId);
    if (!sourceNotebook) return;

    for (const linkedTitle of extractWikiLinks(text)) {
      const linkedNotebook = notebookByTitle.get(normalizeWikiTarget(linkedTitle));
      const targetId = linkedNotebook?.id || conceptId(linkedTitle);
      const targetTitle = linkedNotebook?.title || linkedTitle;

      if (!nodeById.has(targetId)) {
        nodeById.set(targetId, {
          id: targetId,
          title: targetTitle,
          kind: "concept",
          subject: sourceNotebook.subject || "Unsorted",
          incoming_count: 0,
          outgoing_count: 0,
        });
      }

      const reference: KnowledgeGraphReference = {
        source_notebook_id: sourceNotebookId,
        source_notebook_title: sourceNotebook.title,
        target_id: targetId,
        target_title: targetTitle,
        source_type: sourceType,
        source_label: sourceLabel,
        page_number: pageNumber,
      };
      const edgeId = `${sourceNotebookId}::${targetId}`;
      const existing = edgeById.get(edgeId);

      if (existing) {
        existing.mentions += 1;
        existing.references.push(reference);
      } else {
        edgeById.set(edgeId, {
          id: edgeId,
          source: sourceNotebookId,
          target: targetId,
          mentions: 1,
          references: [reference],
        });
      }
    }
  };

  for (const page of pages) {
    addLinks(
      page.notebook_id,
      [page.text_content, page.code_content].filter(Boolean).join("\n"),
      "page",
      `Page ${page.page_number}`,
      page.page_number,
    );
  }

  const pageNumberById = new Map(pages.map((page) => [page.id, page.page_number]));
  for (const card of cards) {
    addLinks(
      card.notebook_id,
      [card.title, card.content, card.diagram_data].filter(Boolean).join("\n"),
      "card",
      card.title,
      pageNumberById.get(card.page_id) || 1,
    );
  }

  for (const edge of edgeById.values()) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (source) source.outgoing_count += 1;
    if (target) target.incoming_count += 1;
  }

  const nodes = [...nodeById.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "notebook" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  const subjects = [...new Set(nodes.map((node) => node.subject))].sort((a, b) =>
    a.localeCompare(b),
  );

  return { nodes, edges: [...edgeById.values()], subjects };
}
