---
name: dashboard-analytics-designer
description: Expert UI/UX designer and analytics engineer for the Ready-Set-Bag admin and teacher dashboards. Use this whenever the user wants to add, redesign, or restyle anything in admin/dashboard.html, teacher/dashboard.html, their .css files, or reports-analytics.js — new stat cards, charts, graphs, leaderboards, progress bars, report sections, filters, or any new metric/analytics field. Also use whenever the user asks "what analytics should I track", "what should this chart show", "how do I compute X metric", or wants a dashboard visual to "match the theme". Trigger even if the user doesn't say "dashboard" explicitly but is clearly working on admin/teacher reporting screens or sessionResults data.
---

# Dashboard & Analytics Designer — Ready-Set-Bag

You are designing for one specific, already-defined visual system and one specific,
already-defined data pipeline. The job is almost never "invent a new chart" — it's
"place this metric using the existing components and the existing calculation library."
Read this whole file before touching `admin/dashboard.*`, `teacher/dashboard.*`, or
`reports-analytics.js`.

## 1. The theme (do not deviate without being asked)

This is a **dark, retro/8-bit game UI** — not a modern SaaS dashboard. Every visual
decision should read as "pixel game menu," not "Tailwind admin template."

**Fonts** (both dashboards share these):
- `--pixel: 'Press Start 2P', monospace` — ALL labels, titles, buttons, stat values,
  badges. Chunky, small (7–14px), always `letter-spacing: 1–2px`.
- `--mono: 'Share Tech Mono', monospace` — body text, table data, descriptions,
  search boxes. Anything a user reads at length uses this, not the pixel font
  (pixel font is unreadable past a few words).

**Color tokens** (defined in both `admin/dashboard.css` and `teacher/dashboard.css`
`:root` — reuse these variables, never hardcode a new hex):
```
--bg-dark:#1a1a1a  --bg-panel:#333333  --bg-panel2:#222222  --sidebar-bg:#1e1e1e
--accent-blue:#66A3FF  --accent-green:#A1B300  --accent-orange:#FF9A42
--card-blue:#3C7CDD    --card-green:#97A329     --card-orange:#E88630
--accent-red:#c0392b   --accent-yellow:#f39c12
--text-primary:#e8e8e8 --text-secondary:#aaaaaa --text-muted:#666666
```
Stat cards / bars come in exactly three flavors: **blue, green, orange** (occasionally
red for danger/errors). Don't introduce a fourth hue for a new metric — pick the
closest of the three by meaning (blue = neutral/volume, green = good/positive,
orange = attention/warning, red = reserved for errors/danger only).

**Shape language:**
- Thick borders: `3px solid #4D4D4D` on panels/cards, `2px` on smaller elements.
- Hard drop shadow, not a soft blur: `box-shadow: 4px 4px 0px #000` (2px on mobile).
- Square corners almost everywhere (`border-radius` is rare — only modals/toasts/badges
  use small radii like 2-4px). Don't add rounded-corner cards; it breaks the retro feel.
- `.main` (content area) is light (`#e8e8e8`) while sidebar/topbar/panels are dark —
  that light/dark split is intentional, keep new pages inside `.main`.

**Responsive breakpoints already exist** for 320–1440px+ in both CSS files (mobile,
tablet, laptop, desktop, desktop-large, desktop-XL). When adding a new component,
add matching rules in each existing breakpoint block instead of inventing a new
breakpoint scheme.

## 2. How charts/graphs are built here — read before reaching for a library

**There is no charting library in this project (no Chart.js, D3, etc.).** Every
"chart" so far is hand-rolled HTML/CSS:
- **Stat cards** (`.stat-card`, `.home-stat-card`, `.report-stat-card`) — a single
  number + label, colored blue/green/orange.
- **Progress/skill bars** (`.skill-bar-track` + `.skill-bar-fill` with inline `width:%`)
  — used for stage distribution and skill progression. Color-coded red/orange/green.
- **Leaderboard** (`.lb-podium` top-3 + `.lb-row` ranked list) — bars again, not a
  real bar-chart component.

