
import { etfs as fallbackEtfs, funds as fallbackFunds, stocks as fallbackStocks } from '../data/sample-data.js';
import { runWalkForwardResearch } from '../backtest/walk-forward.js';
import { fetchEtfs, fetchFunds, fetchFundEstimate, fetchRealtimeQuotes, fetchStocks } from '../providers/market-provider.js';
import { loadLatestSnapshot, saveLatestSnapshot } from '../storage/snapshot-repository.js';
import { average, clamp, maxDrawdown, stdDev } from '../utils/math.js';
import type {
  BacktestSummary,
  DashboardSnapshot,
  DailyInstruction,
  Etf,
  FactorBreakdown,
  Fund,
  FundScore,
  NavEstimate,
  PortfolioAdvice,
  RealtimeQuote,
  Stock
} from '../types.js';

// ─── 内部工具函数（直接使用 utils/math.ts 导入，不再重复定义） ───────────────

type AnalyticsContext = {
  stocks: Stock[];
  funds: Fund[];
  etfs: Etf[];
  realtimeQuotes: RealtimeQuote[];
  dataMode: 'real' | 'fallback';
  dataSources: string[];
  warnings: string[];
};

// ─── 因子权重常量（统一唯一定义，修复问题6） ─────────────────────────────────
const SCORE_WEIGHTS = {
  momentum: 0.28,
  drawdownControl: 0.18,
  volatilityControl: 0.18,
  benchmarkStrength: 0.14,
  holdingResonance: 0.22
} as const;

// ─── 净值估算权重常量（统一唯一定义，修复问题7中权重不一致） ─────────────────
const NAV_ESTIMATE_WEIGHTS = {
  stockProxy: 0.65,
  benchmark: 0.35
} as const;

const getLatestChangeRateByStock = (stocks: Stock[]): Map<string, number> =>
  new Map(stocks.map((stock) => [stock.symbol, stock.bars.at(-1)?.changeRate ?? 0]));

const getLatestChangeRateByBenchmark = (etfs: Etf[]): Map<string, number> =>
  new Map(etfs.map((etf) => [etf.benchmark, etf.bars.at(-1)?.changeRate ?? 0]));

const resolveHoldingResonance = (fund: Fund, latestChangeRateByStock: Map<string, number>): number => {
  const weightedMove = fund.holdings.reduce((sum, holding) => {
    const latestRate = latestChangeRateByStock.get(holding.stockSymbol) ?? 0;
    return sum + latestRate * holding.weight;
  }, 0);

  return clamp(60 + weightedMove * 1800, 0, 100);
};

const resolveBreakdown = (
  fund: Fund,
  latestChangeRateByStock: Map<string, number>,
  latestChangeRateByBenchmark: Map<string, number>
): FactorBreakdown => {
  const returns = fund.navHistory.map((point) => point.dailyReturn);
  const benchmarkStrength = clamp(55 + (latestChangeRateByBenchmark.get(fund.benchmark) ?? 0) * 1200, 0, 100);
  const momentum = clamp(50 + average(returns) * 2200, 0, 100);
  const drawdownControl = clamp(100 - maxDrawdown(returns) * 350, 0, 100);
  const volatilityControl = clamp(100 - stdDev(returns) * 2600, 0, 100);
  const holdingResonance = resolveHoldingResonance(fund, latestChangeRateByStock);

  return {
    momentum,
    drawdownControl,
    volatilityControl,
    benchmarkStrength,
    holdingResonance
  };
};

const reasoningByFund = (fund: Fund, breakdown: FactorBreakdown): string[] => {
  const reasons: string[] = [];

  if (breakdown.momentum >= 70) reasons.push('近期净值动量较强');
  if (breakdown.drawdownControl >= 70) reasons.push('历史回撤控制稳定');
  if (breakdown.volatilityControl >= 70) reasons.push('波动率控制较好');
  if (breakdown.holdingResonance >= 70) reasons.push('持仓与最新市场风格共振较强');
  if (fund.riskLevel === '高') reasons.push('高风险基金，建议控制单标的仓位');
  if (reasons.length === 0) reasons.push('综合指标中性，适合作为观察标的');

  return reasons;
};

