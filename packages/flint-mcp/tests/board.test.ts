import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VIEW_RESOURCE_URI, createServer } from '../src/server.js';
import { RESULT_COPY_LIMIT } from '../src/board.js';

const rows = [
  { country: 'Japan', region: 'Asia', gdp: 4.2, life: 84 },
  { country: 'India', region: 'Asia', gdp: 3.7, life: 70 },
  { country: 'France', region: 'Europe', gdp: 3.0, life: 82 },
  { country: 'Brazil', region: 'Americas', gdp: 2.1, life: 76 },
];

const scatter = {
  id: 'countries',
  data: { values: rows },
  semantic_types: { country: 'Country', region: 'Category', gdp: 'Quantity', life: 'Quantity' },
  chart_spec: { chartType: 'Scatter Plot', title: 'Wealth and health', encodings: { x: 'gdp', y: 'life', color: 'region' } },
  interaction_spec: { interactions: [{ type: 'select' }] },
};

const bars = {
  id: 'by-country',
  data: { values: rows },
  semantic_types: { country: 'Country', gdp: 'Quantity' },
  chart_spec: { chartType: 'Bar Chart', title: 'GDP by country', encodings: { x: 'country', y: 'gdp' } },
};

let client: Client;
let server: McpServer;

beforeAll(async () => {
  server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'flint-board-test', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client?.close();
  await server?.close();
});

const text = (result: any): string => result.content[0].text;
const check = (board: Record<string, unknown>): Promise<any> => client.callTool({ name: 'validate_board', arguments: board });
const showBoard = (board: Record<string, unknown>): Promise<any> => client.callTool({ name: 'show', arguments: { board } });

