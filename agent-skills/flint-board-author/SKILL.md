---
name: flint-board-author
description: "Use when: several Flint charts should be read together in one view: a dashboard, KPI tiles over a trend, a side-by-side comparison, an overview with its detail; or a board on screen should change (add, retitle, resize, reconnect a chart). Produce one board spec whose headline, chart choice, layout and connected fields are decided, check and refine it with validate_board, then put it on screen once with show."
---

# flint-board: several charts, one view

A board holds several Flint charts under one headline. The agent writes it as
one board spec, checks it with `validate_board`, which draws nothing, and puts
it on screen with `show({ "board": … })`, which opens a new card below the
conversation's latest message. The server keeps nothing between calls: the spec
in the conversation is the board. So call `show` once a turn, after the board
is right; to change it later, change the spec and call `show` again.

Each chart on a board is a full chart spec (`flint-chart-author`), plus an
`id` and a `layout`. This skill covers what a board adds: the headline, which
charts, where they sit, how they connect, and how they look as one piece.

Work through the steps in order. A board is ready to show when its latest
report shows no `✗` and its `Review:` section is empty or says only that a
colour field is shared.

## Step 1 — write the headline

The board's `title` is what the reader takes away, or what the board is for,
in one line. Its `subtitle` is the deck: the data, its scope, period and
units. `source` is the footer: where the data comes from and when.

```
title:    "Europe carried the third-quarter recovery"
subtitle: "Monthly revenue by region and product line, Jan–Sep 2025, $m"
source:   "Source: finance ledger, closed books to 30 Sep 2025"
```

A monitoring board with no single finding names its purpose instead:
`"Operations at a glance"`. The card draws the title largest, so it is the
first thing read; every board gets one.

## Step 2 — choose the charts

Start from the questions the reader brings, one chart per question, and keep
the board to the charts that answer them: three to five KPI tiles and up to
six charts. More than that is two boards.

| The reader asks | Chart |
|---|---|
| How are we doing on the numbers we steer by? | `KPI Card` per number, with `goal` when there is a target |
| How did it move over time? | `Line Chart` (few series), `Area Chart` (parts of a total) |
| Which is largest, how do they rank? | `Bar Chart` sorted by value, `Bar Table` for many rows with labels |
| Which records are behind it? | `Table`: the rows as given, one column per field, `encodings: {}` |
| What is it made of? | `Stacked Bar Chart`, or `Pie Chart` with `innerRadius` for up to five parts |
| How do two measures relate? | `Scatter Plot` |
| Where? | `Choropleth`, `Map` |
| How is it spread? | `Histogram`, `Boxplot` |
| Each series' trend at a glance | `Sparkline` |

Pick the lead chart, the one the headline is about, and put it first after the
KPI tiles. The charts after it explain it: a breakdown, a ranking, a relation.

Give each chart its own data, aggregated to what it draws: a bar, a slice or
a cell is one row. Rows that repeat a category (monthly rows under a by-product
bar) draw as a stack of thin slices; sum them first, or set the measure's
`aggregate: "sum"`. A KPI tile takes
one row: `{ metric, value, goal }`. It draws progress only when `value` and
`goal` are both numbers. Pass raw numbers and declare the value field's unit
in `semantic_types`: the tile prints `{ "semanticType": "Amount", "unit": "USD" }`
as `$1.18M`, a `Percentage` of 0.378 as `37.8%`, and compacts amounts and
counts from 10,000 up. A value already scaled says so in `metric`
(`"Revenue, $m"`) and is not compacted again. A string `value` prints as given.

## Step 3 — give each chart a heading

Each chart draws its own `title` and `subtitle` in its theme, as on its own
card. Write the title as the chart's finding, one line at half width (a
wrapped title pushes its plot down), and the subtitle as its units:

```
title:    "Europe climbed every month after the April dip"
subtitle: "Revenue by region, $m"
```

A `KPI Card` names itself with its `metric` field and needs no title.

## Step 4 — place them

The board is a grid of `columns` (default 2 once it has two charts that are
not KPI tiles). Charts fill rows in the order given:

