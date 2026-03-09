import type { BacktestSummary, Fund, StrategyResearchResult } from '../types.js';
import { average, maxDrawdown, stdDev } from '../utils/math.js';

const summarize = (returns: number[]): BacktestSummary => {
  const annualizedReturn = average(returns) * 252;
  const volatility = stdDev(returns) * Math.sqrt(252);
  return {
    annualizedReturn: Number(annualizedReturn.toFixed(4)),
    maxDrawdown: Number(maxDrawdown(returns).toFixed(4)),
    sharpe: Number((annualizedReturn / Math.max(volatility, 0.0001)).toFixed(4)),
    winRate: Number((returns.filter((value) => value > 0).length / Math.max(returns.length, 1)).toFixed(4))
  };
};

const series = (fund: Fund): number[] => fund.navHistory.map((point) => point.dailyReturn);

export const runWalkForwardResearch = (funds: Fund[]): StrategyResearchResult | null => {
  if (funds.length === 0) return null;
  const minHistory = Math.min(...funds.map((fund) => fund.navHistory.length));
  if (minHistory < 140) return null;

  const trainWindow = 90;
  const validateWindow = 20;
  const momentumWindows = [20, 40, 60];
  const topNs = [1, 2, 3];
  let best: StrategyResearchResult | null = null;

  for (const momentumWindow of momentumWindows) {
    for (const topN of topNs) {
      const returns: number[] = [];
      let equity = 1;
      const equityCurve: Array<{ date: string; value: number }> = [];

      for (let start = trainWindow; start + validateWindow < minHistory; start += validateWindow) {
        const ranked = funds
          .map((fund) => {
            const trailing = series(fund).slice(start - momentumWindow, start);
            return { fund, score: average(trailing) };
          })
          .sort((left, right) => right.score - left.score)
          .slice(0, topN);

        for (let offset = 0; offset < validateWindow; offset += 1) {
          const index = start + offset;
          const bucketReturn = average(ranked.map((item) => item.fund.navHistory[index]?.dailyReturn ?? 0));
          returns.push(bucketReturn);
          equity *= 1 + bucketReturn;
          const date = ranked[0]?.fund.navHistory[index]?.date ?? funds[0]!.navHistory[index]!.date;
          equityCurve.push({ date, value: Number(equity.toFixed(4)) });
        }
      }

      const metrics = summarize(returns);
      const score = Number((metrics.annualizedReturn * 1.4 + metrics.sharpe * 0.4 - metrics.maxDrawdown * 1.8 + metrics.winRate * 0.4).toFixed(4));
      const selectedFundCodes = funds
        .map((fund) => ({ fund, score: average(series(fund).slice(-momentumWindow)) }))
        .sort((left, right) => right.score - left.score)
        .slice(0, topN)
        .map((item) => item.fund.code);

      const candidate: StrategyResearchResult = {
        strategyName: '滚动动量筛选策略',
        params: {
          momentumWindow,
          riskWindow: trainWindow,
          rebalanceInterval: validateWindow,
          topN,
          maxDrawdownThreshold: 0.18
        },
        annualizedReturn: metrics.annualizedReturn,
        maxDrawdown: metrics.maxDrawdown,
        sharpe: metrics.sharpe,
        winRate: metrics.winRate,
        score,
        selectedFundCodes,
        equityCurve
      };

      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }
  }

  return best;
};
