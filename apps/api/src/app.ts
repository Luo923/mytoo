import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dashboardRouter } from './routes/dashboard.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use('/api', dashboardRouter);

  // 生产环境：serve 前端静态构建产物
  if (process.env.NODE_ENV === 'production') {
    const webDist = path.resolve(fileURLToPath(import.meta.url), '../../../web/dist');
    app.use(express.static(webDist));
    // SPA 回退：所有非 API 路由返回 index.html
    app.get('/{*path}', (_request, response) => {
      response.sendFile(path.join(webDist, 'index.html'));
    });
  }

  // Express 5 错误处理中间件：必须保持 4 参数签名，显式声明类型避免签名被优化掉
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    console.error('[API 错误]', error instanceof Error ? error.stack : error);
    response.status(500).json({ message });
  };
  app.use(errorHandler);

  return app;
};