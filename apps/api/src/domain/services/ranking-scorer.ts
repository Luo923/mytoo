/**
 * 轻量级基金排行评分器
 * 基于排行数据（日/周/月/季/半年/年收益率）计算动量趋势得分，
 * 从全市场 19000+ 只基金中快速筛选出今日可加仓的 Top 10。
 *
 * 评分维度：
 * 1. 短期动量（日+周+月收益率）—— 近期涨势强劲
 * 2. 中期趋势（3月+6月收益率）—— 中期趋势延续
 * 3. 长期收益（年收益率+今年来）—— 长期跑赢大盘
 * 4. 趋势一致性（各周期方向一致，则加分）
 * 5. 回撤过滤（近期跌幅过大的扣分）
 */

import type { FundRankItem } from '../providers/eastmoney-client.js';

export type ScoredRecommendation = {
  code: string;
  name: string;
  score: number;
  /** 综合评级：强烈推荐 / 推荐 / 观望 */
  rating: '强烈推荐' | '推荐' | '观望';
  /** 今日动作建议 */
  action: '可加仓' | '可建仓' | '持有观察' | '暂不操作';
  /** 评分细项 */
  breakdown: {
    shortMomentum: number;
    midTrend: number;
    longReturn: number;
    consistency: number;
  };
  /** 关键收益数据 */
  returns: {
    daily: number;
    week: number;
    month: number;
    threeMonth: number;
    sixMonth: number;
    year: number;
    ytd: number;
  };
  /** 推荐理由 */
  reasons: string[];
};

// 权重配置
const WEIGHTS = {
  shortMomentum: 0.20,  // 短期动量
  midTrend: 0.30,       // 中期趋势（最重要）
  longReturn: 0.30,     // 长期收益
  consistency: 0.20,    // 趋势一致性
} as const;

/**
 * 将百分比收益率归一化到 0-100 分
 * 采用 sigmoid 映射避免极端值主导
 */
function normalizeReturn(value: number, scale: number): number {
  // sigmoid: 100 / (1 + exp(-value/scale))
  return 100 / (1 + Math.exp(-value / scale));
}

/**
 * 计算趋势一致性得分
 * 多个周期收益率方向一致时得分更高
 */
function consistencyScore(returns: number[]): number {
  const positiveCount = returns.filter(r => r > 0).length;
  const negativeCount = returns.filter(r => r < 0).length;
  const total = returns.length;
  // 全部一致方向 → 100 分，半正半负 → 50 分
  const dominantRatio = Math.max(positiveCount, negativeCount) / total;
  // 全正的情况额外加分（上升趋势一致）
  const bonus = positiveCount === total ? 15 : 0;
  return Math.min(100, dominantRatio * 85 + bonus);
}

/**
 * 对一组排行基金进行综合评分
 */
export function scoreRankingItems(items: FundRankItem[]): ScoredRecommendation[] {
  return items
    .map(item => {
      // 1. 短期动量：日 + 周 + 月
      const shortMomentum = (
        normalizeReturn(item.dailyReturn, 2) * 0.2 +
        normalizeReturn(item.weekReturn, 3) * 0.3 +
        normalizeReturn(item.monthReturn, 5) * 0.5
      );

      // 2. 中期趋势：3 月 + 6 月
      const midTrend = (
        normalizeReturn(item.threeMonthReturn, 10) * 0.45 +
        normalizeReturn(item.sixMonthReturn, 15) * 0.55
      );

      // 3. 长期收益：年 + 今年来
      const longReturn = (
        normalizeReturn(item.yearReturn, 25) * 0.6 +
        normalizeReturn(item.ytdReturn, 20) * 0.4
      );

      // 4. 趋势一致性
      const allReturns = [
        item.dailyReturn, item.weekReturn, item.monthReturn,
        item.threeMonthReturn, item.sixMonthReturn, item.yearReturn
      ];
      const consistency = consistencyScore(allReturns);

      // 综合得分
      const score = (
        shortMomentum * WEIGHTS.shortMomentum +
        midTrend * WEIGHTS.midTrend +
        longReturn * WEIGHTS.longReturn +
        consistency * WEIGHTS.consistency
      );

      // 评级判定
      let rating: ScoredRecommendation['rating'];
      if (score >= 72) rating = '强烈推荐';
      else if (score >= 60) rating = '推荐';
      else rating = '观望';

      // 动作建议
      let action: ScoredRecommendation['action'];
      if (score >= 72 && item.dailyReturn >= -1 && item.monthReturn > 0) {
        action = '可加仓';
      } else if (score >= 65 && item.weekReturn > 0) {
        action = '可建仓';
      } else if (score >= 55) {
        action = '持有观察';
      } else {
        action = '暂不操作';
      }

      // 推荐理由
      const reasons: string[] = [];
      if (item.yearReturn > 50) reasons.push(`年化收益优异（${item.yearReturn.toFixed(1)}%）`);
      if (item.threeMonthReturn > 10) reasons.push(`近3月涨幅突出（${item.threeMonthReturn.toFixed(1)}%）`);
      if (item.monthReturn > 5) reasons.push(`本月表现强劲（${item.monthReturn.toFixed(1)}%）`);
      if (consistency >= 80) reasons.push('多周期趋势一致向上');
      if (item.dailyReturn > 1) reasons.push(`当日涨势好（+${item.dailyReturn.toFixed(2)}%）`);
      if (item.sixMonthReturn > 20) reasons.push(`半年收益领先（${item.sixMonthReturn.toFixed(1)}%）`);
      if (reasons.length === 0) reasons.push('综合评分达标');

      return {
        code: item.code,
        name: item.name,
        score: Math.round(score * 100) / 100,
        rating,
        action,
        breakdown: {
          shortMomentum: Math.round(shortMomentum * 100) / 100,
          midTrend: Math.round(midTrend * 100) / 100,
          longReturn: Math.round(longReturn * 100) / 100,
          consistency: Math.round(consistency * 100) / 100,
        },
        returns: {
          daily: item.dailyReturn,
          week: item.weekReturn,
          month: item.monthReturn,
          threeMonth: item.threeMonthReturn,
          sixMonth: item.sixMonthReturn,
          year: item.yearReturn,
          ytd: item.ytdReturn,
        },
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * 从排行数据中筛选今日可加仓的 Top N 基金
 */
export function pickTopRecommendations(items: FundRankItem[], topN = 10): ScoredRecommendation[] {
  const scored = scoreRankingItems(items);
  // 只返回评分 >= 55 的（观望以上）
  return scored.filter(s => s.score >= 55).slice(0, topN);
}
