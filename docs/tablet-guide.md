# Samsung Galaxy Tab & Tablet Optimization Guide

This guide details how to configure and optimize **Synapse Notes** on your **Samsung Galaxy Tab** (S7, S8, S9, S9+, Ultra) or Android tablet with stylus support.

---

## 1. 📱 Installing as a Full-Screen Progressive Web App (PWA)

Installing Synapse Notes as a PWA removes the browser address bar, navigation tabs, and system navigation interference, giving you a 100% native full-screen canvas.

### On Samsung Internet Browser
1. Open [https://synapse-notes-iota.vercel.app](https://synapse-notes-iota.vercel.app).
2. Tap the **Menu icon (≡)** at the bottom-right corner.
3. Select **"Add page to"** → **"Home screen"** / **"App screen"**.
4. Launch **Synapse Notes** directly from your app drawer.

### On Google Chrome (Android)
1. Open [https://synapse-notes-iota.vercel.app](https://synapse-notes-iota.vercel.app).
2. Tap the **Three Dots (⋮)** at the top-right corner.
3. Tap **"Install app"** or **"Add to Home screen"**.

---

## 2. ✍️ Samsung S-Pen Features & Tuning

Synapse Notes is engineered specifically for active digitizers (Wacom EMR in Samsung S-Pen):

### 1. Hardware Pressure Sensitivity
* The S-Pen delivers 4,096 levels of pressure sensitivity.
* Synapse dynamically maps this hardware pressure curve to stroke thickness:
  $$\text{Rendered Width} = \text{Base Size} \times (0.5 + 1.5 \times \text{Pressure})$$
* Light strokes produce razor-thin fine lines for math subscripts, while firm strokes create bold headings.

### 2. Palm Rejection
* The canvas listens to `e.pointerType === "pen"`.
* When writing with the S-Pen, the browser discards all simultaneous touch inputs from the palm of your hand, allowing you to rest your hand naturally on the screen.

### 3. S-Pen Air Actions & Button
* You can write continuously without accidental page scrolling (`touch-action: none` is enforced on the canvas).

---

## 3. 📑 PDF Slide Markup Workflow for Lectures

1. **Before Class:**
   * Open your notebook in Synapse Notes.
   * Tap the **Import PDF** icon in the top navigation bar.
   * Select your professor's lecture deck (PDF).
2. **During Class:**
   * Tap the **Annotate PDF** toggle button.
   * Use the **Pen** to write notes beside diagrams, or switch to **Highlighter** (which automatically preserves underlying text readability via multiply blend mode).
   * Navigate through slides using the **Page Indicator** arrows (`←` / `→`).
3. **After Class:**
   * Tap **"Export ▾"** → **"PDF Document (.pdf)"** to generate a single merged document with your vector handwriting permanently embedded into the lecture slides.

---

## 4. 📦 Universal Multi-Format Export Guide

Synapse Notes allows exporting your notes and study decks directly from your tablet to any document suite:

| Target Format | Compatibility | Contents |
|---|---|---|
| **📄 PDF Document (`.pdf`)** | Adobe Acrobat, Samsung Notes, Chrome | High-fidelity vector PDF with merged annotations. |
| **🖼️ Image Snapshot (`.png` / `.jpg`)** | Gallery, Socials, Discord, Notion | High-resolution raster canvas image with crisp white background. |
| **📝 Word Document (`.docx`)** | Microsoft Word, **Google Docs**, LibreOffice, WPS | Formatted document with titles, embedded canvas drawings, text notes, and AI study cards. |
| **📊 Presentation (`.pptx`)** | Microsoft PowerPoint, **Google Slides**, Keynote | Full slide deck with 1 slide per page, canvas visuals on left, notes/equations on right. |
| **📈 Spreadsheet (`.xlsx`)** | Microsoft Excel, **Google Sheets**, Numbers | Structured study matrix with *Overview*, *Pages & Notes*, and *AI Study Cards*. |

### How to Open in Google Docs / Google Drive:
1. Tap **"Export ▾"** → **"Word Document (.docx)"** on your tablet.
2. In Google Drive on your tablet/laptop, upload or open the downloaded `.docx` file.
3. Select **"Open with Google Docs"** to edit or share with classmates!

### How to Open in Google Slides:
1. Tap **"Export ▾"** → **"Presentation (.pptx)"**.
2. Open Google Slides, click **File** → **Import Slides** or upload the `.pptx` directly to Google Drive.

---

## 5. ⚡ Offline Resilience & Local Storage Sync

* All strokes and notebook changes are automatically cached in browser `localStorage` before background synchronization.
* If university Wi-Fi drops or fluctuates during a lecture, your drawings are never lost. As soon as connectivity restores, Synapse synchronizes all pending changes with the cloud database.