- **KPI Cards in a row** share one row, up to four; a short row spreads its tiles.
- **`layout.span`** is how many columns a chart takes. Time series, maps and
  Gantt charts take the full row by default; everything else takes one column.
  A row left short stretches to the full width.
- **`layout.height`** is `compact` (~130 px), `standard` (~280 px, the default)
  or `tall` (~420 px). A row takes its tallest chart's height, so the plots of
  a row line up. A time series alone in its row defaults to `tall`: Flint
  banks a line toward readable slopes, and the height is what lets it spread
  across the width.

| Shape | Layout |
|---|---|
| KPI row, lead trend, two explaining charts | tiles; trend (full row); two charts (one column each) |
| Side-by-side comparison | `columns: 2`, both charts `span: 1`, same height |
| Overview with its detail | detail `span: 2, height: tall`; overview strip below it `height: compact` |
| Many small series | one `Sparkline` chart, `height: compact` or `standard` |

On a narrow card each chart takes its own row; the layout needs no second version.

**`view: "table"`** on a chart opens its cell on the table of the rows the chart
draws; the reader can switch it back. Use it when the numbers matter more than
the shape.
A `Table` is a table either way.

## Step 5 — connect them

Connect the charts by the fields they share, not chart by chart:

```json
"link_spec": { "fields": ["product", "region"] }
```

The board holds one selection that every chart shares, a part per field: a
click on Asia sets `region` to Asia, a brush over March to June then adds
`month` from March to June, and every chart shows the marks that meet both
parts on the fields it carries; a chart that carries neither stays as drawn.
A new selection on a field the board already holds replaces that part. A click
on nothing in any chart, Escape, or the selection chip under the headline
clears the whole selection everywhere.

What a selection sets comes from the interaction that made it: a click on a
mark sets every connected field the mark carries, a series or group focus its
group field, a brush its axis field as a range, an axis highlight that axis's
field. A hover interaction (`hover-group-focus`, or `axis-highlight` with
`event: "hover"`) previews its part over the selection for as long as the
pointer stays.

Connect on the fields the reader thinks in: categories with about a dozen
values or fewer, and the dimension the board is about. A chart takes part as
far as it can:

- **It receives a field** when its marks carry it. Marks carry the fields the
  chart encodes; when a chart shows the field nowhere else, encode it on
  `detail` (`encodings.detail: "product"`).
- **It sends** when it also has an interaction that selects, in its
  `interaction_spec`; pick the one whose subject is what the reader will ask
  about:

  | Chart | Interaction |
  |---|---|
  | Bar, Stacked Bar, Pie, Heatmap | `click-highlight` |
  | Line | `click-group-focus` (a series), `brush-x` (a period), `hover-group-focus` (a series, on hover) |
  | Scatter Plot | `select` (drag a region) |

- **`charts`** sets a chart apart: `{ "trend": { "receive": false } }` keeps an
  overview as drawn while it still sends; `send: false` keeps a chart's own
  selections to itself.

The report's `Links:` section says what each chart sends and receives, and
why a field is left out.

Colour does the quiet linking: charts that colour by the same field (on
`color`, or `group` on a grouped bar chart) get one value order, so a value
keeps one colour across the board. Colour each chart
by the same field as the others when it shows the same categories, and give
it the same set of values, since a chart missing a value shifts the colours
after it.

## Step 6 — theme the board once

