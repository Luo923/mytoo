import { Router } from 'express';
import {
  buildDashboardSnapshot,
  buildPortfolioAdvice,
  buildRealtimeDashboardSnapshot,
  estimateFundNav,
  estimateFundNavLive,
  listStocks,
  scoreFunds,
  scoreFundsLive,
  summarizeBacktest
} from '../domain/services/analytics.js';
import { eastmoneyClient, fetchSingleFund } from '../domain/providers/market-provider.js';
import { fundUniverseManager, inferFundEntry } from '../domain/config/fund-universe-manager.js';
import { clearSnapshotCache } from '../domain/storage/snapshot-repository.js';
import { pickTopRecommendations } from '../domain/services/ranking-scorer.js';
import { portfolioManager } from '../domain/config/portfolio-manager.js';
import type { FundRankItem } from '../domain/providers/eastmoney-client.js';

export const dashboardRouter = Router();

dashboardRouter.get('/health', (_request, response) => {
  response.json({ status: 'ok', service: 'fund-quant-api' });
});

dashboardRouter.get('/dashboard', (_request, response) => {
  response.json(buildDashboardSnapshot());
});

dashboardRouter.get('/dashboard/live', async (_request, response, next) => {
  try {
    response.json(await buildRealtimeDashboardSnapshot());
  } catch (error) {
    next(error);
  }
});

