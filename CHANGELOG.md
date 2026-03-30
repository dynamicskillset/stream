# Changelog

## 0.8.0

### Improvements

- **Category navigation arrows** — when you have many categories, left and right arrows now appear at the edges of the filter bar so you can scroll through them without any hidden swiping.
- **Instant velocity "Apply all"** — applying all AI velocity suggestions at once is now immediate, regardless of how many feeds are affected. Previously it could take several seconds with large collections.
- **AI errors now explained** — if a Gemini request fails, you now see a clear message explaining why, with a "Try again" button. Requests also have a two-minute timeout so the app never gets stuck in a permanent loading state.
- **Scroll resets when leaving Settings** — going back to the stream from a long Settings page now takes you to the top, rather than leaving you mid-scroll.
- **Cleaner Settings header** — removed a stray double border that appeared above the first section.

### Accessibility

A thorough accessibility and quality sweep:

- Error messages are now shown in red rather than the orange used for saved items — the colours now mean what they should.
- Screen readers no longer announce article preview text as a separate action from the title (they open the same thing).
- The search input icon now adapts to light and dark themes instead of being a fixed grey.
- Tap targets on small buttons — category arrows, action buttons in Settings, "Apply" and "Dismiss" on suggestions, the back button in the reading view, and the keyboard shortcut close button — have all been expanded to at least 44px.
- Native browser controls (range sliders, selects, scrollbars) now follow Stream's light/dark theme rather than defaulting to the OS setting.
- Pressing Escape to close the reading view or keyboard shortcuts panel now returns focus to the element you were on, rather than losing your place on the page.
- The Settings page now has a proper top-level heading for screen readers; the main stream view also has a visually-hidden heading.
- The category filter strip is now correctly identified as navigation for screen readers and browser tools.

## 0.7.1

### Features

- **AI velocity suggestions** — new "Suggest velocity" button in the AI assistant section. Gemini analyses your category names and feed titles and recommends velocity tiers for each category. Apply updates all feeds in that category at once; an inline undo bar lets you revert immediately.

### Improvements

- **Settings section icons** — each section heading now has a small icon to its left (feeds, display, AI, velocity, muted, export/import) for faster visual scanning.
- **Filter bar overflow** — a fade gradient on the right edge of the category pill row now signals that more pills are off-screen when there are many categories.
- **Font size floors** — section headings and subheadings now have minimum pixel sizes (`max()`) so they stay readable at the "small" text size setting.
- **Favicon fallback** — replaced hardcoded `9px` with a relative unit so the fallback initials scale with the text size setting.

### Bug fixes

- Removed debug `console.debug` calls left in from AI diagnostics.

## 0.7.0

### Features

- **AI assistant** — optional Google Gemini integration in Settings. Add your free API key to get category suggestions for uncategorised feeds and discover new feeds based on your subscriptions. Your key stays in the browser; only feed titles and URLs are sent to Google.

### Bug fixes