// ─── 通用评分（接受上下文参数，修复问题1：4个独立路由也可传入真实数据） ──────

const scoreFundsWithData = (funds: Fund[], stocks: Stock[], etfs: Etf[]): FundScore[] => {
  // 提前计算 Map，避免在 reduce 内重复创建（修复问题12）
  const latestChangeRateByStock = getLatestChangeRateByStock(stocks);
  const latestChangeRateByBenchmark = getLatestChangeRateByBenchmark(etfs);

  return funds
    .map((fund) => {
      const breakdown = resolveBreakdown(fund, latestChangeRateByStock, latestChangeRateByBenchmark);
      const totalScore = Number(
        (
          breakdown.momentum * SCORE_WEIGHTS.momentum +
          breakdown.drawdownControl * SCORE_WEIGHTS.drawdownControl +
          breakdown.volatilityControl * SCORE_WEIGHTS.volatilityControl +
          breakdown.benchmarkStrength * SCORE_WEIGHTS.benchmarkStrength +
          breakdown.holdingResonance * SCORE_WEIGHTS.holdingResonance
        ).toFixed(2)
      );

      return {
        fundCode: fund.code,
        totalScore,
        breakdown,
        reasoning: reasoningByFund(fund, breakdown)
      } satisfies FundScore;
    })
    .sort((left, right) => right.totalScore - left.totalScore);
};

// 面向独立接口的公开导出：无参版本使用 fallback 数据
export const scoreFunds = (): FundScore[] =>
  scoreFundsWithData(fallbackFunds, fallbackStocks, fallbackEtfs);

// 异步版本：支持传入真实数据上下文
export const scoreFundsLive = async (): Promise<FundScore[]> => {
  const ctx = await buildContext();
  return scoreFundsWithData(ctx.funds, ctx.stocks, ctx.etfs);
};

// ─── 净值估算（通用实现） ──────────────────────────────────────────────────────

const estimateFundNavWithData = (funds: Fund[], stocks: Stock[], etfs: Etf[]): NavEstimate[] => {
  // 提前计算 Map，避免在 reduce 内重复创建（修复问题12）
  const stockChangeMap = getLatestChangeRateByStock(stocks);
  const benchmarkMap = getLatestChangeRateByBenchmark(etfs);

  return funds.map((fund) => {
    const stockWeightedMove = fund.holdings.reduce((sum, holding) => {
      return sum + (stockChangeMap.get(holding.stockSymbol) ?? 0) * holding.weight;
    }, 0);

    const benchmarkMove = benchmarkMap.get(fund.benchmark) ?? 0;
    // 使用统一权重常量（修复问题7）
    const estimatedChangeRate = Number(
      (stockWeightedMove * NAV_ESTIMATE_WEIGHTS.stockProxy + benchmarkMove * NAV_ESTIMATE_WEIGHTS.benchmark).toFixed(4)
    );
    const confidence = Number(clamp(0.55 + fund.holdings.length * 0.08, 0, 0.92).toFixed(2));

    return {
      fundCode: fund.code,
      estimateDate: new Date().toISOString().slice(0, 10), // 修复问题7：使用当前日期
      estimatedChangeRate,
      confidence,
      drivers: [
        `股票持仓代理贡献 ${(stockWeightedMove * 100).toFixed(2)}%`,
        `基准 ${fund.benchmark} 贡献 ${(benchmarkMove * 100).toFixed(2)}%`
      ]
    } satisfies NavEstimate;
  });
};

export const estimateFundNav = (): NavEstimate[] =>
  estimateFundNavWithData(fallbackFunds, fallbackStocks, fallbackEtfs);

// 异步版本：支持传入真实数据上下文
export const estimateFundNavLive = async (): Promise<NavEstimate[]> => {
  const ctx = await buildContext();
  return estimateFundNavWithData(ctx.funds, ctx.stocks, ctx.etfs);
};

// ─── 回测摘要（修复问题4：先合并成组合日收益时间序列，再计算回撤和波动率） ───

const buildPortfolioReturnSeries = (funds: Fund[]): number[] => {
  if (funds.length === 0) return [];
  const minLength = Math.min(...funds.map((fund) => fund.navHistory.length));
  const series: number[] = [];
  for (let index = 0; index < minLength; index += 1) {
    const dailyReturn = average(funds.map((fund) => fund.navHistory[index]?.dailyReturn ?? 0));
    series.push(dailyReturn);
  }
  return series;
};