This isn't a limitation to fix — it's the deliberate style, and it fits the retro
theme far better than a JS charting library's default smooth curves, tooltips, and
rounded legends would. **Default to this same hand-rolled div+CSS approach for any
new visual** (another stat card, another skill-bar row, another ranked list).

Only reach for a real charting library if the user specifically needs something
these primitives can't do — a real time-series line chart (e.g. "score trend over
the last 30 days") or a scatter plot. If you do add one, it must be re-skinned hard:
square corners, hard offset shadows (not blur), the palette above, and the pixel
font for axis labels/legends — a default-styled chart will look completely out of
place next to everything else on the page.

## 3. The analytics library already exists — use it, don't reinvent it

`reports-analytics.js` is a **shared, framework-free calculation module** loaded by
both dashboards as `window.RSBAnalytics`. It is the single source of truth for how
every metric is computed, so admin and teacher views never disagree with each other.
**Before writing a `.reduce()`/`.filter()` loop in `admin/dashboard.js` or
`teacher/dashboard.js` to compute something, check whether `RSBAnalytics` already
has it** — and if you're adding a genuinely new metric, add the pure function to
`reports-analytics.js` and export it from `window.RSBAnalytics`, rather than
inlining the math in a dashboard file. That keeps admin/teacher numbers consistent
by construction.

What it already computes, from the `sessionResults` collection (`score` 0-100,
`completionTime` seconds, `attempts`, `stage`, `essentials`/`essentialsMax`,
`errors`, `difficulty`, `createdAt`):

**Averaging rule:** headline averages aggregate **per student**, never per result row —
a student with 3 runs must not count 3×. Each student contributes the mean across
their own runs. This is what keeps `sectionAverages()`, `studentsNeedingSupport()`
and the school-average row agreeing with each other by construction.

| Function | Returns | Formula |
|---|---|---|
| `computeMetrics(results, students, filters)` | avgScore, avgTime, completionRate, playedCount | averages are per student; `completionRate = (students with ≥1 result) / (total students in scope) * 100`. The difficulty filter narrows results but never the roster, so with a specific level selected this reads as "% of the roster who played that level". |
| `sectionAverages(results, students, filters)` | per-section avg + `count` (students) + `needsSupport` | mean of per-student means; `needsSupport = avg < SUPPORT_THRESHOLD (70)` |
| `studentsNeedingSupport(results, filters, threshold=70)` | students below threshold, ascending | per-student avg score across all their runs |
| `leaderboard(results, filters, mode)` | ranked list | `mode === 'time'` → each student's `bestTime` ascending, tiebreak higher score. Otherwise best score desc → fewer errors → faster time. Omitting `mode` keeps the score ranking. |
| `individualRows(results, filters)` | one row per student | sorted by best score desc |
| `stageLabel(stage)` | display string | Cognitive→Beginner, Associative→Intermediate, Autonomous→Advanced, unknown→`—`. **Display only** — the stored `stage` value never changes, and CSV exports keep the raw value. |
| `countUnknownLevel(results)` | count | results whose `difficulty` isn't one of `KNOWN_LEVELS`. Every filter is a specific level now, so these match nothing — surface the count in a table footer rather than letting them vanish. |
| `perStudentBest` (internal) | per student: `bestScore`, `bestTime`, `avgScore`, `avgTime`, `attempts` | `bestTime` is their fastest run ignoring 0/missing times — `normalizeResult` coerces a missing time to `0`, so an unguarded min would rank that student *first* in fastest-time mode |

Note `stageDistribution()` was removed along with the admin Skill Progression panel it fed.
Don't reintroduce it without a consumer.

Every function goes through `normalizeResult()` first (coerces bad/missing fields
to safe numbers via `num()`, defaults `essentialsMax` to 15) and `applyFilters()`
(scopes by section/difficulty, "all"/empty = no filter). **Any new metric you add
should follow the same pattern**: normalize → filter → aggregate → round with the
existing `round(value, decimals)` helper. Don't hand-roll a second normalization
path — inconsistent rounding or missing-field handling between two code paths is
exactly the kind of bug that's invisible until a teacher sees mismatched numbers
between two dashboard pages.

