import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPortfolioAdvice,
  buildRealtimeDashboardSnapshot,
  estimateFundNav,
  scoreFunds,
  summarizeBacktest
} from '../src/domain/services/analytics.js';

test('基金评分应按分数降序返回', () => {
  const scores = scoreFunds();

  assert.ok(scores.length >= 3);
  assert.ok(scores[0].totalScore >= scores[1].totalScore);
});

test('净值估算应返回置信度与驱动说明', () => {
  const estimates = estimateFundNav();

  assert.ok(estimates.length > 0);
  for (const estimate of estimates) {
    assert.ok(estimate.confidence >= 0.55);
    assert.ok(estimate.drivers.length >= 2);
  }
});

test('组合建议总仓位不应超过 85%', () => {
  const advice = buildPortfolioAdvice();

  assert.ok(advice.totalExposure <= 0.85);
  assert.ok(advice.suggestedFunds.every((item) => item.weight <= 0.4));
});

test('回测摘要应输出关键指标', () => {
  const summary = summarizeBacktest();

  assert.ok(summary.annualizedReturn > 0);
  assert.ok(summary.maxDrawdown >= 0);
  assert.ok(summary.winRate > 0);
});

test('实时看板应返回策略研究与当日指示', async () => {
  const snapshot = await buildRealtimeDashboardSnapshot();

  assert.ok(snapshot.funds.length > 0);
  assert.ok(snapshot.strategyResearch);
  assert.ok(snapshot.dailyInstructions);
  assert.ok(snapshot.dailyInstructions!.length > 0);
  assert.ok(snapshot.strategyResearch!.equityCurve.length > 0);
});