const computeSeriesMetrics = (returns: number[]): BacktestSummary => {
  const annualizedReturn = Number((average(returns) * 252).toFixed(4));
  const drawdown = Number(maxDrawdown(returns).toFixed(4));
  const volatility = stdDev(returns);
  const sharpe = Number((annualizedReturn / Math.max(volatility * Math.sqrt(252), 0.0001)).toFixed(4));
  const winRate = Number((returns.filter((value) => value > 0).length / Math.max(returns.length, 1)).toFixed(4));
  return { annualizedReturn, maxDrawdown: drawdown, sharpe, winRate };
};

export const summarizeBacktest = (): BacktestSummary => {
  // 修复问题4：先构建组合日收益时间序列，再计算指标
  const portfolioSeries = buildPortfolioReturnSeries(fallbackFunds);
  return computeSeriesMetrics(portfolioSeries);
};

// ─── 凯利分数 ─────────────────────────────────────────────────────────────────

const resolveKellyFraction = (backtest: BacktestSummary): number => {
  const winRate = backtest.winRate;
  const payoffRatio = Math.max(backtest.annualizedReturn / Math.max(backtest.maxDrawdown, 0.01), 0.4);
  const fullKelly = ((payoffRatio * winRate) - (1 - winRate)) / payoffRatio;
  return Number(clamp(fullKelly * 0.5, 0, 0.85).toFixed(4));
};

export const buildPortfolioAdvice = (): PortfolioAdvice => {
  const scores = scoreFunds();
  const estimates = estimateFundNav();
  const backtest = summarizeBacktest();
  const kellyFraction = resolveKellyFraction(backtest);
  const topFunds = scores.slice(0, 3);
  const scoreSum = topFunds.reduce((sum, item) => sum + item.totalScore, 0) || 1;

  const suggestedFunds = topFunds.map((item) => {
    const fund = fallbackFunds.find((candidate) => candidate.code === item.fundCode);
    const estimate = estimates.find((candidate) => candidate.fundCode === item.fundCode);
    const normalizedWeight = (item.totalScore / scoreSum) * kellyFraction;
    const cappedWeight = Number(clamp(normalizedWeight, 0, 0.4).toFixed(4));

    return {
      fundCode: item.fundCode,
      fundName: fund?.name ?? item.fundCode,
      weight: cappedWeight,
      score: item.totalScore,
      estimatedChangeRate: estimate?.estimatedChangeRate ?? 0
    };
  });

  const totalExposure = Number(suggestedFunds.reduce((sum, item) => sum + item.weight, 0).toFixed(4));
  const warnings = [
    '当前为样例数据推导结果，需接入真实行情后再用于研究。',
    '场外基金净值变化为估算值，不代表官方当日净值。'
  ];

  if (backtest.maxDrawdown > 0.12) {
    warnings.push('历史最大回撤偏高，建议进一步压低总仓位。');
  }

  return {
    generatedAt: new Date().toISOString(), // 修复问题7：使用当前时间
    totalExposure,
    kellyFraction,
    suggestedFunds,
    warnings,
    backtestSummary: backtest
  };
};

export const buildDashboardSnapshot = (): DashboardSnapshot => {
  return {
    generatedAt: new Date().toISOString(), // 修复问题7：使用当前时间
    dataMode: 'fallback',
    dataSources: ['sample-data'],
    warnings: ['当前为内置样例数据。'],
    funds: fallbackFunds,
    scores: scoreFunds(),
    navEstimates: estimateFundNav(),
    advice: buildPortfolioAdvice()
  };
};

export const listStocks = (): Stock[] => fallbackStocks;

// ─── 策略参数搜索 ─────────────────────────────────────────────────────────────