- **Deleted feed articles** — articles from a deleted feed are now removed from the stream immediately upon deletion, rather than persisting in memory for the rest of the session. (#23)
- **Category badges** — removed unread article counts from category filter pills.

## 0.6.0

### Features

- **Dismiss persistence** — dismissed articles now survive page reloads. Stored in localStorage with a 14-day expiry. Undo still works correctly. (#14)
- **Delete feeds** — remove feeds from Settings with an inline confirmation dialog (Remove? Yes / Cancel). (#19)
- **Featured images** — article thumbnails extracted from content HTML and FreshRSS enclosures, displayed as 72px thumbnails in river cards. (#4)
- **Auto-expiry** — new Display setting to hard-remove articles older than 1 day / 3 days / 1 week / 2 weeks / 30 days. Saved articles are exempt. (#16)
- **Category filter** — filter bar now only shows categories with unread articles, with count badges. (#15)
- **Pinned tier** — pin a source so its articles never fade (score stays at 1). Toggle via the diamond icon in Settings; velocity slider hides when pinned. (#17)

### Improvements

- **Mobile settings** — feed rows wrap at 600px so names are always readable. (#20)
- **Proxy cache headers** — Netlify proxy now forwards cache-control, etag, and last-modified headers. (#21)

### Accessibility and performance

- Removed `outline: none` overrides so global focus-visible works on all inputs and selects.
- Darkened light theme accent (#5E81AC to #4C7199) for WCAG AA contrast (4.6:1).
- Expanded touch targets on swatch, pin, and delete buttons.
- Added ARIA tab panel linkage to the connect screen.
- Replaced `[state]` useCallback dependencies with stateRef pattern (prevents unnecessary re-renders).
- Wrapped `savedIds` and `unreadByCategory` in `useMemo`.
- Removed unused `idb` dependency.
- Score timer pauses when tab is hidden.
- Responsive source name sizing, toast overflow protection, lazy favicons.

## 0.5.2

### Accessibility and polish

- **Velocity slider** — replaced discrete tier buttons (3h / 12h / 24h / 72h / 7d) with a draggable range slider. Endpoint labels "6 hours" / "1 week" are always visible; intermediate tick labels (12h / 24h / 72h) appear above the thumb on hover and hide at rest, positioned at the visual quarter-points of the track. Mixed-tier category rows show a dimmed thumb.
- **Touch targets** — action buttons on cards, header buttons, and filter bar pills all meet WCAG 2.5.5 minimum tap sizes (36–44px).
- **Semantic HTML** — article preview text is now a `<button>` element, accessible to keyboard and screen reader users.
- **Card age bar** — migrated from `border-left-width` animation (layout reflow) to a `::before` pseudo-element using `transform: scaleX` (compositor-only, no reflow).
- **New category input** — replaced `window.prompt()` with an inline text field that appears in place of the category dropdown. Confirm with Enter, cancel with Escape or clicking away.
- **Pause banner** — SVG pause icon replaces emoji for consistent cross-platform rendering.
- **Settings rows** — more vertical breathing room in the Velocity and Sources sections.

## 0.5.0

### River control

- **Source muting** — mute any source directly from a card for 1 day, 1 week, or 1 month. The source's articles vanish from the river and return automatically when the mute expires. A "Muted sources" section in Settings lists active mutes and allows early unmuting.
- **River pause** — a ⏸ button in the header freezes the decay clock. While paused, articles do not fade further. Resuming picks up exactly where the clock left off; time spent paused does not count against article ages.

### Velocity intelligence

- **Auto-velocity suggestions** — Stream observes which articles you open and, after enough data accumulates, surfaces advisory suggestions in the Velocity settings section. High-engagement sources on fast tiers get a "slow down" nudge; unread sources on slow tiers get a "speed up" nudge. Each suggestion can be applied immediately or dismissed for 30 days.

### Portability

- **Settings export and import** — export your velocity tiers, display preferences, and muted sources as a dated JSON file. Import on another device or browser to restore your configuration. Connection credentials and ephemeral state are intentionally excluded from the export.

## 0.4.2

### Reading experience

- **Estimated reading time** — article cards and the reading view now show a reading time estimate (e.g. "4 min"), calculated from word count. Only shown for articles with enough content (50+ words).
- **Open original shortcut** — press `b` in the river to open the focused article's original URL in a new tab, without entering the reading view first.
- **Share / copy link** — share button (↑) on article cards and in the reading view. Uses the native share sheet where available; falls back to copying the link to the clipboard with a brief ✓ confirmation. Also available as the `c` keyboard shortcut.
- **Reading progress bookmark** — scroll position in the reading view is saved automatically as you read. If you reopen an article you were partway through, it quietly returns you to where you left off. Saved positions expire after 7 days.

## 0.4.0

Consolidates 0.3.0 and 0.3.1 into a single release to align app and landing page versioning.

### Settings panel
- Collapsible sections: Add feeds, Display, Velocity (with separators)
- **Text size** control (small, default, large)
- **Highlight colour** picker: Frost, Yellow, Green, Berry (Nord palette)
- **Fade intensity** control (none, subtle, full)
- Settings footer with product page link and AGPL-3.0 licence (GitHub logo)
- All display preferences persist to localStorage

### Header
- Version number displayed next to the Stream logo (from package.json)
- Stable layout: no logo shift between stream and settings views

### Accessibility
- WCAG AA contrast for accent colours on light theme
- `aria-pressed` on all category filter buttons
- `focus-visible` outline on ConnectScreen form inputs
- `<main>` landmark wrapping page content
- Focus trapping in ReadingView and KeyboardHelp dialogs
- Scoped `kbd` styles

### Security and performance
- HTML sanitiser strips `javascript:` protocol from href/src/action
- Article body images use `loading="lazy"`

### Code quality
- Renamed VelocitySettings to Settings (component, files, interface)
- Extracted shared `displayPrefs.ts` module
- Removed unused `articleTitle` prop from UndoToast
- Fade intensity driven by `--fade-max` CSS custom property

### Landing page (gh-pages)
- Social media preview image (1200x630, Nord dark theme)
- Open Graph and Twitter Card meta tags

## 0.3.0

### Settings panel
- Renamed "Velocity" menu to "Settings" with collapsible sections: Add feeds, Display, Velocity
- Added **text size** control (small, default, large)
- Added **fade intensity** control (none, subtle, full)
- Added **highlight colour** picker with four Nord palette options (Frost, Yellow, Green, Berry)
- All display preferences persist to localStorage and apply on load
- Section separators for visual clarity

### Accessibility
- Darkened yellow, green, and berry accent colours on light theme for WCAG AA contrast
- Added `aria-pressed` to all category filter buttons
- Added visible `focus-visible` outline on ConnectScreen form inputs
- Added `<main>` landmark wrapping page content
- Focus trapping in ReadingView and KeyboardHelp dialogs
- Scoped `kbd` styles to avoid global leak

### Security
- HTML sanitiser now strips `javascript:` protocol from `href`, `src`, and `action` attributes

### Performance
- Article body images now use `loading="lazy"`

### Code quality
- Renamed VelocitySettings to Settings (component, files, interface)
- Extracted shared `displayPrefs.ts` module (removes duplication between App and Settings)
- Removed unused `articleTitle` prop from UndoToast
- Fade intensity now driven by `--fade-max` CSS custom property instead of hardcoded value

## 0.2.0

### Features
- Skip login screen when credentials are already saved
- Use "stream" language throughout UI instead of "river"
- Saved items display at full opacity in the saved view (no velocity fading)

### Fixes
- Empty body on GET requests no longer causes 502 in Netlify proxy (Node.js 18+)
- Explicit Netlify build base to override UI setting
- Feedbin adapter routes all requests through proxy
- README credentials privacy note; corrected CORS claim

## 0.1.0

Initial release: velocity-based RSS reader with FreshRSS and Feedbin support.