// ─── 基金排行列表 ─────────────────────────────────────────────────────────────
dashboardRouter.get('/funds/ranking', async (request, response, next) => {
  try {
    const type = String(request.query.type ?? 'all');
    const sort = String(request.query.sort ?? '1nzf');
    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(request.query.pageSize) || 20));
    const result = await eastmoneyClient.getFundRanking(type, sort, page, pageSize);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// ─── 基金搜索 ─────────────────────────────────────────────────────────────────
dashboardRouter.get('/funds/search', async (request, response, next) => {
  try {
    const q = String(request.query.q ?? '');
    if (!q.trim()) {
      response.json([]);
      return;
    }
    const results = await eastmoneyClient.searchFunds(q);
    response.json(results);
  } catch (error) {
    next(error);
  }
});

// ─── 当前分析的基金列表 ───────────────────────────────────────────────────────
dashboardRouter.get('/funds/universe', (_request, response) => {
  response.json({
    funds: fundUniverseManager.getAll(),
    count: fundUniverseManager.size
  });
});

// ─── 添加基金到分析列表 ───────────────────────────────────────────────────────
dashboardRouter.post('/funds/add', async (request, response, next) => {
  try {
    const { code, typeDesc } = request.body as { code?: string; typeDesc?: string };
    if (!code || !/^\d{6}$/.test(code)) {
      response.status(400).json({ error: '请提供有效的6位基金代码' });
      return;
    }
    if (fundUniverseManager.has(code)) {
      response.json({ message: '基金已在分析列表中', entry: fundUniverseManager.getAll().find(f => f.code === code) });
      return;
    }
    // 先验证基金能否成功获取数据
    const entry = inferFundEntry(code, typeDesc);
    const fund = await fetchSingleFund(entry);
    if (!fund) {
      response.status(404).json({ error: `无法获取基金 ${code} 的数据，可能代码无效或数据不足` });
      return;
    }
    fundUniverseManager.add(code, typeDesc);
    // 清除快照缓存，下次请求 dashboard/live 时会重新分析
    clearSnapshotCache();
    response.json({ message: `已添加基金 ${fund.name}（${code}）`, entry, fundName: fund.name });
  } catch (error) {
    next(error);
  }
});

// ─── 从分析列表中移除基金 ─────────────────────────────────────────────────────
dashboardRouter.delete('/funds/:code', (request, response) => {
  const { code } = request.params;
  if (fundUniverseManager.remove(code)) {
    clearSnapshotCache();
    response.json({ message: `已移除基金 ${code}` });
  } else {
    response.status(404).json({ error: `基金 ${code} 不在分析列表中` });
  }
});

// ─── 从排行榜批量导入基金到分析列表 ──────────────────────────────────────────
dashboardRouter.post('/funds/import-ranking', async (request, response, next) => {
  try {
    const type = String(request.body?.type ?? 'hh');
    const sort = String(request.body?.sort ?? '1nzf');
    const count = Math.min(30, Math.max(1, Number(request.body?.count) || 10));
    const ranking = await eastmoneyClient.getFundRanking(type, sort, 1, count);
    const entries = ranking.items.map(item => inferFundEntry(item.code));
    fundUniverseManager.replaceAll(entries);
    clearSnapshotCache();
    response.json({
      message: `已导入 ${entries.length} 只基金（${type}类，按${sort}排序前${count}名）`,
      funds: entries
    });
  } catch (error) {
    next(error);
  }
});

// ─── 今日推荐 Top 10（轻量级全市场扫描） ────────────────────────────────────
dashboardRouter.get('/funds/top-picks', async (_request, response, next) => {
  try {
    // 从股票型、混合型、指数型各取 top 100，合并后综合评分
    const types = ['gp', 'hh', 'zs'] as const;
    const allItems: FundRankItem[] = [];
    const fetchPromises = types.map(async (t) => {
      try {
        const res = await eastmoneyClient.getFundRanking(t, '3yzf', 1, 100);
        return res.items;
      } catch {
        return [] as FundRankItem[];
      }
    });
    const results = await Promise.all(fetchPromises);
    for (const items of results) allItems.push(...items);
    // 去重（同一代码可能出现在多个类型中）
    const uniqueMap = new Map<string, FundRankItem>();
    for (const item of allItems) {
      if (!uniqueMap.has(item.code)) uniqueMap.set(item.code, item);
    }
    const uniqueItems = [...uniqueMap.values()];
    const topPicks = pickTopRecommendations(uniqueItems, 10);
    response.json({
      generatedAt: new Date().toISOString(),
      scannedCount: uniqueItems.length,
      recommendations: topPicks,
    });
  } catch (error) {
    next(error);
  }
});

// ─── 持仓管理：查询全部持仓 ──────────────────────────────────────────────────
dashboardRouter.get('/portfolio', (_request, response) => {
  response.json({
    holdings: portfolioManager.getAll(),
    count: portfolioManager.size,
  });
});

// ─── 持仓管理：通过基金代码添加持仓 ──────────────────────────────────────────
dashboardRouter.post('/portfolio/add', async (request, response, next) => {
  try {
    const { code, shares, costPrice } = request.body as {
      code?: string;
      shares?: number;
      costPrice?: number;
    };
    if (!code || !/^\d{6}$/.test(code)) {
      response.status(400).json({ error: '请提供有效的6位基金代码' });
      return;
    }
    // 自动搜索基金名称
    let fundName = code;
    try {
      const searchResults = await eastmoneyClient.searchFunds(code, 0, 1);
      if (searchResults.length > 0) fundName = searchResults[0]!.name;
    } catch { /* 搜索失败时使用代码作为名称 */ }

    const holding = portfolioManager.add(code, fundName, shares ?? 0, costPrice ?? 0);

    // 同时将该基金加入分析列表（便于深度评分）
    if (!fundUniverseManager.has(code)) {
      fundUniverseManager.add(code);
      clearSnapshotCache();
    }

    response.json({ message: `已添加持仓 ${fundName}（${code}）`, holding });
  } catch (error) {
    next(error);
  }
});

// ─── 持仓管理：移除持仓 ──────────────────────────────────────────────────────
dashboardRouter.delete('/portfolio/:code', (request, response) => {
  const { code } = request.params;
  if (portfolioManager.remove(code)) {
    response.json({ message: `已移除持仓 ${code}` });
  } else {
    response.status(404).json({ error: `持仓 ${code} 不存在` });
  }
});

// ─── 持仓分析：对持仓基金进行策略分析 ────────────────────────────────────────
dashboardRouter.get('/portfolio/analysis', async (_request, response, next) => {
  try {
    const holdings = portfolioManager.getAll();
    if (holdings.length === 0) {
      response.json({ holdings: [], scores: [], navEstimates: [], message: '暂无持仓' });
      return;
    }
    // 确保所有持仓基金都在分析列表中
    let needRefresh = false;
    for (const h of holdings) {
      if (!fundUniverseManager.has(h.code)) {
        fundUniverseManager.add(h.code);
        needRefresh = true;
      }
    }
    if (needRefresh) clearSnapshotCache();

    // 获取实时评分和估值
    const [scores, navEstimates] = await Promise.all([
      scoreFundsLive(),
      estimateFundNavLive()
    ]);

    // 只保留持仓基金的数据
    const holdingCodes = new Set(holdings.map(h => h.code));
    const holdingScores = scores.filter(s => holdingCodes.has(s.fundCode));
    const holdingNavEstimates = navEstimates.filter(n => holdingCodes.has(n.fundCode));

    response.json({
      holdings,
      scores: holdingScores,
      navEstimates: holdingNavEstimates,
    });
  } catch (error) {
    next(error);
  }
});

// 独立路由支持 ?live=true 查询参数使用真实数据
dashboardRouter.get('/fund-scores', async (request, response, next) => {
  try {
    const live = request.query.live === 'true';
    response.json(live ? await scoreFundsLive() : scoreFunds());
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get('/nav-estimates', async (request, response, next) => {
  try {
    const live = request.query.live === 'true';
    response.json(live ? await estimateFundNavLive() : estimateFundNav());
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get('/portfolio-advice', (_request, response) => {
  response.json(buildPortfolioAdvice());
});

dashboardRouter.get('/backtest-summary', (_request, response) => {
  response.json(summarizeBacktest());
});

dashboardRouter.get('/stocks', (_request, response) => {
  response.json(listStocks());
});