const buildResearchGrid = (funds: Fund[]): Array<{
  momentumWindow: number;
  riskWindow: number;
  rebalanceInterval: number;
  topN: number;
  maxDrawdownThreshold: number;
}> => {
  const momentumWindows = [20, 40, 60];
  const riskWindows = [60, 90, 120];
  const rebalanceIntervals = [5, 10, 20];
  const topNs = [1, 2, 3];
  const drawdowns = [0.08, 0.12, 0.16];
  const minHistory = Math.max(...riskWindows) + 5;

  if (funds.some((fund) => fund.navHistory.length < minHistory)) {
    return [{ momentumWindow: 20, riskWindow: 60, rebalanceInterval: 10, topN: 2, maxDrawdownThreshold: 0.12 }];
  }

  return momentumWindows.flatMap((momentumWindow) =>
    riskWindows.flatMap((riskWindow) =>
      rebalanceIntervals.flatMap((rebalanceInterval) =>
        topNs.flatMap((topN) =>
          drawdowns.map((maxDrawdownThreshold) => ({
            momentumWindow,
            riskWindow,
            rebalanceInterval,
            topN,
            maxDrawdownThreshold
          }))
        )
      )
    )
  );
};

const normalizeFundSeries = (fund: Fund): number[] => fund.navHistory.map((point) => point.dailyReturn);

const runStrategyResearch = (funds: Fund[]) => {
  const candidates = buildResearchGrid(funds);
  let bestResult: PortfolioAdvice['strategy'] = undefined;

  for (const params of candidates) {
    const minLength = Math.min(...funds.map((fund) => fund.navHistory.length));
    const returnsSeries: number[] = [];
    let equity = 1;
    const equityCurve: Array<{ date: string; value: number }> = [];

    for (let index = params.riskWindow; index < minLength; index += 1) {
      const scoredFunds = funds
        .map((fund) => {
          const series = normalizeFundSeries(fund);
          const momentumSlice = series.slice(index - params.momentumWindow, index);
          const riskSlice = series.slice(index - params.riskWindow, index);
          const momentum = average(momentumSlice);
          const drawdown = maxDrawdown(riskSlice);
          const volatility = stdDev(riskSlice);
          const score = momentum * 2400 - drawdown * 200 - volatility * 800;
          return { fund, score, drawdown };
        })
        .filter((item) => item.drawdown <= params.maxDrawdownThreshold)
        .sort((left, right) => right.score - left.score)
        .slice(0, params.topN);

      const chosen = scoredFunds.length > 0 ? scoredFunds : funds.map((fund) => ({ fund, score: 0, drawdown: 0 })).slice(0, params.topN);
      const dailyReturn = average(chosen.map((item) => item.fund.navHistory[index]?.dailyReturn ?? 0));
      returnsSeries.push(dailyReturn);
      equity *= 1 + dailyReturn;
      const date = chosen[0]?.fund.navHistory[index]?.date ?? funds[0]?.navHistory[index]?.date ?? `T${index}`;
      equityCurve.push({ date, value: Number(equity.toFixed(4)) });
    }

    const metrics = computeSeriesMetrics(returnsSeries);
    const score = Number((metrics.annualizedReturn * 1.6 + metrics.sharpe * 0.35 - metrics.maxDrawdown * 1.8 + metrics.winRate * 0.4).toFixed(4));
    const selectedFundCodes = funds
      .map((fund) => ({ fund, avgReturn: average(normalizeFundSeries(fund).slice(-params.momentumWindow)) }))
      .sort((left, right) => right.avgReturn - left.avgReturn)
      .slice(0, params.topN)
      .map((item) => item.fund.code);

    const candidate = {
      strategyName: '基金动量-回撤约束策略',
      params,
      annualizedReturn: metrics.annualizedReturn,
      maxDrawdown: metrics.maxDrawdown,
      sharpe: metrics.sharpe,
      winRate: metrics.winRate,
      score,
      selectedFundCodes,
      equityCurve
    };

    if (!bestResult || candidate.score > bestResult.score) {
      bestResult = candidate;
    }
  }

  return bestResult;
};

// ─── 当日研究指示 ─────────────────────────────────────────────────────────────

const resolveAction = (signalScore: number): DailyInstruction['action'] => {
  if (signalScore >= 78) return '优先关注';
  if (signalScore >= 62) return '持有观察';
  if (signalScore >= 48) return '逢高减仓观察';
  return '回避观察';
};

