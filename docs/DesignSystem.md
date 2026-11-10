## Design System Vision: "Baghdad Library" (`baglib`)

`baglib` bridges classical Islamic scholarship—evoking the intellectual depth of _Bayt al-Hikmah_ (the House of Wisdom)—with modern, local-first digital research software (like Obsidian, Zotero, and Readwise).

The visual identity feels **serene, scholarly, precise, and timeless**.

---

## 1. Architectural Decisions: Decision D1 (The Figma Palette Wins)

Under Decision D1 (KEY-294 / KEY-296), where the Figma vision mockup (`library-shell-mockup.png`) and early documentation disagreed, the **Figma mockup wins**:
- **Primary Action Color**: **Dark Evergreen** (`#1e3e2b` in light mode, `#2d5a3f` in dark mode). Used for primary call-to-action buttons (e.g. "New Object +"), active sidebar items, and selected filter chips.
- **Pale Sky**: Dedicated to links, active focus rings, and secondary interactive states.
- **Baghdad Amber**: The warm accent for bookmarks, Quranic ayah markers, active search highlights, and streak badges.
- **Parchment Canvas Base**: Light mode remains Warm Beige Parchment (`#efece4`) with Cream Paper cards (`#f8f6f0`) and elevated pure white cards (`#ffffff`).
- **Scholar Night Base**: Dark mode remains Deep Night Blue-Black (`#0e161b`) with Scholar Dark surfaces (`#141f26`) and raised surfaces (`#1c2a33`).

---

## 2. Semantic Color System & Tokens

The application uses unified semantic design tokens mapped across both light and dark themes in `globals.css` and `tailwind.config.ts`.

### 🎨 Semantic Tokens Table

| Token | Light Mode (Warm Parchment) | Dark Mode (Scholar Night) | WCAG Contrast Ratio (AA / AAA) | Role & Usage |
| :--- | :--- | :--- | :--- | :--- |
| `canvas` | `#efece4` | `#0e161b` | Canvas base | App background canvas |
| `surface` | `#f8f6f0` | `#141f26` | Surface cards | Default cards, panels, drawers |
| `surface-raised` | `#ffffff` | `#1c2a33` | Elevated cards | Elevated cards, floating popovers, modals |
| `border` | `#dcd4c3` | `#223440` | Subtle dividers | Dividers, card borders, input borders |
| `text` | `#2c221a` | `#efece4` | **13.17:1** (L) / **15.48:1** (D) [AAA] | Primary body text and headers |
| `text-muted` | `#6e5e4f` | `#95a8b5` | **5.75:1** (L) / **6.82:1** (D) [AA+] | Subtitles, secondary metadata, placeholders |
| `primary` | `#1e3e2b` | `#2d5a3f` | **11.80:1** (L) / **7.94:1** (D) [AAA] | Primary buttons ("New Object +"), selected chips |
| `primary-contrast` | `#ffffff` | `#ffffff` | High contrast | Text on primary backgrounds |
| `accent` | `#b45309` | `#fbbf24` | **4.65:1** (L) / **10.03:1** (D) [AA/AAA] | Baghdad Amber accent, badges, ayah marks |
| `success` | `#166534` | `#4ade80` | **6.60:1** (L) / **9.61:1** (D) [AAA] | Success notices, verified badges |
| `warning` | `#92400e` | `#fbbf24` | **6.80:1** (L) / **10.20:1** (D) [AAA] | Warnings, quota thresholds |
| `danger` | `#991b1b` | `#f87171` | **7.69:1** (L) / **6.06:1** (D) [AAA/AA] | Destructive actions, delete buttons |
| `focus` | `#2a576f` | `#6ba7c7` | **7.22:1** (L) / **6.36:1** (D) [AAA/AA] | Pale Sky focus rings and hyperlinks |

All text foreground-to-background combinations meet or exceed **WCAG 2.1 AA** (4.5:1 for normal text, 3:1 for large text / UI boundaries) and reach **WCAG AAA** for core reading text.

---

## 3. Typography Strategy: Three-Tier Operational Separation

1. **Reem Kufi (`font-display` / `var(--font-reem-kufi)`)**:
   - Modern, elegant geometric Kufic script.
   - Used for main book titles, section dividers, dashboard headers, and brand elements.
2. **Tajawal (`font-sans` / `var(--font-tajawal)`)**:
   - Clean, geometric modern sans-serif.
   - Used for all **UI interface elements**: sidebars, button labels, settings, metadata tags, tree views, table columns.
3. **Amiri (`font-serif` / `font-reading` / `var(--font-amiri)`)**:
   - Classical Naskh script.
   - Used for long-form reading, Quranic text, Hadith citations, Tafsir excerpts, and note bodies.

---

## 4. Shared UI Primitives (`src/renderer/components/ui/`)

All shared primitives are located under `src/renderer/components/ui/` and exported via `src/renderer/components/ui/index.ts`. They strictly use CSS logical properties (`start`, `end`, `margin-inline`, `padding-inline`) to support both **Arabic RTL** and **English LTR** with zero layout breakage.