describe('board tools', () => {
  it('validate_board reports every chart and what each links, and opens no card; show draws the same board', async () => {
    const spec = { title: 'Countries', charts: [scatter, bars], link_spec: { fields: ['country', 'region'] } };
    const result: any = await check(spec);
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('2 charts (countries, by-country)');
    expect(text(result)).toContain('Nothing is on screen: fix what this report asks in the spec, then call show with it.');
    expect(text(result)).toContain('## countries');
    expect(text(result)).toContain('Links (fields: country, region; one selection the whole board shares):');
    expect(text(result)).toContain('✓ countries: sends region by select; receives region; leaves out country: its marks do not carry country');
    expect(text(result)).toContain('✓ by-country: receives country; leaves out region: its marks do not carry region');
    expect(text(result)).toContain('sends nothing: no interaction that selects');
    expect(result._meta).toBeUndefined();

    const shown: any = await showBoard(spec);
    expect(text(shown)).toContain('The board is on screen in a new card.');
    expect(text(shown)).toContain('✓ countries: sends region by select');
    const board = shown._meta.flint.board;
    expect(board.charts.map((chart: any) => chart.id)).toEqual(['countries', 'by-country']);
    expect(board.linked['by-country']).toMatchObject({ sends: [], receives: ['country'] });

    const { tools } = await client.listTools();
    expect((tools.find((entry) => entry.name === 'validate_board') as any)._meta?.ui).toBeUndefined();
    const show = tools.find((tool) => tool.name === 'show') as any;
    expect(show._meta.ui.resourceUri).toBe(VIEW_RESOURCE_URI);
    expect(show._meta.ui.visibility).toBeUndefined();
  });

  it('marks a chart that joins no field, honours receive: false, and names an unknown chart', async () => {
    const result: any = await check({ charts: [scatter, bars], link_spec: { fields: ['continent', 'region'], charts: { countries: { receive: false }, ghost: {} } } });
    expect(text(result)).toContain('✓ countries: sends region by select; leaves out continent: no field continent in its data; receives nothing (receive: false)');
    expect(text(result)).toContain('✗ by-country: not linked; leaves out continent');
    expect(text(result)).toContain('✗ ghost: not linked; no chart "ghost" among the linked charts');
  });

  it('links a chart once its marks carry the field', async () => {
    const clickable = { ...bars, interaction_spec: { interactions: [{ type: 'click-highlight' }] } };
    const result: any = await check({ charts: [scatter, clickable], link_spec: { fields: ['country'] } });
    expect(text(result)).toContain('✗ countries: not linked; leaves out country: its marks do not carry country; encode it, on detail');
    const detailed = { ...scatter, chart_spec: { ...scatter.chart_spec, encodings: { ...scatter.chart_spec.encodings, detail: 'country' } } };
    const fixed: any = await check({ charts: [detailed, clickable], link_spec: { fields: ['country'] } });
    expect(text(fixed)).toContain('✓ countries: sends country by select; receives country');
    expect(text(fixed)).toContain('✓ by-country: sends country by click-highlight; receives country');

    const hovering = { ...detailed, interaction_spec: { interactions: [{ type: 'select' }, { type: 'hover-group-focus', options: { groupBy: 'region' } }] } };
    const both: any = await showBoard({ charts: [hovering, clickable], link_spec: { fields: ['country', 'region'] } });
    expect(text(both)).toContain('✓ countries: sends country + region by select, region by hover-group-focus (hover); receives country, region');
    expect(both._meta.flint.board.linked.countries.gestures['hover-group-focus']).toEqual({ preset: 'hover-group-focus', fields: ['region'], hover: true });
  });

  it('validate_board leaves a chart with errors off and says why; show draws nothing for it', async () => {
    const spec = { charts: [scatter, { ...bars, chart_spec: { ...bars.chart_spec, chartType: 'Not A Chart' } }] };
    const result: any = await check(spec);
    expect(text(result)).toContain('1 chart (countries)');
    expect(text(result)).toMatch(/## by-country\n✗ not drawn: /);
    const shown: any = await showBoard(spec);
    expect(shown.isError).toBe(true);
    expect(text(shown)).toMatch(/^Nothing was drawn: by-country ✗ not drawn: .*Fix the spec and call show again\.$/);
    expect(shown._meta.flint.error).toBe(text(shown));
  });

  it('keeps nothing between calls: each call builds the board from its spec alone', async () => {
    const first: any = await showBoard({ title: 'T', charts: [scatter] });
    const second: any = await showBoard({ title: 'T', charts: [scatter, bars] });
    expect(first._meta.flint.board.charts).toHaveLength(1);
    expect(second._meta.flint.board.charts).toHaveLength(2);
    expect(second._meta.flint.board.id).not.toBe(first._meta.flint.board.id);
    const elsewhere = createServer();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await elsewhere.connect(serverSide);
    const other = new Client({ name: 'another-process', version: '0.0.0' });
    await other.connect(clientSide);
    try {
      const again: any = await other.callTool({ name: 'show', arguments: { board: { title: 'T', charts: [scatter, bars] } } });
      expect(again._meta.flint.board.charts.map((chart: any) => chart.id)).toEqual(['countries', 'by-country']);
    } finally {
      await other.close();
      await elsewhere.close();
    }
  });

  it('show takes one of chart or board', async () => {
    const neither: any = await client.callTool({ name: 'show', arguments: {} });
    expect(neither.isError).toBe(true);
    expect(text(neither)).toContain('Pass one of chart or board.');
    const both: any = await client.callTool({ name: 'show', arguments: { chart: { data: bars.data, chart_spec: bars.chart_spec }, board: { charts: [bars] } } });
    expect(both.isError).toBe(true);
  });

  it('reports the layout and what the board should still fix', async () => {
    const kpi = (id: string, metric: string) => ({ id, data: { values: [{ metric, value: 3, goal: 2 }] }, chart_spec: { chartType: 'KPI Card', encodings: { metric: 'metric', value: 'value', goal: 'goal' } } });
    const trend = {
      id: 'trend',
      data: { values: rows.map((row, at) => ({ ...row, year: 2020 + at })) },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'year', y: 'gdp', color: 'region' } },
    };
    const charts = [kpi('k1', 'Sales'), kpi('k2', 'Margin'), kpi('k3', 'Churn'), trend, scatter, { ...bars, theme_spec: 'nyt' }];
    const report = text(await check({ charts }));
    expect(report).toContain('- row 1, KPI tiles (compact): k1 (a third), k2 (a third), k3 (a third)');
    expect(report).toContain('- row 2 (tall): trend (full width)');
    expect(report).toContain('- row 3 (standard): countries (half), by-country (half)');
    expect(report).toContain('- No board title');
    expect(report).toContain('- No title on trend:');
    expect(report).toContain('- trend, countries colour by region');

    const themed = text(await check({ title: 'Countries', subtitle: 'GDP and life expectancy', theme_spec: 'economist', charts }));
    expect(themed).toContain('Charts set their own themes');
    const narrowed = text(await check({ charts: [kpi('k1', 'Sales'), { ...trend, layout: { span: 1, height: 'compact' } }, scatter] }));
    expect(narrowed).toContain('- row 2 (standard): trend (half), countries (half)');
  });

  it('splits five KPI tiles three and two, and leaves a measure on colour alone', async () => {
    const kpi = (id: string) => ({ id, data: { values: [{ metric: id, value: 1 }] }, chart_spec: { chartType: 'KPI Card', encodings: { metric: 'metric', value: 'value' } } });
    const heat = (id: string) => ({
      id,
      data: { values: rows.map((row) => ({ ...row, year: '2025' })) },
      chart_spec: { chartType: 'Heatmap', title: id, encodings: { x: 'year', y: 'country', color: 'gdp' } },
    });
    const report = text(await check({ title: 'T', subtitle: 'S', charts: [kpi('a'), kpi('b'), kpi('c'), kpi('d'), kpi('e'), heat('h1'), heat('h2')] }));
    expect(report).toContain('- row 1, KPI tiles (compact): a (a third), b (a third), c (a third)');
    expect(report).toContain('- row 2, KPI tiles (compact): d (half), e (half)');
    expect(report).not.toContain('colour by gdp');
  });

  it('keeps the reader\'s arrangement passed as grid, fitted to the charts the board has now', async () => {
    const grid = [{ id: 'by-country', x: 0, y: 0, w: 12, h: 17 }, { id: 'countries', x: 0, y: 17, w: 6, h: 17 }];
    const kept: any = await showBoard({ title: 'T', subtitle: 'S', charts: [scatter, bars], grid });
    expect(kept._meta.flint.board.grid).toEqual(grid);
    expect(text(kept)).toContain('Arranged on a 12-column grid (grid), as the reader left it; keep passing it.');
    expect(text(kept)).toContain('- by-country: columns 1–12, rows 1–17 (full width, 340px tall)');

    const added: any = await check({ title: 'T', subtitle: 'S', charts: [scatter, bars, { ...bars, id: 'more' }], grid });
    expect(text(added)).toContain('- more: columns 1–6, rows 35–51');
    const fewer: any = await check({ title: 'T', subtitle: 'S', charts: [scatter], grid });
    expect(text(fewer)).not.toContain('by-country');
    expect(text(fewer)).toContain('- countries: columns 1–6, rows 18–34');

    const clash: any = await check({ title: 'T', subtitle: 'S', charts: [scatter, bars], grid: [grid[0], { ...grid[1], y: 5 }] });
    expect(text(clash)).toContain('The grid was dropped for the rows: by-country overlaps another chart.');
    expect(text(clash)).toContain('- row 1 (standard): countries (half), by-country (half)');
  });

  it('holds a Table of rows and a chart opened as its table', async () => {
    const table = { id: 'list', data: { values: rows }, chart_spec: { chartType: 'Table', title: 'Countries', encodings: {} } };
    const shown: any = await showBoard({ title: 'T', subtitle: 'S', charts: [table, { ...bars, view: 'table' }], link_spec: { fields: ['country'] } });
    expect(text(shown)).toContain('Opens as the table of the rows it draws');
    expect(text(shown)).toContain('list: receives country');
    expect(shown._meta.flint.board.charts.map((chart: any) => chart.view)).toEqual([undefined, 'table']);

    const encoded: any = await check({ charts: [{ ...table, id: 'bad', chart_spec: { chartType: 'Table', encodings: { x: 'country' } } }] });
    expect(text(encoded)).toContain('Table takes no encodings');
  });

  it('flags a chart that stacks repeated rows as slices, and not once it sums them', async () => {
    const monthly = [1, 2, 3].flatMap((month) => rows.map((row) => ({ ...row, month })));
    const sliced = { id: 'sliced', data: { values: monthly }, chart_spec: { chartType: 'Bar Chart', title: 'GDP', encodings: { y: 'country', x: 'gdp', color: 'region' } } };
    expect(text(await check({ title: 'T', subtitle: 'S', charts: [sliced] }))).toContain('sliced draws 12 rows as 4 country × region groups, so each mark is a stack of slices, one per row: sum the rows first, or set encodings.x.aggregate to "sum"');
    const summed = { ...sliced, chart_spec: { ...sliced.chart_spec, encodings: { y: 'country', x: { field: 'gdp', aggregate: 'sum' }, color: 'region' } } };
    expect(text(await check({ title: 'T', subtitle: 'S', charts: [summed] }))).not.toContain('stack of slices');
  });

  it('show also puts a small inline chart in structuredContent, for a host that drops _meta', async () => {
    const result: any = await client.callTool({ name: 'show', arguments: { chart: { data: bars.data, semantic_types: bars.semantic_types, chart_spec: bars.chart_spec } } });
    expect(text(result)).toContain('The chart is on screen in a new card.');
    expect(result.structuredContent.flint.board).toEqual(result._meta.flint.board);
    expect(result.structuredContent.flint.board.charts[0].input.data.values).toHaveLength(4);
  });

  it('show keeps a large chart, or one read from a local file, out of structuredContent', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ country: `Country ${i}`, gdp: i * 1000 }));
    const big: any = await client.callTool({ name: 'show', arguments: { chart: { data: { values: many }, semantic_types: bars.semantic_types, chart_spec: bars.chart_spec } } });
    expect(JSON.stringify(big._meta.flint.board).length).toBeGreaterThan(RESULT_COPY_LIMIT);
    expect(big.structuredContent).toBeUndefined();
    expect(big._meta.flint.board.charts[0].input.data.values).toHaveLength(200);

    const dir = mkdtempSync(join(tmpdir(), 'flint-show-'));
    try {
      const file = join(dir, 'gdp.json');
      writeFileSync(file, JSON.stringify(rows));
      const local: any = await client.callTool({ name: 'show', arguments: { chart: { data: { url: file }, semantic_types: bars.semantic_types, chart_spec: bars.chart_spec } } });
      expect(local.structuredContent).toBeUndefined();
      expect(local._meta.flint.board.charts[0].input.data.values).toHaveLength(rows.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('serves the board view as the chart bundle marked for the board', async () => {
    const { contents } = await client.readResource({ uri: VIEW_RESOURCE_URI });
    expect(contents[0].mimeType).toContain('mcp-app');
  });
});