const estimateFundNavWithContext = async (
  funds: Fund[],
  stocks: Stock[],
  etfs: Etf[],
  realtimeQuotes: RealtimeQuote[]
): Promise<NavEstimate[]> => {
  // 提前计算 Map（修复问题12）
  const stockChangeMap = getLatestChangeRateByStock(stocks);
  const realtimeChangeMap = new Map(realtimeQuotes.map((quote) => [quote.symbol, quote.changeRate]));
  const benchmarkMap = getLatestChangeRateByBenchmark(etfs);

  return Promise.all(
    funds.map(async (fund) => {
      const estimate = await fetchFundEstimate(fund.code).catch(() => null);
      const stockWeightedMove = fund.holdings.reduce((sum, holding) => {
        const realtimeRate = realtimeChangeMap.get(holding.stockSymbol);
        const fallbackRate = stockChangeMap.get(holding.stockSymbol) ?? 0;
        return sum + (realtimeRate ?? fallbackRate) * holding.weight;
      }, 0);
      const benchmarkMove = benchmarkMap.get(fund.benchmark) ?? 0;
      // 使用统一权重常量（修复问题7）
      const estimatedChangeRate = estimate
        ? Number(estimate.gszzl) / 100
        : Number((stockWeightedMove * NAV_ESTIMATE_WEIGHTS.stockProxy + benchmarkMove * NAV_ESTIMATE_WEIGHTS.benchmark).toFixed(4));
      const previousNav = estimate ? Number(estimate.dwjz) : fund.navHistory.at(-1)?.nav;
      const estimatedNav = estimate
        ? Number(estimate.gsz)
        : previousNav
          ? Number((previousNav * (1 + estimatedChangeRate)).toFixed(4))
          : undefined;

      return {
        fundCode: fund.code,
        fundName: fund.name,
        estimateDate: estimate?.gztime ?? new Date().toISOString(),
        previousNavDate: estimate?.jzrq ?? fund.navHistory.at(-1)?.date,
        previousNav,
        estimatedNav,
        estimatedChangeRate: Number(estimatedChangeRate.toFixed(4)),
        isOfficial: false,
        isEstimated: true,
        confidence: Number(clamp(0.52 + fund.holdings.length * 0.05 + (estimate ? 0.1 : 0), 0, 0.93).toFixed(2)),
        drivers: [
          `持仓代理贡献 ${(stockWeightedMove * 100).toFixed(2)}%`,
          `基准 ${fund.benchmark} 贡献 ${(benchmarkMove * 100).toFixed(2)}%`,
          estimate ? '已融合天天基金估算值' : '当前仅使用代理模型估算'
        ]
      } satisfies NavEstimate;
    })
  );
};

const buildAdviceWithContext = (
  funds: Fund[],
  scores: FundScore[],
  estimates: NavEstimate[],
  strategy: NonNullable<DashboardSnapshot['strategyResearch']>
): PortfolioAdvice => {
  const backtest = {
    annualizedReturn: strategy.annualizedReturn,
    maxDrawdown: strategy.maxDrawdown,
    sharpe: strategy.sharpe,
    winRate: strategy.winRate
  };
  const kellyFraction = resolveKellyFraction(backtest);
  const selectedCodes = new Set(strategy.selectedFundCodes);
  const topFunds = scores.filter((item) => selectedCodes.has(item.fundCode)).slice(0, strategy.params.topN);
  const scoreSum = topFunds.reduce((sum, item) => sum + item.totalScore, 0) || 1;
  const suggestedFunds = topFunds.map((item) => {
    const fund = funds.find((candidate) => candidate.code === item.fundCode);
    const estimate = estimates.find((candidate) => candidate.fundCode === item.fundCode);
    const normalizedWeight = (item.totalScore / scoreSum) * kellyFraction;
    return {
      fundCode: item.fundCode,
      fundName: fund?.name ?? item.fundCode,
      weight: Number(clamp(normalizedWeight, 0, 0.35).toFixed(4)),
      score: item.totalScore,
      estimatedChangeRate: estimate?.estimatedChangeRate ?? 0
    };
  });

  const totalExposure = Number(suggestedFunds.reduce((sum, item) => sum + item.weight, 0).toFixed(4));
  const warnings = [
    '今日结果基于公开数据研究，不构成投资承诺。',
    '场外基金当日涨跌为估算值，官方净值以盘后披露为准。'
  ];
  if (strategy.maxDrawdown > 0.15) {
    warnings.push('最优历史策略回撤偏大，建议压低总仓位。');
  }

  return {
    generatedAt: new Date().toISOString(),
    totalExposure,
    kellyFraction,
    suggestedFunds,
    warnings,
    backtestSummary: backtest,
    strategy
  };
};

