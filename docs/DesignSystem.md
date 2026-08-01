## Design System Vision: "Baghdad Library" (`baglib`)

`baglib` bridges classical Islamic scholarship—evoking the intellectual depth of _Bayt al-Hikmah_ (the House of Wisdom)—with modern, local-first digital research software (like Obsidian, Zotero, and Readwise).

The visual identity must feel **serene, scholarly, precise, and timeless**.

---

## 1. Color System & Semantic Mapping

Your primary palette (**Pale Sky**) brings calm, intellectual clarity, while **Evergreen** adds a grounded natural touch deeply rooted in Islamic visual tradition.

To complete the color theory model, we introduce **Baghdad Amber (Accent)**—a rich, parchment-and-gold hue that acts as a complementary warm focal point for highlights, active Quranic verses, search matches, and bookmarks.

### 🎨 Color Roles Breakdown

| Role          | Color Palette      | Key Tokens / Values                                       | Best Used For                                                                           |
| ------------- | ------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Primary**   | **Pale Sky**       | `500` (`#4691b9`) / `600` (`#387494`) / `700` (`#2a576f`) | Primary buttons, active sidebar items, main brand accents, links, focused inputs        |
| **Secondary** | **Evergreen**      | `500` (`#57a877`) / `600` (`#45875f`) / `700` (`#346548`) | Tags, success states, SRS mastery indicators, Zotero sync badges, green annotations     |
| **Accent**    | **Baghdad Amber**  | `500` (`#d97706`) / `400` (`#f59e0b`) / `600` (`#b45309`) | Bookmarks, Quranic ayah markers, active search highlights, streak badges, warning flags |
| **Neutrals**  | **Pale Sky Grays** | `50` (`#edf4f8`) → `950` (`#0a141a`)                      | Surfaces, borders, text, tooltips, panel backgrounds                                    |

---

### 🌗 Light vs. Dark Mode Mapping

To ensure high contrast and WCAG AAA/AA readability across dense scholarly text, map your background and foreground roles as follows:

```
LIGHT MODE
┌─────────────────────────────────────────────────────────┐
│ Canvas Base        : Pale Sky 50  (#edf4f8)             │
│ Surface / Cards    : White (#ffffff) or Pale Sky 100    │
│ Border / Dividers  : Pale Sky 200 (#b5d3e3)             │
│ Foreground Text    : Pale Sky 950 (#0a141a) [Contrast 16:1]│
│ Muted Text         : Pale Sky 700 (#2a576f)             │
└─────────────────────────────────────────────────────────┘

DARK MODE
┌─────────────────────────────────────────────────────────┐
│ Canvas Base        : Pale Sky 950 (#0a141a)             │
│ Surface / Cards    : Pale Sky 900 (#0e1d25)             │
│ Border / Dividers  : Pale Sky 800 (#1c3a4a)             │
│ Foreground Text    : Pale Sky 50  (#edf4f8) [Contrast 16:1]│
│ Muted Text         : Pale Sky 300 (#90bdd5)             │
└─────────────────────────────────────────────────────────┘

```

---

## 2. Typography Strategy

For an Islamic research app supporting both Arabic and English, typography requires a clear **three-tier operational separation**:

1. **Reem Kufi (`font-display`)**: Elegant, geometric Kufic headers. Used selectively for app titles, modal headers, major section dividers, and branding elements.
2. **Tajawal (`font-sans`)**: Crisp, modern, highly legible geometric sans-serif. Used for all **UI elements** (sidebars, button labels, settings, metadata tags, tree views, table columns).
3. **Amiri (`font-serif` / `font-reading`)**: Classical Naskh script. **Essential** for long-form reading, Quranic text, Hadith citations, Tafsir excerpts, and academic note bodies.

> **Decision Guidance:** Do not choose between Tajawal and Amiri—use **Tajawal for UI controls** and **Amiri for document body/content reading**. This matches how modern academic apps treat interface typography vs. document typography.

