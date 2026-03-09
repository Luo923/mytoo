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