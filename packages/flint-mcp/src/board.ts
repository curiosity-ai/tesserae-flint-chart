// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { ChartAssemblyInput, ChartLink, ChartUpdate, LinkSpec, ValidateResult } from 'flint-chart';
import { drawsAsTable, validateLinks } from 'flint-chart';

import { ROW_UNITS, boardColumns, boardRows, colorField, gridItemFor, gridLines, gridProblem, isKpi, layoutLines, sharedColorOrders, type ChartLayout, type GridItem } from './board-layout.js';

/** The characters of a chart title that fit on one line per row unit, at the card's heading size. */
const TITLE_CHARS_PER_UNIT = 7.5;
import { OPENS_AS_TABLE, chartContext } from './chart-context.js';
import { toAssemblyInput, updatesShape, viewShape, type AssemblyInputArgs, type ChartView } from './tools/schemas.js';

/** One chart on a board: the spec with its data inline, and the agent's update layers. */
export interface BoardChart {
  id: string;
  input: ChartAssemblyInput;
  updates?: ChartUpdate[];
  layout?: ChartLayout;
  /** The view the cell opens in; the reader's switch holds until the agent sets it again. */
  view?: ChartView;
  /** The rows were read from a local data.url file, so they never passed through the conversation. */
  fromFile?: true;
}

export interface Board {
  id: string;
  /** A chart: one chart, drawn as the chart card. A board: several under one headline. */
  kind: 'chart' | 'board';
  /** The headline: what the board shows or is for. */
  title?: string;
  /** The deck: the data, its scope and period. */
  subtitle?: string;
  /** The footer: where the data comes from and when. */
  source?: string;
  /** The theme of every chart that does not set its own. */
  theme_spec?: ChartAssemblyInput['theme_spec'];
  /** Board columns; two once the board holds two charts that are not KPI tiles. */
  columns?: number;
  /** Where each chart sits, as the reader arranged it on a card; the rows of `columns` and `layout` without it. */
  grid?: GridItem[];
  charts: BoardChart[];
  /** The fields the charts connect on; none when the charts stand alone. */
  link_spec?: LinkSpec;
  /** What each chart sends and receives under `link_spec`, checked on each write. */
  linked?: Record<string, ChartLink>;
}

/** A chart spec as a tool argument: its id, the chart input, and its update layers. */
export type BoardChartArgs = AssemblyInputArgs & { id: string; updates?: ChartUpdate[]; layout?: ChartLayout; view?: ChartView };

/** The board fields a board spec sets around its charts. */
export type BoardFields = Pick<Board, 'title' | 'subtitle' | 'source' | 'theme_spec' | 'columns'>;

export const layoutShape = z
  .object({
    span: z.number().int().min(1).max(4).optional().describe('Board columns the chart spans. Default: the full row for time series, maps and Gantt charts, else one column.'),
    height: z.enum(['compact', 'standard', 'tall']).optional().describe('compact (~130px) for KPI tiles and sparklines, standard (~280px, the default), tall (~420px) for a lead chart, a map, or many categories. A row takes its tallest chart\'s height.'),
  })
  .describe('Where the chart sits on the board. KPI Cards that follow each other share a row of up to four.');

export function boardFieldsShape(themeShape: z.ZodTypeAny) {
  return {
    title: z.string().optional().describe('The headline: what the board shows or is for, in words, e.g. "Sales recovered in Q3, led by Europe". The card draws it largest; every board needs one.'),
    subtitle: z.string().optional().describe('The deck: the data, its scope and period, e.g. "Monthly revenue by region and product, Jan–Sep 2025, $m".'),
    source: z.string().optional().describe('The footer: where the data comes from and when, e.g. "Source: company ledger, as of 30 Sep 2025".'),
    theme_spec: themeShape.describe('The theme of every chart that does not set its own; the card takes its fonts and colours. Prefer setting it here, once, over per chart.'),
    columns: z.number().int().min(1).max(4).optional().describe('Board columns. Default: 2 once the board holds two charts that are not KPI tiles, else 1.'),
  };
}

type Validate = (input: ChartAssemblyInput, updates: ChartUpdate[] | undefined) => Promise<{ result: ValidateResult; input: ChartAssemblyInput }>;

