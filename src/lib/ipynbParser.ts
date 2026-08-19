import { v4 as uuid } from "uuid";

export interface JupyterCellOutput {
  type: "text" | "image" | "error";
  text?: string;
  imageData?: string; // base64 PNG data (with or without data:image/png;base64, prefix)
}

export interface JupyterCell {
  id: string;
  type: "code" | "markdown";
  source: string;
  execution_count?: number | null;
  outputs?: JupyterCellOutput[];
  isEditing?: boolean;
}

/**
 * Parses raw .ipynb JSON text into normalized JupyterCell array
 */
export function parseIpynb(content: string): JupyterCell[] {
  try {
    const raw = JSON.parse(content);
    if (!raw.cells || !Array.isArray(raw.cells)) {
      throw new Error("Invalid .ipynb format: missing cells array");
    }

    return raw.cells.map((cell: any) => {
      const cellType: "code" | "markdown" = cell.cell_type === "markdown" ? "markdown" : "code";
      
      // Source can be string or array of strings
      const source = Array.isArray(cell.source) ? cell.source.join("") : (cell.source || "");

      const outputs: JupyterCellOutput[] = [];
      if (cellType === "code" && Array.isArray(cell.outputs)) {
        for (const out of cell.outputs) {
          if (out.output_type === "stream") {
            const text = Array.isArray(out.text) ? out.text.join("") : (out.text || "");
            outputs.push({ type: "text", text });
          } else if (out.output_type === "execute_result" || out.output_type === "display_data") {
            if (out.data) {
              if (out.data["image/png"]) {
                const img = Array.isArray(out.data["image/png"]) ? out.data["image/png"].join("") : out.data["image/png"];
                outputs.push({
                  type: "image",
                  imageData: img.startsWith("data:") ? img : `data:image/png;base64,${img.trim()}`,
                });
              } else if (out.data["text/plain"]) {
                const text = Array.isArray(out.data["text/plain"]) ? out.data["text/plain"].join("") : out.data["text/plain"];
                outputs.push({ type: "text", text });
              }
            }
          } else if (out.output_type === "error") {
            const text = `${out.ename || "Error"}: ${out.evalue || ""}\n${(out.traceback || []).join("\n")}`;
            outputs.push({ type: "error", text });
          }
        }
      }

      return {
        id: cell.id || `cell_${uuid().slice(0, 8)}`,
        type: cellType,
        source,
        execution_count: cell.execution_count ?? null,
        outputs: outputs.length > 0 ? outputs : undefined,
      };
    });
  } catch (err) {
    console.warn("Failed to parse .ipynb JSON, falling back to raw text:", err);
    return [
      {
        id: `cell_${uuid().slice(0, 8)}`,
        type: "code",
        source: content,
        execution_count: null,
      },
    ];
  }
}

/**
 * Serializes JupyterCell array back to standard Jupyter Notebook (.ipynb v4) JSON
 */
export function serializeToIpynb(cells: JupyterCell[], title: string = "Notebook"): string {
  const ipynbObj = {
    cells: cells.map(c => {
      const sourceLines = c.source.split("\n").map((line, idx, arr) => (idx < arr.length - 1 ? `${line}\n` : line));

      if (c.type === "markdown") {
        return {
          cell_type: "markdown",
          metadata: {},
          source: sourceLines,
          id: c.id,
        };
      }

      const outputs: any[] = [];
      if (c.outputs && c.outputs.length > 0) {
        for (const out of c.outputs) {
          if (out.type === "text") {
            outputs.push({
              output_type: "stream",
              name: "stdout",
              text: (out.text || "").split("\n").map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l)),
            });
          } else if (out.type === "image" && out.imageData) {
            const base64Clean = out.imageData.replace(/^data:image\/[a-z]+;base64,/, "");
            outputs.push({
              output_type: "display_data",
              data: {
                "image/png": base64Clean,
                "text/plain": ["<IPython.core.display.Image object>"],
              },
              metadata: {},
            });
          } else if (out.type === "error") {
            outputs.push({
              output_type: "error",
              ename: "ExecutionError",
              evalue: out.text || "",
              traceback: [(out.text || "")],
            });
          }
        }
      }

      return {
        cell_type: "code",
        execution_count: c.execution_count ?? null,
        metadata: {},
        outputs,
        source: sourceLines,
        id: c.id,
      };
    }),
    metadata: {
      kernelspec: {
        display_name: "Python 3 (Synapse WebAssembly)",
        language: "python",
        name: "python3",
      },
      language_info: {
        name: "python",
        version: "3.11.0",
        mimetype: "text/x-python",
        file_extension: ".py",
      },
      synapse_title: title,
    },
    nbformat: 4,
    nbformat_minor: 5,
  };

  return JSON.stringify(ipynbObj, null, 2);
}

/**
 * Parses Python script (.py) into Jupyter cells based on `# %%` delimiters
 */
export function parsePythonScript(scriptContent: string): JupyterCell[] {
  const lines = scriptContent.split("\n");
  const cells: JupyterCell[] = [];
  let currentType: "code" | "markdown" = "code";
  let currentLines: string[] = [];

  const flushCell = () => {
    if (currentLines.length > 0) {
      const src = currentLines.join("\n").trim();
      if (src.length > 0) {
        cells.push({
          id: `cell_${uuid().slice(0, 8)}`,
          type: currentType,
          source: currentLines.join("\n"),
          execution_count: null,
        });
      }
      currentLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("# %% [markdown]") || line.trim().startsWith("# <codecell> markdown")) {
      flushCell();
      currentType = "markdown";
    } else if (line.trim().startsWith("# %%") || line.trim().startsWith("# <codecell>")) {
      flushCell();
      currentType = "code";
    } else {
      // If in markdown mode from comment lines, strip leading '# ' if present
      if (currentType === "markdown" && line.startsWith("# ")) {
        currentLines.push(line.slice(2));
      } else {
        currentLines.push(line);
      }
    }
  }
  flushCell();

  if (cells.length === 0) {
    cells.push({
      id: `cell_${uuid().slice(0, 8)}`,
      type: "code",
      source: scriptContent,
      execution_count: null,
    });
  }

  return cells;
}

/**
 * Serializes JupyterCell array into a clean Python (.py) script with VS Code `# %%` cell markers
 */
export function serializeToPythonScript(cells: JupyterCell[]): string {
  const parts: string[] = [
    "# Synapse Notes — Python Notebook Export",
    `# Exported on: ${new Date().toISOString()}`,
    "",
  ];

  for (const cell of cells) {
    if (cell.type === "markdown") {
      parts.push("# %% [markdown]");
      const mdCommented = cell.source
        .split("\n")
        .map(line => (line.trim() ? `# ${line}` : "#"))
        .join("\n");
      parts.push(mdCommented);
      parts.push("");
    } else {
      parts.push("# %%");
      parts.push(cell.source);
      parts.push("");
    }
  }

  return parts.join("\n");
}
