import type { ReactNode } from 'react';
import type { ChartAssemblyInput, ThemeSpec } from 'flint-chart';
import { THEME_PRESETS } from 'flint-chart';
import { SizingPlayground } from '../components/SizingPlayground';
import { ThemeExplorer } from './ThemeExplorer';
import { WorldCupScorersDemo } from '../playground/WorldCupScorersDemo';
import { CountryTableStage } from '../playground/ExternalToChartLab';
import { GlobeWarmingStage } from '../playground/GlobeWarmingStage';
import { RetailDrilldownStage } from '../playground/RetailDrilldownStage';
import { YouDrawItStage } from '../playground/YouDrawItStage';
import { ArticleSection } from '../playground/InteractiveDataReportLab';
import { TIME_USE } from '../playground/interactive-data-report-content';
import { InteractionDashboardLab } from '../playground/InteractionDashboardLab';
import {
  FLINT_BASE, LONG_ROWS, TYPES_FLINT, typesCompiled, CARS, flintInput, flintShown, linkedYears, PICKED_GAME, PICKED_ROWS, STEPS, VL, foodLines, gameBars, heatmap, lineByType,
  penguins, picked, withData, type FlintState,
} from './data';
import {
  Chart, Code, Demo, FitTable, Stable, MINIMAPS, Minimap, Sketch, VegaLite, fullLayout, lineDiff, plainLayout, specLayout, stepLayout, textRows,
  type CodeRow, type CodeSource,
} from './parts';
import glue from './specs/vl-final-glue.txt?raw';

export interface SlideDef { id: string; kind?: 'title' | 'section' | 'statement'; render: () => ReactNode }

const UPDATE_PROMPTS: Record<string, string> = {
  dense: 'Show all 24 games.',
  theme: 'Restyle this chart to match our new brand theme.',
  brush: 'Let me brush a range of months instead of clicking a game.',
  facet: 'Split this chart into a separate panel for each region.',
};

const fmt = (n: number) => n.toLocaleString('en-US', { signDisplay: 'always' });
const Cell = ({ caption, children, framed }: { caption?: string; children: ReactNode; framed?: boolean }) => (
  <div className="talk-cell">
    <div className={framed ? 'talk-fit talk-framed' : 'talk-fit'} style={{ display: 'flex' }}>{children}</div>
    {caption && <p className="talk-caption">{caption}</p>}
  </div>
);

/** One step of the traditional way: the code and chart before, then the code and chart after. */
const Step = ({ before, beforeSpec, after, afterSpec, note }: { before: CodeSource; beforeSpec: unknown; after: CodeSource; afterSpec: unknown; note?: ReactNode }) => (<>
  <div className="talk-body talk-step">
    <div className="talk-col"><Code rows={before} tone="vl" /><VegaLite spec={beforeSpec} /></div>
    <div className="talk-arrow">→</div>
    <div className="talk-col"><Code rows={after} tone="vl" /><VegaLite spec={afterSpec} /></div>
  </div>
  {note && <p className="talk-note">{note}</p>}
</>);

// Each step's code: the new spec with what changed in red. The next slide starts from it, in black.
const ROWS = {
  raw: stepLayout(STEPS.raw),
  parse: stepLayout(STEPS.parse, STEPS.raw),
  layout: stepLayout(STEPS.layout, STEPS.parse),
  theme: stepLayout(STEPS.theme, STEPS.layout),
  final: stepLayout(STEPS.final, STEPS.theme),
};
const DIFF = {
  parse: lineDiff(STEPS.raw, STEPS.parse),
  layout: lineDiff(STEPS.parse, STEPS.layout),
  theme: lineDiff(STEPS.layout, STEPS.theme, 72),
  final: lineDiff(STEPS.theme, STEPS.final, 72),
};
const GLUE_LINES = glue.trimEnd().split('\n').length;

/** A playful theme an agent might write from a one-line prompt; the slide shows this exact object. */
const FUN_THEME = {
  extends: 'cartoon',
  id: 'theme-park',
  label: 'Theme park',
  ink: {
    surface: { source: 'house', canvas: '#fdf6ff', plot: '#fdf6ff' },
    series: { categorical: ['#ff6fb5', '#4cb8ff', '#ffc93c', '#9b6cff', '#38d39f', '#ff8a5c'] },
    accent: '#ff6fb5',
  },
  type: { headline: { family: "'Chalkboard SE', 'Comic Neue', cursive", weight: 'bold' } },
  marks: { cornerRadius: 12, strokeWeight: 5 },
} as unknown as ThemeSpec;