### 1. `Button` & `IconButton`
```tsx
import { Button, IconButton } from '@/components/ui';
import { Plus, Trash2 } from 'lucide-react';

// Variants: 'primary' (Dark Evergreen), 'secondary', 'ghost', 'danger'
// Sizes: 'sm', 'md'
<Button variant="primary" icon={<Plus className="size-4" />} onClick={handleCreate}>
  كائن جديد +
</Button>

// Loading button with spinner and aria-busy:
<Button variant="secondary" loading={isLoading}>
  حفظ
</Button>

// Accessible IconButton requiring a descriptive label:
<IconButton label="حذف الملاحظة" variant="danger" size="sm" onClick={handleDelete}>
  <Trash2 className="size-4" />
</IconButton>
```

### 2. `Chip`
```tsx
import { Chip } from '@/components/ui';

// Selectable chip (active evergreen per D1):
<Chip label="الفقه الإسلامي" selected={isSelected} onSelect={() => setIsSelected(!isSelected)} />

// Removable filter chip:
<Chip label="تفسير ابن كثير" removable onRemove={() => removeFilter('tafsir')} />
```

### 3. `Badge`
```tsx
import { Badge } from '@/components/ui';

// Variants: 'default', 'primary', 'accent', 'success', 'warning', 'danger', 'outline'
<Badge variant="primary">جديد</Badge>
<Badge variant="accent">نسخة ورقية</Badge>
```

### 4. `Card`
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui';

<Card variant="raised">
  <CardHeader>
    <CardTitle>مقدمة ابن خلدون</CardTitle>
    <CardDescription>عبد الرحمن بن محمد بن خلدون</CardDescription>
  </CardHeader>
  <CardContent>
    <p>نص الملاحظة أو محتوى البطاقة...</p>
  </CardContent>
  <CardFooter>
    <Badge variant="default">تاريخ</Badge>
    <Button size="sm" variant="ghost">قراءة</Button>
  </CardFooter>
</Card>
```

### 5. `Modal` & `Sheet`
Accessible dialogs featuring focus trapping, Escape key closing, opener focus restoration, and `aria-modal="true"`.
```tsx
import { Modal, Sheet } from '@/components/ui';

<Modal open={isOpen} onClose={() => setIsOpen(false)} title="إضافة بطاقة" description="سؤال المراجعة">
  <form>{/* Focusable elements */}</form>
</Modal>

<Sheet open={isSheetOpen} onClose={() => setIsSheetOpen(false)} side="end" title="تفاصيل المخطوطة">
  <div>{/* Content */}</div>
</Sheet>
```

### 6. `Menu`
Dropdown action menu supporting keyboard arrow keys (ArrowDown, ArrowUp, Home, End, Esc, Enter).
```tsx
import { Menu } from '@/components/ui';

<Menu
  trigger={({ onClick, ref }) => (
    <Button ref={ref} onClick={onClick}>خيارات المستند</Button>
  )}
  items={[
    { label: 'تعديل', onClick: handleEdit },
    { label: 'حذف', danger: true, onClick: handleDelete },
  ]}
/>
```

### 7. `Tabs` & `TabPanel`
Tabs with roving tabindex (`tabIndex={isSelected ? 0 : -1}`), directional arrow navigation (ArrowLeft/ArrowRight mirrored in RTL), and Home/End support.
```tsx
import { Tabs, TabPanel } from '@/components/ui';

<Tabs
  tabs={[
    { id: 'contents', label: 'الفهرس' },
    { id: 'bookmarks', label: 'العلامات' },
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
<TabPanel tabId="contents" activeTab={activeTab}>
  {/* Contents */}
</TabPanel>
```

### 8. `Toast` & `ToastProvider`
Live-region toast notifications with auto-dismiss timers, pause on hover, and 1-click Undo actions.
```tsx
import { ToastProvider, useToast } from '@/components/ui';

const { showToast } = useToast();

showToast({
  message: 'تم حذف الملاحظة بنجاح',
  type: 'danger',
  action: {
    label: 'تراجع',
    onClick: handleUndo,
  },
});
```

### 9. `EmptyState`, `Skeleton`, `Tooltip`
```tsx
import { EmptyState, Skeleton, Tooltip } from '@/components/ui';

// Empty State:
<EmptyState
  icon={<Search className="size-6 text-text-muted" />}
  title="لا توجد نتائج"
  description="جرّب تعديل معايير البحث."
  action={<Button size="sm">إعادة تعيين</Button>}
/>

// Skeleton loader:
<Skeleton rounded="md" className="h-6 w-32" />

// Accessible Tooltip (shows on hover/focus, closes on Esc):
<Tooltip content="تنزيل نسخة PDF" side="top">
  <IconButton label="تنزيل"><Download className="size-4" /></IconButton>
</Tooltip>
```