export function boardChartShape(assemblyInputShape: Record<string, z.ZodTypeAny>) {
  return z.object({
    id: z.string().describe('Names the chart on the board; link_spec, grid and the report use it.'),
    ...assemblyInputShape,
    updates: updatesShape.updates.describe(
      'ChartUpdate layers the chart shows: state, where interaction_spec is behaviour.',
    ),
    layout: layoutShape.optional(),
    ...viewShape,
  });
}

export const linkSpecShape = z
  .object({
    fields: z.array(z.string()).describe(
      'The fields the charts connect on (e.g. ["country", "region"]). A selection is about the fields its interaction selects by: a clicked mark all of them it carries, a group focus its group field, a brush its axis field. Every other chart emphasizes its marks that match on each of those fields it carries. A chart joins a field only if its marks carry it: encode it, on detail if nothing else shows it.',
    ),
    charts: z
      .record(z.string(), z.object({ send: z.boolean().optional(), receive: z.boolean().optional() }))
      .optional()
      .describe('Per chart id: send: false keeps its selections to itself; receive: false keeps it as drawn, as an overview does.'),
  })
  .describe('How the charts on the board connect: by the fields they share. One selection holds at a time; a new one replaces the last.');

/** The chart as the model reads it before it is drawn: the same report the drawn chart sends as its context. */
export function chartReport(input: ChartAssemblyInput, updates: readonly ChartUpdate[] | undefined, result: ValidateResult): string {
  const report = chartContext({ agent: input, shown: input, updates, checks: result.updates, warnings: result.warnings }).text;
  const ops = (result.updates ?? []).flatMap((check) => check.ops);
  const failed = ops.filter((op) => !op.ok).length;
  if (failed === 0) return report;
  return `${failed} of ${ops.length} update ops do not apply (✗ below); the chart draws without them. ` +
    `Fix each one, or tell the user what is missing.\n${report}`;
}

/** The outcome of one chart write: the chart drawn, or why it was not. */
export interface ChartOutcome {
  id: string;
  drawn: boolean;
  text: string;
}

/** The chart input as the card draws it: the board's theme where the chart sets none. */
export function withBoardTheme(input: ChartAssemblyInput, board: Pick<Board, 'theme_spec'>): ChartAssemblyInput {
  return input.theme_spec !== undefined || board.theme_spec === undefined ? input : { ...input, theme_spec: board.theme_spec };
}

export async function prepareChart(
  args: BoardChartArgs,
  validate: Validate,
  board: Pick<Board, 'theme_spec'>,
): Promise<{ chart?: BoardChart; outcome: ChartOutcome; errors?: string }> {
  const { id, updates, layout, view, fromFile: keptFromFile, ...rest } = args as BoardChartArgs & { fromFile?: true };
  const own = toAssemblyInput(rest as AssemblyInputArgs);
  // An update that leaves the data alone rebuilds from rows already read, so the file origin carries over.
  const fromFile = typeof own.data?.url === 'string' || keptFromFile === true;
  const { result, input } = await validate(withBoardTheme(own, board), updates);
  if (!result.valid) {
    const errors = result.errors.map((e) => e.message).join('; ');
    return { errors, outcome: { id, drawn: false, text: `✗ not drawn: ${errors}` } };
  }
  const opensAsTable = view === 'table' && !drawsAsTable(input.chart_spec.chartType);
  const report = chartReport(input, updates, result) + (opensAsTable ? `\n${OPENS_AS_TABLE}` : '');
  // The board's theme stays the board's, so the card's theme switch reaches every chart that set none.
  const stored = { ...input, theme_spec: own.theme_spec };
  return {
    chart: {
      id, input: stored, ...(updates ? { updates } : {}), ...(layout ? { layout } : {}), ...(opensAsTable ? { view } : {}),
      ...(fromFile ? { fromFile: true as const } : {}),
    },
    outcome: { id, drawn: true, text: report },
  };
}

/** Checks what each chart sends and receives under the board's link spec; called after each write. */
export function relink(board: Board): void {
  board.linked = board.link_spec
    ? validateLinks(Object.fromEntries(board.charts.map((chart) => [chart.id, chart.input])), board.link_spec)
    : undefined;
}

