import { createApp } from './app.js';

// 全局未捕获异常处理，避免进程静默崩溃
process.on('uncaughtException', (error) => {
  console.error('[致命错误] 未捕获异常:', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[致命错误] 未处理的 Promise 拒绝:', reason);
});

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

app.listen(port, () => {
  console.log(`fund-quant-api listening on http://localhost:${port}`);
});