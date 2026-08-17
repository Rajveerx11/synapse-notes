# Features Breakdown - Synapse Notes

Detailed breakdown of functional modules and UI interactions for version 1.0.

---

## 1. Canvas & S-Pen Experience
* **Pressure-Sensitive Ink**: Dynamic stroke thickness based on stylus pressure.
* **Palette Toolbar**:
  * Ballpoint Pen (Black, Blue, Red, Green, Custom color).
  * Highlighter (Yellow, Green, Pink, Blue with multiply blend mode).
  * Stroke Eraser (deletes entire curve on touch).
  * Smart Shape Snapping (converts rough sketches to lines, arrows, rectangles, ellipses).
  * Lasso Selection (select, move, or delete strokes).
* **Zoom & Pan**: Two-finger pinch to zoom and pan canvas while drawing with pen.

---

## 2. PDF & Document Workflows
* **Importing**: Drag-and-drop or file picker for multi-page PDF slide decks.
* **Navigation**: Thumbnail sidebar for rapid slide jumping.
* **Layering**: Handwriting and highlighters stay aligned to individual PDF pages during scrolling and zooming.
* **Export**: High-fidelity PDF export with embedded vector drawings.

---

## 3. AI & MCP Integration
* **Search**: Full-text and formula search across all notes.
* **Context Extraction**: Auto-extracts slide text + transcribed handwriting to feed AI agents.
* **Study Cards**: Modular cards showing step-by-step explanations, math equations ($LaTeX$), code snippets, and diagrams.