const PRESETS: { caption: string; spec: ChartAssemblyInput }[] = [
  { caption: 'Click a bar to highlight it.', spec: gameBars(8, { interaction_spec: { interactions: [{ type: 'click-highlight' }] } } as Partial<ChartAssemblyInput>) },
  { caption: 'Brush a range of months.', spec: lineByType({ interaction_spec: { interactions: [{ type: 'brush-x' }] } } as Partial<ChartAssemblyInput>) },
  { caption: 'Lasso a group of penguins.', spec: penguins([{ type: 'lasso-select' }]) },
  { caption: 'Hover to read both prices at any month.', spec: foodLines([{ type: 'inspect-index', options: { show: 'all' } }]) },
  { caption: 'Click the legend to hide a series.', spec: lineByType({ interaction_spec: { interactions: [{ type: 'legend-toggle' }] } } as Partial<ChartAssemblyInput>) },
  { caption: 'Drag a box to zoom in.', spec: penguins([{ type: 'brush-zoom' }]) },
];

const TLDR_SPEC = `{
  "data": { "values": [...] },
  "semantic_types": {
    "Month": "Date",
    "Price": "Currency",
    "Food": "Category"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": "Month", "y": "Price", "color": "Food"
    }
  },
  "theme_spec": "economist",
  "interaction_spec": {
    "interactions": [{ "type": "inspect-index" }]
  }
}`;

// After the Flint version: one request at a time, each starting where the last one left off.
const FLINT_W = 52;

/** The "draw your guess" demo's interaction, condensed: a trigger, and a handler that answers with an update. */
const BESPOKE_ROWS: CodeRow[] = [
  { text: 'const draw: CanvasInteractionDef = {', hot: true },
  { text: '  id: "draw-guess",' },
  { text: '  eventSource: lassoTrigger("contain"),', hot: true },
  { text: '  affordances: { plot: { cursor: "draw" } },' },
  { text: '  handle(event) {', hot: true },
  { text: '    // the stroke arrives in data units, not pixels', gap: true },
  { text: '    const points = event.geometry.domain.points;' },
  { text: '    const guess = extendPath(drawn, points);' },
  { text: '    if (isComplete(guess)) reveal();' },
  { text: '    // answer with an update: an overlay', gap: true },
  { text: '    return { ops: [', hot: true },
  { text: '      { op: "set-overlay",', hot: true },
  { text: '        name: "guess", value: guess },', hot: true },
  { text: '    ] };', hot: true },
  { text: '  },' },
  { text: '};' },
  { text: '' },
  { text: '<FlintChart spec={coalShare}' },
  { text: '  interactions={[draw, reveal]} />' },
];

/** The World Cup demo's own wiring, condensed: the chart says what was clicked, the page does the rest. */
const APP_ROWS: CodeRow[] = [
  { text: 'const spec = {' },
  { text: '  data,' },
  { text: '  semantic_types: {' },
  { text: '    Team: "Category", Goals: "Count" },' },
  { text: '  chart_spec: { chartType: "Bar Chart",' },
  { text: '    encodings: { x: "Goals", y: "Team" } },' },
  { text: '  interaction_spec: { interactions: [' },
  { text: '    { type: "click-highlight", id: "team" }', hot: true },
  { text: '  ] },' },
  { text: '};' },
  { text: '' },
  { text: '<FlintChart', hot: true },
  { text: '  spec={spec}', hot: true },
  { text: '  onChange={(c) => setTeam(pinnedTeam(c))}', hot: true },
  { text: '/>', hot: true },
  { text: '<ScorerList team={team} />' },
];

/** The semantic types Flint knows, from its type registry, grouped as the registry groups them. */
const SEMANTIC_TYPES: [string, string][] = [
  ['Points in time', 'DateTime, Date, Time, Timestamp'],
  ['Time units', 'Year, Quarter, Month, Week, Day, Hour, YearMonth, YearQuarter, YearWeek, Decade, Duration'],
  ['Measures', 'Quantity, Count, Amount, Price, Percentage, Temperature'],
  ['Signed measures', 'Profit, PercentageChange, Sentiment, Correlation'],
  ['Ordered numbers', 'Rank, Score, ID'],
  ['Places', 'Country, State, City, Region, Address, ZipCode, Latitude, Longitude'],
  ['Categories', 'Category, Name, Status, Boolean, Direction, Range'],
];