```
Typography Hierarchy Strategy:
┌─────────────────────────────────────────────────────────────┐
│ [REEM KUFI]    Main Title / Dashboard Headers / Book Titles │
│ [TAJAWAL]      Sidebar menu, Buttons, Filters, Tags, Inputs │
│ [AMIRI]        Quranic Verses, Hadith, Tafsir, Note Body    │
└─────────────────────────────────────────────────────────────┘

```

---

## 3. Tailwind CSS Configuration (`tailwind.config.js`)

Below is the complete ready-to-use Tailwind configuration integrating your colors, fonts, and dark mode rules:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class", // Perfect for Electron desktop apps
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "pale-sky": {
          50: "#edf4f8",
          100: "#dae9f1",
          200: "#b5d3e3",
          300: "#90bdd5",
          400: "#6ba7c7",
          500: "#4691b9",
          600: "#387494",
          700: "#2a576f",
          800: "#1c3a4a",
          900: "#0e1d25",
          950: "#0a141a",
        },
        evergreen: {
          50: "#eef6f1",
          100: "#ddeee4",
          200: "#bcdcc9",
          300: "#9acbae",
          400: "#78ba92",
          500: "#57a877",
          600: "#45875f",
          700: "#346548",
          800: "#234330",
          900: "#112218",
          950: "#0c1811",
        },
        amber: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#d97706", // Primary Baghdad Amber accent
          600: "#b45309",
          700: "#92400e",
          800: "#78350f",
          900: "#451a03",
        },
        // Semantic Token Aliases
        background: "var(--bg-canvas)",
        surface: "var(--bg-surface)",
        border: "var(--border-subtle)",
        foreground: "var(--text-main)",
        muted: "var(--text-muted)",
      },
      fontFamily: {
        display: ["var(--font-reem-kufi)", "serif"],
        sans: ["var(--font-tajawal)", "sans-serif"],
        serif: ["var(--font-amiri)", "serif"],
        reading: ["var(--font-amiri)", "serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
```

---

## 4. CSS Variables (`globals.css`) Setup

Paste this into your global stylesheet to support effortless light/dark theme switching in Next.js:

```css
@layer base {
  :root {
    --bg-canvas: #edf4f8; /* pale-sky-50 */
    --bg-surface: #ffffff; /* White card background */
    --bg-sidebar: #dae9f1; /* pale-sky-100 */
    --border-subtle: #b5d3e3; /* pale-sky-200 */
    --text-main: #0a141a; /* pale-sky-950 */
    --text-muted: #2a576f; /* pale-sky-700 */
  }

  .dark {
    --bg-canvas: #0a141a; /* pale-sky-950 */
    --bg-surface: #0e1d25; /* pale-sky-900 */
    --bg-sidebar: #0e1d25; /* pale-sky-900 */
    --border-subtle: #1c3a4a; /* pale-sky-800 */
    --text-main: #edf4f8; /* pale-sky-50 */
    --text-muted: #90bdd5; /* pale-sky-300 */
  }

  body {
    background-color: var(--bg-canvas);
    color: var(--text-main);
    font-family: var(--font-tajawal), sans-serif;
  }
}
```

---

## 5. Key UI Component Token Mapping

- **Primary Action Buttons**: `bg-pale-sky-600 hover:bg-pale-sky-700 text-white dark:bg-pale-sky-500 dark:hover:bg-pale-sky-600`
- **Knowledge Cards (Ayah / Hadith)**: `bg-surface border border-border rounded-xl shadow-sm p-4 hover:border-pale-sky-400`
- **Ayah / Highlight Badges**: `bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300`
- **SRS Flashcard Mastery / Active Streaks**: `text-evergreen-600 dark:text-evergreen-400`
- **Sidebar Selected State**: `bg-pale-sky-200/60 text-pale-sky-900 font-semibold dark:bg-pale-sky-800/60 dark:text-pale-sky-100`
