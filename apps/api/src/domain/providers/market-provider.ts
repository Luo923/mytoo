import { defaultEtfUniverse, defaultStockUniverse } from '../config/fund-universe.js';
import { fundUniverseManager, type FundEntry } from '../config/fund-universe-manager.js';
import { EastmoneyClient, type EastmoneyFundEstimate } from './eastmoney-client.js';
import type { Etf, Fund, FundHolding, FundNavPoint, MarketDailyBar, RealtimeQuote, Stock } from '../types.js';

const eastmoneyClient = new EastmoneyClient();
export { eastmoneyClient };

// ─── 并发速率控制（修复问题10：避免对公开接口发起无限制并发请求） ─────────────
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 分批串行执行异步任务，每批内并发，批间有延迟，防止触发公开接口频率限制。
 * @param items     待处理的输入列表
 * @param fn        每个 item 对应的异步任务
 * @param batchSize 每批并发数量，默认 2
 * @param delayMs   批间等待毫秒数，默认 300ms
 */
const batchedMap = async <T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = 2,
  delayMs = 300
): Promise<R[]> => {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (start + batchSize < items.length) {
      await sleep(delayMs);
    }
  }
  return results;
};

const formatDate = (value: number | string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toCompactDate = (value: Date): string => formatDate(value).replaceAll('-', '');

const parseKline = (line: string): MarketDailyBar => {
  // 东方财富 K 线字段顺序：日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,...
  const [date, open, close, high, low, volume, amount, , changeRate] = line.split(',');
  return {
    date: date ?? '',
    open: Number(open),
    close: Number(close),
    high: Number(high),
    low: Number(low),
    volume: Number(volume),
    amount: Number(amount),
    changeRate: Number(changeRate) / 100
  };
};

const normalizeStockCode = (raw: string): { symbol: string; secid?: string } => {
  const value = raw.trim();
  if (value.includes('.')) {
    const [market, symbol] = value.split('.');
    return { symbol: symbol ?? value.slice(-6), secid: `${market}.${symbol ?? value.slice(-6)}` };
  }

  if (/^[01679]/.test(value) && value.length >= 7) {
    return { symbol: value.slice(0, 6), secid: `1.${value.slice(0, 6)}` };
  }

  if (/^[03]/.test(value) && value.length >= 7) {
    return { symbol: value.slice(0, 6), secid: `0.${value.slice(0, 6)}` };
  }

  return { symbol: value.slice(0, 6) };
};

const parseFundName = (script: string, client: EastmoneyClient): string => {
  return client.getScriptVariable<string>(script, 'fS_name') ?? '未知基金';
};

const parseFundNavHistory = (script: string, client: EastmoneyClient): FundNavPoint[] => {
  const trend = client.getScriptVariable<Array<{ x: number; y: number; equityReturn?: number }>>(script, 'Data_netWorthTrend') ?? [];

  return trend
    .map((item, index) => {
      const previous = trend[index - 1]?.y ?? item.y;
      const dailyReturn = previous === 0 ? 0 : item.y / previous - 1;
      return {
        date: formatDate(item.x),
        nav: Number(item.y.toFixed(4)),
        dailyReturn: Number(dailyReturn.toFixed(6))
      } satisfies FundNavPoint;
    })
    .filter((point) => Number.isFinite(point.nav));
};

const parseFundHoldings = (script: string, client: EastmoneyClient): FundHolding[] => {
  const stockCodesNew = client.getScriptVariable<string[]>(script, 'stockCodesNew') ?? [];
  const positions = client.getScriptVariable<{ series?: Array<{ data?: number[] }> }>(script, 'Data_fundSharesPositions');
  const latestPositionList = positions?.series?.[0]?.data;

  if (stockCodesNew.length === 0) {
    return [];
  }

  const equalWeight = latestPositionList && latestPositionList.length > 0 ? undefined : 1 / stockCodesNew.length;
  return stockCodesNew.slice(0, 10).map((code, index) => {
    const normalized = normalizeStockCode(code);
    const hintedWeight = latestPositionList?.[index];
    const weight = hintedWeight !== undefined ? hintedWeight / 100 : equalWeight ?? 0;

    return {
      stockSymbol: normalized.symbol,
      secid: normalized.secid,
      weight: Number(weight.toFixed(4))
    } satisfies FundHolding;
  });
};

const parseStockPosition = (script: string, client: EastmoneyClient): number | undefined => {
  const allocation = client.getScriptVariable<{ series?: Array<{ name?: string; data?: number[] }> }>(script, 'Data_assetAllocation');
  const stockSeries = allocation?.series?.find((item) => item.name?.includes('股票'));
  const latest = stockSeries?.data?.at(-1);
  return latest !== undefined ? Number((latest / 100).toFixed(4)) : undefined;
};

const quoteFromResponse = (secid: string, data: Record<string, unknown>): RealtimeQuote => {
  const latestPrice = Number(data.f43 ?? 0) / 100;
  const previousClose = Number(data.f46 ?? 0) / 100;
  return {
    symbol: String(data.f57 ?? secid.split('.')[1] ?? secid),
    secid,
    name: String(data.f58 ?? secid),
    latestPrice,
    openPrice: Number(data.f17 ?? 0) / 100,
    highPrice: Number(data.f44 ?? 0) / 100,
    lowPrice: Number(data.f45 ?? 0) / 100,
    previousClose,
    changeRate: Number(data.f170 ?? 0) / 100,
    amount: Number(data.f48 ?? 0)
  };
};

export const fetchStocks = async (): Promise<Stock[]> => {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 120);

  // 使用 batchedMap 替代 Promise.all，避免同时发起 5 个并发请求（修复问题10）
  return batchedMap(defaultStockUniverse, async (item) => {
    const response = await eastmoneyClient.getKlines(item.secid, toCompactDate(startDate), toCompactDate(endDate));
    const data = response.data;
    if (!data?.klines) {
      throw new Error(`未获取到股票数据: ${item.symbol}`);
    }
    return {
      symbol: item.symbol,
      name: data.name,
      sector: item.sector,
      bars: data.klines.map(parseKline)
    } satisfies Stock;
  });
};

