import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, BarChart, Bar } from 'recharts';
import type { DashboardSnapshot } from './types';

// 生产环境同域部署时使用相对路径，开发环境指向本地后端
const API_BASE = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';
const COLORS = ['#4f46e5', '#0ea5e9', '#22c55e', '#f97316'];

// 修复问题7（前端侧）：fallbackData 的 generatedAt 使用运行时当前时间，而非硬编码过去日期
const buildFallbackData = (): DashboardSnapshot => {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    dataMode: 'fallback',
    dataSources: ['sample-data'],
    warnings: ['后端未启动，当前显示空白样例。'],
    funds: [],
    scores: [],
    navEstimates: [],
    advice: {
      generatedAt: now,
      totalExposure: 0,
      kellyFraction: 0,
      suggestedFunds: [],
      warnings: ['后端未启动，当前显示空白样例。'],
      backtestSummary: {
        annualizedReturn: 0,
        maxDrawdown: 0,
        sharpe: 0,
        winRate: 0
      }
    }
  };
};

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

export function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(buildFallbackData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 修复问题14：用 refreshKey 触发手动刷新，每次自增强制 useEffect 重新执行
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/dashboard/live`);
        if (!response.ok) {
          throw new Error(`请求失败：${response.status}`);
        }
        const data = (await response.json()) as DashboardSnapshot;
        setSnapshot(data);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [refreshKey]);

  const navChartData = useMemo(() => {
    const firstFund = snapshot.funds[0];
    return firstFund?.navHistory ?? [];
  }, [snapshot.funds]);

  const strategyCurve = snapshot.strategyResearch?.equityCurve ?? [];

  return (
    <div className="page-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">基金量化研究与策略辅助平台</p>
          <h1>从评分、估值到仓位建议的一体化看板</h1>
          <p className="subtitle">
            当前版本优先读取公开市场数据，对场外基金做历史研究、参数搜索和当日研究指示输出。
          </p>
        </div>
        <div className="hero-meta">
          <div>
            <span>生成时间</span>
            <strong>{new Date(snapshot.generatedAt).toLocaleString('zh-CN')}</strong>
          </div>
          <div>
            <span>数据模式</span>
            <strong>{snapshot.dataMode === 'real' ? '真实数据' : '回退样例'}</strong>
          </div>
          <div>
            <span>总建议仓位</span>
            <strong>{percent(snapshot.advice.totalExposure)}</strong>
          </div>
          <div>
            <span>凯利系数</span>
            <strong>{percent(snapshot.advice.kellyFraction)}</strong>
          </div>
          {/* 修复问题14：手动刷新按钮 */}
          <div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="refresh-btn"
            >
              {loading ? '加载中…' : '刷新数据'}
            </button>
          </div>
        </div>
      </header>

      {loading && <section className="banner info">正在加载看板数据…</section>}
      {error && <section className="banner error">后端加载失败：{error}</section>}
      {snapshot.dataMode === 'fallback' && !loading && !error && (
        <section className="banner info">
          当前使用回退样例数据。如需真实行情，请将服务部署在可访问国内金融 API 的网络环境中。
        </section>
      )}
      {snapshot.warnings?.filter(w => !w.includes('样例数据')).map((warning) => (
        <section key={warning} className="banner info">{warning}</section>
      ))}

      <section className="metrics-grid">
        <article className="metric-card">
          <span>年化收益</span>
          <strong>{percent(snapshot.advice.backtestSummary.annualizedReturn)}</strong>
        </article>
        <article className="metric-card">
          <span>最大回撤</span>
          <strong>{percent(snapshot.advice.backtestSummary.maxDrawdown)}</strong>
        </article>
        <article className="metric-card">
          <span>Sharpe</span>
          <strong>{snapshot.advice.backtestSummary.sharpe.toFixed(2)}</strong>
        </article>
        <article className="metric-card">
          <span>胜率</span>
          <strong>{percent(snapshot.advice.backtestSummary.winRate)}</strong>
        </article>
        <article className="metric-card">
          <span>策略评分</span>
          <strong>{snapshot.strategyResearch?.score.toFixed(2) ?? '--'}</strong>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel tall">
          <div className="panel-header">
            <h2>基金评分排名</h2>
            <span>综合动量、回撤、波动与持仓共振</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>基金代码</th>
                  <th>总分</th>
                  <th>动量</th>
                  <th>回撤</th>
                  <th>波动</th>
                  <th>共振</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.scores.map((score) => (
                  <tr key={score.fundCode}>
                    <td>{score.fundCode}</td>
                    <td>{score.totalScore.toFixed(2)}</td>
                    <td>{score.breakdown.momentum.toFixed(1)}</td>
                    <td>{score.breakdown.drawdownControl.toFixed(1)}</td>
                    <td>{score.breakdown.volatilityControl.toFixed(1)}</td>
                    <td>{score.breakdown.holdingResonance.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>组合建议权重</h2>
            <span>分数凯利 + 单标的仓位上限</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={snapshot.advice.suggestedFunds}
                dataKey="weight"
                nameKey="fundName"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={4}
              >
                {snapshot.advice.suggestedFunds.map((entry, index) => (
                  <Cell key={entry.fundCode} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => percent(value)} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="hint-list">
            {snapshot.advice.suggestedFunds.map((item) => (
              <li key={item.fundCode}>
                <strong>{item.fundName}</strong>
                <span>{percent(item.weight)}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>基金净值变化估算</h2>
            <span>股票持仓代理 + ETF/基准修正</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={snapshot.navEstimates}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23304b" />
              <XAxis dataKey="fundCode" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={percent} />
              <Tooltip formatter={(value: number) => percent(value)} />
              <Bar dataKey="estimatedChangeRate" fill="#22c55e" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="estimate-list">
            {snapshot.navEstimates.map((estimate) => (
              <div key={estimate.fundCode} className="estimate-item">
                <strong>{estimate.fundCode}</strong>
                <span>{percent(estimate.estimatedChangeRate)}</span>
                <small>置信度 {percent(estimate.confidence)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel wide">
          <div className="panel-header">
            <h2>策略研究曲线</h2>
            <span>
              {snapshot.strategyResearch?.strategyName ?? '暂无'}
              {snapshot.strategyResearch
                ? ` · 动量${snapshot.strategyResearch.params.momentumWindow}日 / 风险${snapshot.strategyResearch.params.riskWindow}日 / 调仓${snapshot.strategyResearch.params.rebalanceInterval}日`
                : ''}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={strategyCurve}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#23304b" />
              <XAxis dataKey="date" stroke="#94a3b8" minTickGap={32} />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Area type="monotone" dataKey="value" stroke="#22c55e" fillOpacity={1} fill="url(#equityGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </article>

        <article className="panel wide">
          <div className="panel-header">
            <h2>基金净值历史示意</h2>
            <span>默认展示首只基金的历史净值曲线</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={navChartData}>
              <defs>
                <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#23304b" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Area type="monotone" dataKey="nav" stroke="#818cf8" fillOpacity={1} fill="url(#navGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </article>

        <article className="panel wide">
          <div className="panel-header">
            <h2>当日研究指示</h2>
            <span>基于最优历史策略 + 当日估值代理 + 分数凯利仓位建议</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>基金</th>
                  <th>动作</th>
                  <th>目标权重</th>
                  <th>信号分</th>
                  <th>估算涨跌</th>
                  <th>置信度</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.dailyInstructions?.map((instruction) => (
                  <tr key={instruction.fundCode}>
                    <td>{instruction.fundName}</td>
                    <td>{instruction.action}</td>
                    <td>{percent(instruction.targetWeight)}</td>
                    <td>{instruction.signalScore.toFixed(2)}</td>
                    <td>{percent(instruction.estimatedChangeRate)}</td>
                    <td>{percent(instruction.confidence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel wide">
          <div className="panel-header">
            <h2>风险提示与说明</h2>
            <span>结果仅用于研究与策略辅助</span>
          </div>
          <div className="warning-block">
            {snapshot.advice.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
          <div className="warning-block source-block">
            <p>数据来源：{snapshot.dataSources?.join(' / ') ?? '未知'}</p>
          </div>
          <div className="reason-grid">
            {snapshot.scores.map((score) => (
              <div key={score.fundCode} className="reason-card">
                <h3>{score.fundCode}</h3>
                <ul>
                  {score.reasoning.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}