function layoutCharts(board: Board) {
  return board.charts.map((chart) => ({ id: chart.id, chartType: chart.input.chart_spec.chartType, layout: chart.layout }));
}

/** The board's layout as the card draws it on a wide card. */
export function boardLayoutLines(board: Board): string[] {
  if (board.grid) {
    return [
      'Arranged on a 12-column grid (grid), as the reader left it; keep passing it. Leave grid out to lay the charts out in rows again.',
      ...gridLines(board.grid),
    ];
  }
  const charts = layoutCharts(board);
  return layoutLines(boardRows(charts, boardColumns(charts, board.columns)));
}

/**
 * The arrangement a board spec passes, fitted to its charts: places of charts no longer on the board
 * are dropped and new charts take a place below the rest. An arrangement that still does not fit is
 * dropped for the rows, and the note says why.
 */
export function fitGrid(board: Board): string | undefined {
  if (!board.grid) return undefined;
  const ids = new Set(board.charts.map((chart) => chart.id));
  let grid = board.grid.filter((item) => ids.has(item.id));
  for (const chart of board.charts) {
    if (!grid.some((item) => item.id === chart.id)) {
      grid = [...grid, gridItemFor(grid, { id: chart.id, chartType: chart.input.chart_spec.chartType, layout: chart.layout })];
    }
  }
  const problem = gridProblem(grid, board.charts.map((chart) => chart.id));
  if (problem) {
    board.grid = undefined;
    return `The grid was dropped for the rows: ${problem}.`;
  }
  board.grid = grid;
  return undefined;
}

/** Chart types that draw one mark per row, so rows that repeat a category stack as slices. */
const ROW_MARKS = new Set(['Bar Chart', 'Stacked Bar Chart', 'Grouped Bar Chart', 'Bar Table', 'Lollipop Chart', 'Pie Chart', 'Heatmap']);

/**
 * Why a chart draws one mark per row where the reader expects one per category: several rows share
 * every category it encodes and no channel sums them. Undefined when each category has one row.
 */
function stackedRepeats(input: ChartAssemblyInput): string | undefined {
  const { chartType, encodings = {} } = input.chart_spec as { chartType: string; encodings?: Record<string, unknown> };
  if (!ROW_MARKS.has(chartType)) return undefined;
  const fieldOf = (value: unknown) => (typeof value === 'string' ? value : (value as { field?: string } | undefined)?.field);
  const aggregated = Object.values(encodings).some((value) => typeof value === 'object' && value !== null && 'aggregate' in (value as object));
  if (aggregated) return undefined;
  const rows = (input.data.values ?? []) as Record<string, unknown>[];
  const fields = Object.values(encodings).map(fieldOf).filter((field): field is string => !!field);
  const categories = fields.filter((field) => rows.some((row) => typeof row?.[field] === 'string'));
  const measure = fields.find((field) => !categories.includes(field) && rows.some((row) => typeof row?.[field] === 'number'));
  if (categories.length === 0 || !measure) return undefined;
  const keys = new Set(rows.map((row) => JSON.stringify(categories.map((field) => row?.[field]))));
  if (keys.size === rows.length) return undefined;
  const channel = Object.entries(encodings).find(([, value]) => fieldOf(value) === measure)?.[0] ?? 'x';
  return `draws ${rows.length} rows as ${keys.size} ${categories.join(' × ')} groups, so each mark is a stack of slices, one per row: sum the rows first, or set encodings.${channel}.aggregate to "sum".`;
}

