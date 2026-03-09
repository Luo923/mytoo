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