const buildDailyInstructions = (
  funds: Fund[],
  scores: FundScore[],
  estimates: NavEstimate[],
  advice: PortfolioAdvice
): DailyInstruction[] => {
  const adviceMap = new Map(advice.suggestedFunds.map((item) => [item.fundCode, item]));
  return scores.map((score) => {
    const fund = funds.find((item) => item.code === score.fundCode);
    const estimate = estimates.find((item) => item.fundCode === score.fundCode);
    const advised = adviceMap.get(score.fundCode);
    const signalScore = Number((score.totalScore * 0.75 + (estimate?.estimatedChangeRate ?? 0) * 1200 + (estimate?.confidence ?? 0) * 20).toFixed(2));
    return {
      fundCode: score.fundCode,
      fundName: fund?.name ?? score.fundCode,
      action: resolveAction(signalScore),
      targetWeight: advised?.weight ?? 0,
      signalScore,
      estimatedChangeRate: estimate?.estimatedChangeRate ?? 0,
      confidence: estimate?.confidence ?? 0.4,
      reasons: score.reasoning.slice(0, 3)
    } satisfies DailyInstruction;
  });
};

export const buildContext = async (): Promise<AnalyticsContext> => {
  try {
    const [stocks, etfs, funds] = await Promise.all([fetchStocks(), fetchEtfs(), fetchFunds()]);
    const secidSet = new Set<string>();
    for (const fund of funds) {
      for (const holding of fund.holdings) {
        if (holding.secid) secidSet.add(holding.secid);
      }
      const benchmarkEtf = etfs.find((item) => item.symbol === fund.benchmarkEtfSymbol);
      if (benchmarkEtf) {
        const market = benchmarkEtf.symbol.startsWith('5') ? '1' : '0';
        secidSet.add(`${market}.${benchmarkEtf.symbol}`);
      }
    }
    const realtimeQuotes = await fetchRealtimeQuotes([...secidSet]).catch(() => []);

    return {
      stocks,
      etfs,
      funds,
      realtimeQuotes,
      dataMode: 'real',
      dataSources: ['Eastmoney 股票/ETF/基金', '天天基金估值'],
      warnings: ['开放式基金当日变化使用估算值，盘后以官方净值为准。']
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return {
      stocks: fallbackStocks,
      etfs: fallbackEtfs,
      funds: fallbackFunds,
      realtimeQuotes: [],
      dataMode: 'fallback',
      dataSources: ['sample-data'],
      warnings: [`真实数据拉取失败，已回退到样例数据：${message}`]
    };
  }
};

export const buildRealtimeDashboardSnapshot = async (): Promise<DashboardSnapshot> => {
  const cached = await loadLatestSnapshot();
  if (cached) {
    return cached;
  }

  const context = await buildContext();
  // 使用带上下文的通用评分函数（修复问题1/6：与独立路由使用相同权重逻辑）
  const scores = scoreFundsWithData(context.funds, context.stocks, context.etfs);
  const navEstimates = await estimateFundNavWithContext(context.funds, context.stocks, context.etfs, context.realtimeQuotes);
  const strategyResearch = runWalkForwardResearch(context.funds) ?? runStrategyResearch(context.funds);

  if (!strategyResearch) {
    return buildDashboardSnapshot();
  }

  const advice = buildAdviceWithContext(context.funds, scores, navEstimates, strategyResearch);
  const dailyInstructions = buildDailyInstructions(context.funds, scores, navEstimates, advice);

  const snapshot: DashboardSnapshot = {
    generatedAt: new Date().toISOString(),
    dataMode: context.dataMode,
    dataSources: context.dataSources,
    warnings: context.warnings,
    funds: context.funds,
    etfs: context.etfs,
    scores,
    navEstimates,
    advice,
    strategyResearch,
    dailyInstructions
  };

  await saveLatestSnapshot(snapshot);
  return snapshot;
};