Set `theme_spec` on the board, not on the charts. Every chart takes it and
draws its own furniture (the Economist's red tab); the board's headline and
footer take its paper, ink and fonts, with the furniture above the headline.
Pick it with `list_themes` as for one chart.

## Step 7 — read the report and refine

`validate_board` returns the board as the model must judge it, and `show`
returns the same report:

- `Layout:` the rows as the card draws them. Check that the lead chart sits
  where the headline points and no row holds an orphan.
- `## <id>` per chart: its encodings and each update op, `✓` or `✗`.
- `Links:` what each chart sends and receives, `✓`, or `✗` when it joins no field, with the fix.
- `Review:` what the board should still fix: a missing headline, deck or chart
  title, too many tiles or charts, themes set per chart.

Fix each `✗` and each review note in the spec, check it again if the fix was
large, then call `show` once with the same spec. A chart with errors is left
off the report's board, and `show` draws nothing until every chart is valid.

What the reader then does on the card reaches the model with their next
message: selections and link emphasis, one section per chart. The reader's
changes live on that card only, and the context says how to keep each one in
the next `show`:

- **A theme** picked in the bar applies to every chart. To keep it, pass that
  `theme_spec` on the board and leave it out of the charts.
- **An arrangement** made with **Edit layout** (moving, swapping, resizing
  charts on a 12-column grid). To keep it, pass the `grid` the context gives.
  `Layout:` then reads "Arranged on a 12-column grid". A chart added to the
  spec takes a place below the rest and a chart left out drops its place;
  leave `grid` out to lay the board out in rows again, only when the user asks
  for a new layout.

Leave out what the user asked to change, and keep the rest: a `show` without
them gives the reader back the agent's theme and rows.

## Worked example

The board spec, passed as it is to `validate_board`, then as `board` to `show`:

```json
{
  "title": "Europe carried the third-quarter recovery",
  "subtitle": "Monthly revenue by region and product line, Jan–Sep 2025, $m",
  "source": "Source: finance ledger, closed books to 30 Sep 2025",
  "theme_spec": "economist",
  "charts": [
    { "id": "k-revenue", "data": { "values": [{ "metric": "Revenue, Q3 ($m)", "value": 38.6, "goal": 36 }] },
      "chart_spec": { "chartType": "KPI Card", "encodings": { "metric": "metric", "value": "value", "goal": "goal" } } },
    { "id": "k-margin", "data": { "values": [{ "metric": "Gross margin, %", "value": 37, "goal": 40 }] },
      "chart_spec": { "chartType": "KPI Card", "encodings": { "metric": "metric", "value": "value", "goal": "goal" } } },
    { "id": "trend", "data": { "url": "./flint-data/revenue-by-month.csv" },
      "semantic_types": { "month": "YearMonth", "region": "Category", "revenue": "Amount" },
      "chart_spec": { "chartType": "Line Chart", "title": "Europe climbed every month after the April dip",
        "subtitle": "Revenue by region, $m", "encodings": { "x": "month", "y": "revenue", "color": "region" } },
      "interaction_spec": { "interactions": [{ "type": "click-group-focus" }] } },
    { "id": "by-product", "data": { "url": "./flint-data/revenue-by-product.csv" },
      "semantic_types": { "product": "Category", "region": "Category", "revenue": "Amount" },
      "chart_spec": { "chartType": "Bar Chart", "title": "Analytics leads in every region",
        "subtitle": "Revenue by product, Jan–Sep, $m", "encodings": { "y": "product", "x": "revenue", "color": "region" } },
      "interaction_spec": { "interactions": [{ "type": "click-highlight" }] } },
    { "id": "margin", "data": { "url": "./flint-data/revenue-by-product.csv" },
      "semantic_types": { "product": "Category", "region": "Category", "revenue": "Amount", "margin": "Percentage" },
      "chart_spec": { "chartType": "Scatter Plot", "title": "Security earns the widest margin",
        "subtitle": "Revenue vs gross margin, by product and region",
        "encodings": { "x": "revenue", "y": "margin", "color": "region", "detail": "product" } } }
  ],
  "link_spec": { "fields": ["product", "region"] }
}
```

Rows: two KPI tiles; the trend across the row, tall; the bar chart and the
scatter side by side. A click on one segment of a product's bar lights that
product's points on the scatter and the segment's region on the trend; a click
on a region's line lights that region on the bars and the scatter.

## Checklist

- [ ] `title` says the finding or the purpose; `subtitle` says data, scope, period, units; `source` is set.
- [ ] Three to five KPI tiles at most, up to six charts, the lead chart first after the tiles.
- [ ] Every chart but a KPI tile has a one-line `title` and a units `subtitle`.
- [ ] `layout` set where the default is wrong: the lead chart wide, a comparison at equal spans and heights.
- [ ] `link_spec.fields` names the shared dimensions; each chart that should take part encodes them and, to send, has the interaction whose subject the reader asks about.
- [ ] `theme_spec` on the board only.
- [ ] `validate_board` reports no `✗` and no review note left but the shared colour field.
- [ ] In a later turn: the reader's theme and `grid` from the context are kept unless the user asked to change them.