/** The parts of the real "economist" preset that the theme slides talk about. */
const ECON = (THEME_PRESETS as Record<string, { spec: Record<string, any> }>).economist.spec;
const ECONOMIST_ROWS = specLayout({
  id: ECON.id,
  ink: {
    series: {
      diverging: { stops: ECON.ink.series.diverging.stops, consumption: ECON.ink.series.diverging.consumption, quantizeCount: ECON.ink.series.diverging.quantizeCount },
      status: { positive: ECON.ink.series.status.positive, negative: ECON.ink.series.status.negative },
    },
    accent: ECON.ink.accent,
  },
  type: { minSize: ECON.type.minSize, headline: { weight: ECON.type.headline.weight } },
  structure: {
    axis: { measure: { line: ECON.structure.axis.measure.line, placement: ECON.structure.axis.measure.placement } },
    grid: { category: ECON.structure.grid.category, zero: ECON.structure.grid.zero },
  },
});

const INTERACTION_ROWS: CodeRow[] = [
  { text: '"interaction_spec": {' },
  { text: '  "interactions": [' },
  { text: '    { "type": "click-group-focus",', hot: true },
  { text: '      "options": { "groupBy": "game" } }', hot: true },
  { text: '  ]' },
  { text: '}' },
  { text: '' },
  { text: '// the event your app receives', gap: true },
  { text: '{ "action": "click-element", "phase": "commit",' },
  { text: '  "target": { "game": "Neon Drift 2049" } }', hot: true },
  { text: '' },
  { text: '// the update it can send back', gap: true },
  { text: '{ "ops": [' },
  { text: '  { "op": "set-style", "targets": [target],', hot: true },
  { text: '    "value": { "state": "emphasized" } },', hot: true },
  { text: '  { "op": "set-annotation", "target": target,', hot: true },
  { text: '    "value": { "text": "Launch month" } }', hot: true },
  { text: '] }' },
];
const TYPES_COMPILED = typesCompiled();
const UPDATES: { id: string; title: string; prompt: string; change: Partial<FlintState> }[] = [
  { id: 'u-theme', title: 'Another theme is a one-line change', prompt: 'Use the Datawrapper style instead.', change: { theme: 'datawrapper' } },
  { id: 'u-swap', title: 'Swapping the axes swaps two names', prompt: 'Put the games across and the months down.', change: { swap: true } },
  { id: 'u-facet', title: 'One panel per region is one more encoding', prompt: 'Split it into a panel for each region.', change: { facet: true } },
  { id: 'u-brush', title: 'Brushing instead of clicking is one line', prompt: 'Let me brush a range of months instead of clicking a game.', change: { brush: true } },
  { id: 'u-pop', title: 'And a pop look is still one line', prompt: 'Now make it pop: bold colors and playful type.', change: { theme: 'pop' } },
];
const UPDATE_SLIDES: SlideDef[] = UPDATES.reduce<{ state: FlintState; slides: SlideDef[] }>(({ state, slides }, u) => {
  const next = { ...state, ...u.change };
  const prev = flintShown(state), shown = flintShown(next);
  const { plus } = lineDiff(prev, shown, FLINT_W);
  slides.push({
    id: u.id, render: () => (<>
      <h2>{u.title}</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.8 1 0', gap: 16 }}>
          <p className="talk-task talk-task-sm">"{u.prompt}"</p>
          <Code rows={fullLayout(shown, prev)} />
        </div>
        <div className="talk-col" style={{ flex: '1.2 1 0' }}>
          <Chart spec={flintInput(next)} />
          <p className="talk-caption">{plus === 1 ? 'One line changed' : `${plus} lines changed`}, in red. Nothing else in the spec moved.</p>
        </div>
      </div>
    </>),
  });
  return { state: next, slides };
}, { state: FLINT_BASE, slides: [] }).slides;