export const fetchEtfs = async (): Promise<Etf[]> => {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 120);

  // ETF 数量少，每批 2 个（修复问题10）
  return batchedMap(defaultEtfUniverse, async (item) => {
    const response = await eastmoneyClient.getKlines(item.secid, toCompactDate(startDate), toCompactDate(endDate));
    const data = response.data;
    if (!data?.klines) {
      throw new Error(`未获取到 ETF 数据: ${item.symbol}`);
    }
    return {
      symbol: item.symbol,
      name: data.name,
      benchmark: item.benchmark,
      bars: data.klines.map(parseKline)
    } satisfies Etf;
  });
};

export const fetchFunds = async (): Promise<Fund[]> => {
  const universe = fundUniverseManager.getAll();
  // 基金脚本文件较大，每批 1 个串行拉取，避免并发触发限流
  const results = await batchedMap(
    universe,
    async (item) => {
      const script = await eastmoneyClient.getFundScript(item.code);
      const navHistory = parseFundNavHistory(script, eastmoneyClient).slice(-240);
      const holdings = parseFundHoldings(script, eastmoneyClient);
      const stockPosition = parseStockPosition(script, eastmoneyClient);

      return {
        code: item.code,
        name: parseFundName(script, eastmoneyClient),
        category: item.category,
        benchmark: item.benchmark,
        benchmarkEtfSymbol: item.benchmarkEtfSymbol,
        riskLevel: item.riskLevel,
        source: 'Eastmoney',
        stockPosition,
        holdings,
        navHistory
      } satisfies Fund;
    },
    1, // batchSize=1：基金脚本逐个串行拉取
    500 // delayMs=500ms：基金接口间隔更长
  );

  return results.filter((fund) => fund.navHistory.length > 20);
};

export const fetchFundEstimate = async (code: string): Promise<EastmoneyFundEstimate> => {
  return eastmoneyClient.getFundEstimate(code);
};

/** 单独获取一只基金的完整数据（用于添加基金时验证） */
export const fetchSingleFund = async (entry: FundEntry): Promise<Fund | null> => {
  try {
    const script = await eastmoneyClient.getFundScript(entry.code);
    const navHistory = parseFundNavHistory(script, eastmoneyClient).slice(-240);
    if (navHistory.length < 20) return null;
    const holdings = parseFundHoldings(script, eastmoneyClient);
    const stockPosition = parseStockPosition(script, eastmoneyClient);
    return {
      code: entry.code,
      name: parseFundName(script, eastmoneyClient),
      category: entry.category,
      benchmark: entry.benchmark,
      benchmarkEtfSymbol: entry.benchmarkEtfSymbol,
      riskLevel: entry.riskLevel,
      source: 'Eastmoney',
      stockPosition,
      holdings,
      navHistory
    } satisfies Fund;
  } catch {
    return null;
  }
};

export const fetchRealtimeQuotes = async (secids: string[]): Promise<RealtimeQuote[]> => {
  // 实时行情也分批拉取（修复问题10）
  return batchedMap(secids, async (secid) => {
    const response = await eastmoneyClient.getQuote(secid);
    const data = response.data;
    if (!data) {
      throw new Error(`未获取到实时行情: ${secid}`);
    }
    return quoteFromResponse(secid, data);
  });
};