## 4. Design-board alignment — what's already done, what's deliberately not

These came from the project's Excalidraw planning board. **Already implemented** — don't
re-propose them:

- Stage labels display as Beginner/Intermediate/Advanced via `stageLabel()`; data unchanged.
- The "ALL LEVELS" option is gone from both difficulty filters; the default is `beginner`.
  Because `computeMetrics` filters results but not the roster, completion rate and average
  time are therefore already **per level** with no extra code.
- Averages aggregate per student, not per result row.
- Admin HOME "School-Wide Statistics" and teacher HOME cards compute **unfiltered** (`{}`)
  on purpose — they're labelled for the whole school/class, and the Reports dropdowns that
  would otherwise scope them live on a page the viewer can't see. Don't "fix" this by
  passing the filters back in.
- The admin Skill Progression panel is removed (with `setSkillBar` and `stageDistribution`).
- Both Individual Results tables show each student's **fastest** time under a `Best Time`
  header, matching the leaderboard. These must not diverge — two different times for one
  student on one page reads as a bug.

**Deliberately NOT done** — each was considered and rejected; don't add without a new reason:

- **The `Analytics` collection** (`totalScore`, `totalStudents`, `remainingSections`,
  `status`, `totalCompletionTime`). At this school's size these totals compute instantly
  from `sessionResults` + `students` on load. A denormalized aggregate doc means every game
  result must also update it, and a failed second write shows wrong numbers with no error.
  Revisit only when load time is measurably a problem.
- **Any charting library.** Still none in the project.
- **Bulk deletion of the now-dead `.skill-bar-*` CSS** in `admin/dashboard.css` — those
  rules are interleaved with the topbar-logo media queries, so a range delete breaks the
  mobile logo. Dead CSS costs nothing at runtime.
- **The board's literal average formulas.** "All students Scores / Overall Population"
  divides by the whole roster, scoring non-players as 0 — but `completionRate` already
  reports non-players, so that double-counts one fact into the average. Mean-of-per-student-
  means is the defensible reading.

**Unity-side, not ours:** scoring is 20 quiz questions × 5 points (multiples of 5). The
dashboards only read `score`. Two fields are load-bearing: `completionTime` must be seconds
and > 0 (it's a sort key now), and `difficulty` must be one of `KNOWN_LEVELS` or the result
matches no filter — which is what `countUnknownLevel()` exists to surface.

## 5. Deciding what analytics a request actually needs

When the user asks for "a chart" or "some analytics" without specifics, don't
default to generic dashboard clichés (pie charts, donut charts, gauges) — map the
ask to what the data can actually answer well:

- **"How is a section/class doing overall?"** → `sectionAverages` + a stat-card row
  (avg score, completion rate, avg time). Flag sections below 70 with the existing
  `.status-badge.below-threshold` / `.needs-support-item` styles, don't invent a
  new warning pattern.
- **"Who needs help?"** → `studentsNeedingSupport` → `.needs-support-item` list,
  already styled in the admin CSS.
- **"Who's doing best / competition view?"** → `leaderboard` → the existing
  `.lb-podium` + `.lb-row` components in the teacher dashboard.
- **"Who's fastest?"** → `leaderboard(results, filters, 'time')` → the existing
  `#lb-sort` control already switches the teacher leaderboard between score and time.
- **"Trend over time / is this improving?"** → nothing computes this yet. This is
  the one case where a genuine line/time-series chart is justified — bucket
  `sessionResults` by day/week using `createdAt`, average `score` per bucket. Add
  the aggregation to `reports-analytics.js`, not inline in a dashboard file.
- **Anything school-wide across all teachers** → check whether it needs the
  planned `Analytics` collection (section 4) instead of querying all
  `sessionResults` client-side, which won't scale past a handful of teachers.

Always ask "does an existing component/function already answer this?" before
designing something new — most requests map directly onto section 3's table.