/** What the board should still fix to read well; each note says the fix. */
export function boardReview(board: Board): string[] {
  const notes: string[] = [];
  if (!board.title) notes.push('No board title: set title to what the board shows or is for, in words.');
  if (board.title && board.title.length > 90) notes.push('The board title is long; keep it to one line and move the detail to subtitle.');
  if (!board.subtitle && board.charts.length > 0) notes.push('No subtitle: say the data, its scope, period and units.');
  const untitled = board.charts.filter((chart) => !isKpi(chart.input.chart_spec.chartType) && !chart.input.chart_spec.title).map((chart) => chart.id);
  if (untitled.length > 0) notes.push(`No title on ${untitled.join(', ')}: each chart draws its title as its heading; name what the chart shows.`);
  const charts = layoutCharts(board);
  const units = new Map(boardRows(charts, boardColumns(charts, board.columns)).flatMap((row) => row.charts.map((cell) => [cell.id, cell.units] as const)));
  const long = board.charts.flatMap((chart) => {
    const title = chart.input.chart_spec.title;
    const limit = Math.round((units.get(chart.id) ?? ROW_UNITS) * TITLE_CHARS_PER_UNIT);
    return title && title.length > limit ? [`${chart.id} (${title.length} characters, about ${limit} fit)`] : [];
  });
  if (long.length > 0) notes.push(`Chart titles that wrap at their width: ${long.join(', ')}; shorten each to one line and move detail to its subtitle.`);
  for (const chart of board.charts) {
    const stacked = stackedRepeats(chart.input);
    if (stacked) notes.push(`${chart.id} ${stacked}`);
  }
  const kpis = board.charts.filter((chart) => isKpi(chart.input.chart_spec.chartType)).length;
  if (kpis > 6) notes.push(`${kpis} KPI tiles: keep the three to five numbers the reader acts on.`);
  if (board.charts.length - kpis > 8) notes.push(`${board.charts.length - kpis} charts: a board reads best with up to six; split it or remove the least used.`);
  const themes = new Set(board.charts.map((chart) => JSON.stringify(chart.input.theme_spec ?? null)).filter((theme) => theme !== 'null'));
  if (themes.size > 1 || (themes.size === 1 && board.theme_spec !== undefined)) {
    notes.push('Charts set their own themes; set theme_spec once on the board and drop it from the charts so the board reads as one piece.');
  }
  for (const [field, values] of sharedColorOrders(board.charts.map((chart) => chart.input))) {
    const users = board.charts.filter((chart) => colorField(chart.input) === field).map((chart) => chart.id);
    notes.push(`${users.join(', ')} colour by ${field}; the card gives its ${values.length} values one order, so each keeps one colour across the board.`);
  }
  return notes;
}

/** A theme as the model reads it: its preset id, a custom theme's label, or Flint's default. */
export function themeName(theme: ChartAssemblyInput['theme_spec'] | null): string {
  if (theme === undefined || theme === null) return 'Flint default';
  if (typeof theme === 'string') return theme;
  const custom = theme as { label?: string; id?: string; extends?: string };
  return custom.label ?? custom.id ?? (custom.extends ? `custom (${custom.extends})` : 'custom');
}

/** What the model reads once a chart or board is on screen. */
export function shownText(board: Board): string {
  return `The ${board.kind === 'chart' ? 'chart' : 'board'} is on screen in a new card. What the reader does on it reaches you with their next message. ` +
    'To change it, change the spec and call show again: a new card shows it, and earlier cards stay as they were.';
}

/** A chart or board as the model reads it: the checks of validate_chart or validate_board, or of show. */
export function viewReport(board: Board, outcomes: readonly ChartOutcome[], notes: readonly string[] = [], shown = false): string {
  const next = shown ? shownText(board) : 'Nothing is on screen: fix what this report asks in the spec, then call show with it.';
  if (board.kind === 'board') return boardReport(board, outcomes, notes, next);
  return [next, ...notes, ...outcomes.map((outcome) => outcome.text)].join('\n');
}

function boardReport(board: Board, outcomes: readonly ChartOutcome[], notes: readonly string[], next: string): string {
  const lines = [
    `Board${board.title ? ` "${board.title}"` : ''}: ${board.charts.length} chart${board.charts.length === 1 ? '' : 's'} (${board.charts.map((chart) => chart.id).join(', ') || 'none'}).`,
    next,
  ];
  if (notes.length > 0) lines.push('', ...notes);
  if (board.charts.length > 0) lines.push('', 'Layout:', ...boardLayoutLines(board));
  for (const outcome of outcomes) {
    lines.push('', `## ${outcome.id}`, outcome.text);
  }
  if (board.link_spec && board.linked) {
    lines.push('', `Links (fields: ${board.link_spec.fields.join(', ')}; one selection the whole board shares):`, ...linkLines(board.linked));
  }
  const review = boardReview(board);
  if (review.length > 0) lines.push('', 'Review:', ...review.map((note) => `- ${note}`));
  return lines.join('\n');
}