export const SLIDES: SlideDef[] = [
  // ======================================================== Act 0
  {
    id: 'title', kind: 'title', render: () => (<>
      <h1>Flint: a visualization language for the AI era</h1>
      <p className="talk-lead"><strong>Chenglong Wang</strong>, Yuwei Xiao, Kecheng Lu, Yunhai Wang, Alper Sarikaya, Michel Galley, Chris Quirk, Jianfeng Gao<br />Deep Learning Group, Microsoft Research</p>
      <div className="talk-grid" style={{ gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr) minmax(0, 0.7fr)', marginTop: 20 }}>
        <Cell><Chart spec={linkedYears} /></Cell>
        <Cell><Demo width={560}><GlobeWarmingStage layout="stacked" /></Demo></Cell>
        <div className="talk-cell talk-stacked-demo"><Stable width={460} height={735}><CountryTableStage themeId="powerbi-light" /></Stable></div>
      </div>
    </>),
  },

  {
    id: 'tldr', render: () => (<>
      <h2>Flint in short</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.9 1 0' }}>
          <p className="talk-lead">Flint is a visualization language for AI agents to <strong>reliably create polished data visualizations</strong>. The agent writes a short, simple spec, and Flint's compiler takes care of the rest.</p>
          <ul className="talk-lead" style={{ fontSize: 28 }}>
            <li><strong>52 chart types</strong> on five rendering libraries, from Vega-Lite to native Excel charts.</li>
            <li><strong>{Object.keys(THEME_PRESETS).length} themes and 23 interaction presets</strong>, and room for your own.</li>
            <li>Use it <strong>in chat</strong> through MCP, or <strong>in your app</strong> with a coding agent.</li>
          </ul>
        </div>
        <div className="talk-col talk-stack">
          <div className="talk-card talk-card-code"><Code rows={textRows(TLDR_SPEC)} max={15} min={11} /></div>
          <div className="talk-card talk-card-chart">
            <Chart spec={{ ...foodLines([{ type: 'inspect-index', options: { axis: 'x', show: 'all', displayValue: true, seriesBy: 'Food' } }]), theme_spec: 'economist' } as ChartAssemblyInput} />
          </div>
        </div>
      </div>
    </>),
  },

  // ======================================================== Act 1
  {
    id: 'act1', kind: 'section', render: () => (<>
      <h1>Authoring a chart the traditional way</h1>
      <p className="talk-lead">We'll build one chart with a declarative grammar, Vega-Lite, step by step.</p>
    </>),
  },
  {
    id: 'ideal', render: () => (<>
      <h2>Ideally, a chart is a few lines that are easy to change</h2>
      <div className="talk-body">
        <div className="talk-col"><Code rows={stepLayout(CARS.cars)} max={26} tone="vl" /></div>
        <div className="talk-col"><VegaLite spec={VL.cars} /></div>
      </div>
    </>),
  },
  {
    id: 'ideal-bar', render: () => (<>
      <h2>Switching to a bar chart is one small edit</h2>
      <div className="talk-body">
        <div className="talk-col"><Code rows={fullLayout(CARS.carsBar, CARS.cars)} max={26} tone="vl" /></div>
        <div className="talk-col"><VegaLite spec={VL.carsBar} /></div>
      </div>
    </>),
  },
  {
    id: 'reality', render: () => (<>
      <h2>In reality, our charts ask for more</h2>
      <div className="talk-body" style={{ gap: 64 }}>
        <div className="talk-col" style={{ flex: '1.15 1 0' }}>
          <p className="talk-task"><strong>Task:</strong> "Make a heatmap of net new users by game and month for our report page, in The Economist style, and let me click a game to highlight it next to our table."</p>
          <FitTable head={['game', 'region', 'period', 'newUsers']} num={[3]}
            rows={LONG_ROWS.map((r) => [r.game, r.region, r.period.replace('-', ''), r.newUsers])} />
          <p className="talk-note">Rows: 60 months × 24 games × 4 regions = 5,760.</p>
        </div>
        <div className="talk-col" style={{ gap: 16 }}>
          <Code rows={ROWS.raw} max={20} tone="vl" />
          <VegaLite spec={withData(STEPS.raw)} />
        </div>
      </div>
    </>),
  },
  {
    id: 'attempt-1', render: () => (<>
      <h2>Attempt one: plug the data in, and it breaks</h2>
      <Step
        before={ROWS.raw} beforeSpec={withData(STEPS.raw)}
        after={ROWS.parse} afterSpec={withData(STEPS.parse)}
        note={<>The same few lines give a valid spec and a wrong chart. To fix it we parse 202101 into a date, sum the four regions in each cell, and centre the colours on zero, adding {DIFF.parse.plus} lines.</>}
      />
    </>),
  },
  {
    id: 'attempt-2', render: () => (<>
      <h2>Attempt two: five years of months need a new layout</h2>
      <Step
        before={plainLayout(ROWS.parse)} beforeSpec={withData(STEPS.parse)}
        after={ROWS.layout} afterSpec={withData(STEPS.layout)}
        note={<>Sixty months crowd the axis with Jan to Dec five times over. We widen the chart, label each year once, give long game names room, and move the legend to the top. That adds {DIFF.layout.plus} lines and changes {DIFF.layout.minus}.</>}
      />
    </>),
  },
  {
    id: 'theme-vl', render: () => (<>
      <h2>Making it look like The Economist is mostly new work</h2>
      <Step
        before={plainLayout(ROWS.layout)} beforeSpec={withData(STEPS.layout)}
        after={ROWS.theme} afterSpec={withData(STEPS.theme)}
        note={<>Fonts and axes go into the config, the house colours into the encoding, and the red tab, headline, and source line become extra views placed by hand. The spec grows by {DIFF.theme.plus} lines.</>}
      />
    </>),
  },
  {
    id: 'interaction-vl', render: () => (<>
      <h2>Then clicking a game should highlight its row</h2>
      <Step
        before={plainLayout(ROWS.theme)} beforeSpec={withData(STEPS.theme)}
        after={ROWS.final} afterSpec={picked(STEPS.final, PICKED_GAME)}
        note={<>Selection parameters and conditional styles are woven into the opacity, the stroke, and the axis labels, adding {DIFF.final.plus} lines across the spec.</>}
      />
    </>),
  },
  {
    id: 'app-vl', render: () => (<>
      <h2>Hosting it in our app takes code that speaks in signals</h2>
      <div className="talk-body">
        <div className="talk-col"><Code rows={textRows(glue, true)} tone="vl" /></div>
        <div className="talk-col">
          <VegaLite spec={picked(STEPS.final, PICKED_GAME)} />
          <table className="talk-table" style={{ flex: 'none', fontSize: 18 }}>
            <thead><tr><th>month</th><th>game</th><th>region</th><th className="num">net new users</th></tr></thead>
            <tbody>{PICKED_ROWS.slice(0, 4).map((r, i) => <tr key={i}><td>{r.period}</td><td>{r.game}</td><td>{r.region}</td><td className="num">{fmt(r.newUsers)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <p className="talk-note">A click filters the table and a picker selects a game. These {GLUE_LINES} lines talk in signal names and internal stores, not in terms of the data.</p>
    </>),
  },
  {
    id: 'tangle', render: () => (<>
      <h2>…and now the code is a tangle</h2>
      <div className="talk-body">
        <div className="talk-col middle">
          <p className="talk-lead">Nine lines became 166 lines of spec and 24 lines of app code.</p>
          <p>Each bar on the right is one line of the final spec, coloured by what it is about: <span className="c-meaning">what the data means</span>, <span className="c-look">how it looks</span>, and <span className="c-behavior">how it behaves</span>. The concern switches 22 times from top to bottom.</p>
        </div>
        <div className="talk-col"><Minimap lines={MINIMAPS.entangle.map(([i, l, c]) => [i, l, c])} links={MINIMAPS.links} /></div>
      </div>
    </>),
  },
  {
    id: 'changes', render: () => (<>
      <h2>Every small request touches the whole file</h2>
      <div className="talk-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {MINIMAPS.changes.map((c) => (
          <div className="talk-cell" key={c.id}>
            <p className="talk-task talk-task-sm">"{UPDATE_PROMPTS[c.id]}"</p>
            <Minimap lines={c.vl.lines} dels={c.vl.dels} diff maxLines={200} />
          </div>
        ))}
      </div>
    </>),
  },

  // ======================================================== Act 2
  {
    id: 'act2', kind: 'section', render: () => (<>
      <h1>Just let an AI agent do it?</h1>
      <p className="talk-lead">Today we would hand this to an agent. It can do it, but then we notice five problems.</p>
    </>),
  },
  {
    id: 'five-problems', render: () => (<>
      <h2>Five problems with letting the agent write it all</h2>
      <div className="talk-body column">
        <div className="talk-fit" style={{ flex: '1.2 1 0' }}><Sketch name="agentProblems" /></div>
        <ul style={{ flex: '1 1 0', columns: 2, columnGap: 56 }}>
          <li>It needs a strong model to be reliable.</li>
          <li>It is slow.</li>
          <li>It is costly, on every request when a product serves users.</li>
          <li>It is unreliable and fragile: charts compile but lie, and nobody is there to catch them.</li>
          <li>It is hard to edit: a small request rewrites large parts of the code.</li>
        </ul>
      </div>
    </>),
  },
  {
    id: 'root-cause', render: () => (<>
      <h2>The root cause is <em>the language</em></h2>
      <div className="talk-body">
        <div className="talk-col middle">
          <p className="talk-lead">Low-level configuration ties together what the data means, how the chart looks, and how it behaves. Every change ripples into the others.</p>
          <p className="talk-quote">"The logic depends on coordinates, pixels, and SVG paths, all tangled together. So the agent reasons, writes, debugs, and goes around again, and still hands you something fragile."</p>
        </div>
        <div className="talk-col"><Sketch name="entangle" /></div>
      </div>
    </>),
  },

  // ======================================================== Act 3
  {
    id: 'lifting', render: () => (<>
      <h2>Flint is a language for AI agents that disentangles visual and interaction logic</h2>
      <div className="talk-body column">
        <div className="talk-fit"><Sketch name="lifting" /></div>
        <p className="talk-note">You and your agent work with the high-level specs, without losing control. The compiler takes care of data parsing, layout, events, design tokens, and the dependencies between them.</p>
      </div>
    </>),
  },
  {
    id: 'flint-version', render: () => (<>
      <h2>The same chart, written in Flint</h2>
      <div className="talk-body">
        <div className="talk-col"><Code rows={stepLayout(flintShown(FLINT_BASE))} /></div>
        <div className="talk-col">
          <Chart spec={flintInput(FLINT_BASE)} />
          <p className="talk-caption">A few lines on the raw data, with the same look. Click a game to try it.</p>
        </div>
      </div>
    </>),
  },

  ...UPDATE_SLIDES,

  // Section A
  {
    id: 'sec-a', kind: 'section', render: () => (<>
      <div className="talk-bar meaning" />
      <h1>The chart spec</h1>
      <p className="talk-lead">Semantic types and a layout engine take care of what the data means.</p>
    </>),
  },
  {
    id: 'a-what', render: () => (<>
      <h2>Say what each field means, and the compiler does the rest</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.75 1 0' }}><Code rows={specLayout(TYPES_FLINT, /YearMonth|Category|Profit|semantic_types/)} /></div>
        <div className="talk-col" style={{ flex: '1.25 1 0' }}><div className="talk-fit"><Sketch name="typesTree" /></div></div>
      </div>
    </>),
  },
  { id: 'a-how', render: () => (<><h2>How it works: from what the data means to the chart</h2><div className="talk-body"><div className="talk-fit"><Sketch name="typesHow" /></div></div></>) },
  {
    id: 'a-vl', render: () => (<>
      <h2>And this is what the compiler wrote in Vega-Lite</h2>
      <div className="talk-body talk-step">
        <div className="talk-col" style={{ flex: '0.85 1 0' }}>
          <Code rows={specLayout(TYPES_FLINT, /YearMonth|Category|Profit|semantic_types/)} />
          <p className="talk-caption">The Flint spec, on the raw rows.</p>
        </div>
        <div className="talk-arrow">→</div>
        <div className="talk-col" style={{ flex: '1.15 1 0' }}>
          <Code rows={TYPES_COMPILED} tone="vl" />
          <p className="talk-caption">What the compiler wrote in Vega-Lite because of the three types.</p>
        </div>
      </div>
    </>),
  },
  {
    id: 'a-types', render: () => (<>
      <h2>Semantic types: a small vocabulary with a lot behind it</h2>
      <div className="talk-body column" style={{ gap: 22 }}>
        <table className="talk-table talk-wrap" style={{ flex: 'none' }}>
          <tbody>
            {SEMANTIC_TYPES.map(([family, types]) => <tr key={family}><th style={{ width: 260 }}>{family}</th><td>{types}</td></tr>)}
          </tbody>
        </table>
        <p className="talk-task"><strong>Agents are really good at this.</strong> Saying that a column is a month, a profit, or a country is just reading the data, and it is far easier than writing parsing, scale, and format code.</p>
      </div>
    </>),
  },
  {
    id: 'a-spring', render: () => (<>
      <h2>The layout engine: the data pushes out, the canvas pushes back</h2>
      <div className="talk-body column">
        <div className="talk-fit"><Sketch name="springModel" /></div>
        <p className="talk-note">Each item is a spring that wants its own room, and the canvas is a stiffer spring that resists growing. The plot settles where the two balance, never past the most it may stretch.</p>
      </div>
    </>),
  },
  {
    id: 'a-layout-bar', render: () => (<>
      <h2>Try it: more bars ask for more room, and the canvas pushes back</h2>
      <div className="talk-body column"><Stable width={940} height={645}><SizingPlayground mode="discrete" /></Stable></div>
    </>),
  },
  {
    id: 'a-layout-line', render: () => (<>
      <h2>The same balance works for lines over time</h2>
      <div className="talk-body column"><Stable width={940} height={695}><SizingPlayground mode="continuous" /></Stable></div>
    </>),
  },
  {
    id: 'a-backends', render: () => (<>
      <h2>One spec, five rendering libraries</h2>
      <div className="talk-body">
        <div className="talk-col narrow">
          <p className="talk-lead">Each library structures its parameters differently. The same chart spec compiles to all of them.</p>
          <ul>
            <li>Vega-Lite, with 39 chart types</li>
            <li>ECharts, with 37</li>
            <li>Plotly, with 38</li>
            <li>Chart.js, with 22</li>
            <li>Native Excel charts, with 18 templates</li>
          </ul>
        </div>
        <div className="talk-col wide">
          <div className="talk-grid" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
            <Cell caption="Vega-Lite"><Chart spec={lineByType()} /></Cell>
            <Cell caption="ECharts"><Chart spec={lineByType()} backend="echarts" /></Cell>
            <Cell caption="Plotly"><Chart spec={lineByType()} backend="plotly" /></Cell>
            <Cell caption="Chart.js"><Chart spec={lineByType()} backend="chartjs" /></Cell>
          </div>
        </div>
      </div>
    </>),
  },

  // Section B
  {
    id: 'sec-b', kind: 'section', render: () => (<>
      <div className="talk-bar look" />
      <h1>The theme spec</h1>
      <p className="talk-lead">A formal specification of style, written once for every chart.</p>
    </>),
  },
  {
    id: 'b-what', render: () => (<>
      <h2>Name a house style once, and every chart takes it on</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.95 1 0' }}><div className="talk-fit"><Sketch name="themeBeforeNow" /></div></div>
        <div className="talk-col" style={{ flex: '1.1 1 0' }}>
          <Code rows={ECONOMIST_ROWS} max={20} />
          <p className="talk-caption">The "economist" definition, from the theme library.</p>
        </div>
      </div>
    </>),
  },
  { id: 'b-how', render: () => (<><h2>How it works: what the theme says, and what the compiler decides</h2><div className="talk-body"><div className="talk-fit"><Sketch name="themeHow" /></div></div></>) },
  {
    id: 'theme-explorer', render: () => (<>
      <h2>Themes apply to all charts in the library</h2>
      <ThemeExplorer />
    </>),
  },
  // Section C
  {
    id: 'sec-c', kind: 'section', render: () => (<>
      <div className="talk-bar behavior" />
      <h1>The interaction spec</h1>
      <p className="talk-lead">Semantic events and update operators describe how a chart behaves.</p>
    </>),
  },
  {
    id: 'c-what', render: () => (<>
      <h2>Every gesture arrives as something in the data</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.95 1 0' }}><div className="talk-fit"><Sketch name="interactionBeforeNow" /></div></div>
        <div className="talk-col" style={{ flex: '1.05 1 0' }}><Code rows={INTERACTION_ROWS} /></div>
      </div>
    </>),
  },
  { id: 'c-how', render: () => (<><h2>How it works: from a gesture to the update</h2><div className="talk-body"><div className="talk-fit"><Sketch name="interactionHow" /></div></div></>) },
  {
    id: 'c-presets', render: () => (<>
      <h2>Twenty-three presets, one line each</h2>
      <div className="talk-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr 1fr' }}>
        {PRESETS.map((p) => <Cell key={p.caption} caption={p.caption}><Chart spec={p.spec} /></Cell>)}
      </div>
    </>),
  },

  // Summary
  // ======================================================== Act 4
  {
    id: 'act4', kind: 'section', render: () => (<>
      <h1>What you can build with it</h1>
      <p className="talk-lead">In a chat, in your app, and beyond the presets.</p>
    </>),
  },
  {
    id: 'chat', render: () => (<>
      <h2>In a chat, tell your agent what you want</h2>
      <div className="talk-body">
        <div className="talk-col narrow middle">
          <p className="talk-lead">Describe the chart and how it should behave. The agent writes the interaction spec next to the chart spec, and the chart appears in the conversation, ready to hover and read.</p>
        </div>
        <div className="talk-col wide">
          <div className="talk-chat">
            <p className="talk-chat-user">Visualize U.S. egg and bread prices since 2015, and let me hover to read both at any month.</p>
            <div className="talk-chat-agent">
              <p>Here it is. Hover along the timeline to read both prices.</p>
              <Chart spec={foodLines([{ type: 'inspect-index', options: { show: 'all' } }])} />
            </div>
          </div>
        </div>
      </div>
    </>),
  },
  {
    id: 'app', render: () => (<>
      <h2>In your app, events go out and updates come in</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.85 1 0', gap: 16 }}>
          <p className="talk-task talk-task-sm">"Show goals by team, and when I click a team, list its scorers in the panel beside it."</p>
          <Code rows={APP_ROWS} max={20} />
        </div>
        <div className="talk-col" style={{ flex: '1.15 1 0' }}>
          <Stable width={900} height={700}><WorldCupScorersDemo /></Stable>
          <p className="talk-caption">Click a team, and the panel lists its scorers.</p>
        </div>
      </div>
    </>),
  },
  {
    id: 'bespoke-code', render: () => (<>
      <h2>Beyond presets, write your own interaction</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.9 1 0', gap: 16 }}>
          <p className="talk-task talk-task-sm">"Let readers draw where they think coal's share of U.S. electricity went, then reveal the real line."</p>
          <Code rows={BESPOKE_ROWS} max={19} />
        </div>
        <div className="talk-col" style={{ flex: '1.1 1 0' }}>
          <Stable width={900} height={620}><YouDrawItStage /></Stable>
          <p className="talk-caption">Draw the line past the cutoff, and the real data appears when you finish.</p>
        </div>
      </div>
    </>),
  },
  {
    id: 'story', render: () => (<>
      <h2>Create interactive data stories</h2>
      <div className="talk-body column">
        <Cell framed><Demo width={1300}><ArticleSection spec={TIME_USE} editable={false} /></Demo></Cell>
        <p className="talk-note">Hover a sentence in the text, and the chart shows what it is about.</p>
      </div>
    </>),
  },
  {
    id: 'dashboard', render: () => (<>
      <h2>Create dashboards where every chart works together</h2>
      <div className="talk-body column talk-dashboard"><Stable width={1900} height={760}><InteractionDashboardLab /></Stable></div>
    </>),
  },
  {
    id: 'own-theme', render: () => (<>
      <h2>You can create your own theme like a designer</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.85 1 0', gap: 16 }}>
          <p className="talk-task talk-task-sm">"Create a theme inspired by a Disneyland day out: candy colors, rounded shapes, and a playful font."</p>
          <Code rows={specLayout({ theme_spec: FUN_THEME })} max={18} />
        </div>
        <div className="talk-grid" style={{ flex: '1.15 1 0', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: '1fr 1fr' }}>
          <Cell><Chart spec={lineByType({ theme_spec: FUN_THEME } as Partial<ChartAssemblyInput>)} /></Cell>
          <Cell><Chart spec={gameBars(8, { theme_spec: FUN_THEME } as Partial<ChartAssemblyInput>)} /></Cell>
          <Cell><Chart spec={{ ...penguins(), theme_spec: FUN_THEME } as ChartAssemblyInput} /></Cell>
          <Cell><Chart spec={{ ...foodLines(), theme_spec: FUN_THEME } as ChartAssemblyInput} /></Cell>
        </div>
      </div>
    </>),
  },

  {
    id: 'bespoke-pair', render: () => (<>
      <h2>More bespoke interactions, built the same way</h2>
      <div className="talk-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)' }}>
        <div className="talk-cell">
          <Stable width={560} height={580}><GlobeWarmingStage layout="stacked" /></Stable>
          <p className="talk-caption">Drag to turn the globe; the country facing you is the focus.</p>
        </div>
        <div className="talk-cell">
          <Stable width={900} height={580}><RetailDrilldownStage /></Stable>
          <p className="talk-caption">Scroll to zoom the months, and the bars, axis, and labels are laid out again.</p>
        </div>
      </div>
    </>),
  },

  // ======================================================== Act 5
  {
    id: 'recap', render: () => (<>
      <h2>Flint: a visualization language for AI agents</h2>
      <div className="talk-body column" style={{ gap: 20 }}>
        <div className="talk-fit"><Sketch name="lifting" /></div>
        <p className="talk-task" style={{ margin: 0 }}><strong>Open source, MIT license.</strong> <code>flint-chart</code> on npm and PyPI, and the <code>flint-chart-mcp</code> server for your agent, at <a href="https://github.com/microsoft/flint-chart">github.com/microsoft/flint-chart</a>.</p>
      </div>
    </>),
  },
  {
    id: 'try', render: () => (<>
      <h2>Let's build with Flint</h2>
      <div className="talk-cta-wrap">
      <div className="talk-body talk-cta">
        <div className="talk-col talk-cta-card meaning">
          <h3>If you work with data</h3>
          <p>Add the Flint MCP server to GitHub Copilot or your own agent with <code>npx -y flint-chart-mcp</code>, and ask for styled, interactive charts, reports, and dashboards right in the chat.</p>
        </div>
        <div className="talk-col talk-cta-card behavior">
          <h3>If you build interactive apps</h3>
          <p>Build Flint into your product with <code>npm install flint-chart</code>. Give your agent the Flint skills, and its charts will talk to your tables, widgets, and app state.</p>
        </div>
        <div className="talk-col talk-cta-card look">
          <h3>If you design</h3>
          <p>Let's work on new themes together. Your team's style guide can become a Flint theme that every chart, on every library, follows.</p>
        </div>
      </div>
      <p className="talk-task talk-collab"><strong>We want to collaborate!</strong> Ping me and I'm happy to demonstrate Flint to your team, and to work together on the next generation of interactive artifacts.</p>
      </div>
      <p className="talk-lead" style={{ flex: 'none', margin: 0 }}>
        <a href="https://github.com/microsoft/flint-chart">github.com/microsoft/flint-chart</a> and <a href="https://microsoft.github.io/flint-chart">microsoft.github.io/flint-chart</a>
      </p>
    </>),
  },
];