/** The board as the card reads it. */
/**
 * The largest board `show` also returns in structuredContent, in bytes of JSON. VS Code's agent
 * sessions rebuild a card's result from content and structuredContent alone, dropping _meta, so a
 * card drawn again finds its chart only there; but that copy also reaches the model, so only small
 * boards ride along (about 1k tokens at most).
 */
export const RESULT_COPY_LIMIT = 4096;

/**
 * Whether `show` may also put the board in structuredContent: every chart's rows came inline, so they
 * are in the conversation already, and the board is small. Rows read from a local file never are.
 */
export function fitsInResult(board: Board): boolean {
  if (board.charts.some((chart) => chart.fromFile)) return false;
  return Buffer.byteLength(JSON.stringify(board), 'utf8') <= RESULT_COPY_LIMIT;
}

export function boardSnapshot(board: Board): Board {
  return {
    ...board,
    charts: board.charts.map((chart) => ({ ...chart })),
    ...(board.link_spec ? { link_spec: { ...board.link_spec } } : {}),
    ...(board.linked ? { linked: { ...board.linked } } : {}),
    ...(board.grid ? { grid: board.grid.map((item) => ({ ...item })) } : {}),
  };
}

/**
 * A chart or board from its spec, every chart checked, nothing kept: validate_chart, validate_board
 * and show each build it again from the spec the agent passes. A chart with errors is left off the
 * board, and its outcome says why.
 */
export async function assembleBoard(
  spec: BoardSpec,
  kind: Board['kind'],
  validate: Validate,
): Promise<{ board: Board; outcomes: ChartOutcome[]; notes: string[] }> {
  const board: Board = {
    id: `${kind}-${randomBytes(8).toString('hex')}`,
    kind,
    ...(spec.title !== undefined ? { title: spec.title } : {}),
    ...(spec.subtitle !== undefined ? { subtitle: spec.subtitle } : {}),
    ...(spec.source !== undefined ? { source: spec.source } : {}),
    ...(spec.theme_spec !== undefined ? { theme_spec: spec.theme_spec } : {}),
    ...(spec.columns !== undefined ? { columns: spec.columns } : {}),
    ...(spec.grid ? { grid: spec.grid } : {}),
    charts: [],
  };
  const outcomes: ChartOutcome[] = [];
  for (const chartArgs of spec.charts) {
    const { chart, outcome } = await prepareChart(chartArgs, validate, board);
    outcomes.push(outcome);
    if (chart) board.charts.push(chart);
  }
  if (spec.link_spec) board.link_spec = spec.link_spec;
  relink(board);
  const notes = [fitGrid(board)].filter((note): note is string => note !== undefined);
  return { board, outcomes, notes };
}

/** A board as a tool argument: its fields, its charts, how they connect, and the reader's arrangement. */
export type BoardSpec = BoardFields & { charts: BoardChartArgs[]; link_spec?: LinkSpec; grid?: GridItem[] };

export const gridShape = z
  .array(z.object({ id: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() }))
  .describe('Where each chart sits on a 12-column grid, as the reader arranged it on a card; the card\'s context gives it. Leave it out for rows.');

/** The link as the model reads it: what each chart sends, by which interaction, and receives, and what is left out. */
function linkLines(links: Record<string, ChartLink>): string[] {
  return Object.entries(links).map(([id, link]) => {
    const sends = Object.entries(link.gestures).map(([gesture, info]) => `${info.fields.join(' + ')} by ${gesture}${info.hover ? ' (hover)' : ''}`);
    const parts = [
      sends.length > 0 ? `sends ${sends.join(', ')}` : '',
      link.receives.length > 0 ? `receives ${link.receives.join(', ')}` : '',
    ].filter(Boolean);
    const mark = link.sends.length === 0 && link.receives.length === 0 ? '✗' : '✓';
    return `${mark} ${id}: ${parts.join('; ') || 'not linked'}${link.notes.length > 0 ? `; ${link.notes.join('; ')}` : ''}`;
  });
}
