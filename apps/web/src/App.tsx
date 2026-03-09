import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, BarChart, Bar } from 'recharts';
import type { DashboardSnapshot, FundRankItem, FundRankResult, FundSearchItem, TopPicksResponse, Holding, PortfolioAnalysis, ScoredRecommendation } from './types';

// 生产环境同域部署时使用相对路径，开发环境指向本地后端
const API_BASE = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';
const COLORS = ['#4f46e5', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1'];

const buildFallbackData = (): DashboardSnapshot => {
  const now = new Date().toISOString();
  return {
    generatedAt: now, dataMode: 'fallback', dataSources: ['sample-data'],
    warnings: ['后端未启动，当前显示空白样例。'], funds: [], scores: [], navEstimates: [],
    advice: {
      generatedAt: now, totalExposure: 0, kellyFraction: 0, suggestedFunds: [],
      warnings: ['后端未启动，当前显示空白样例。'],
      backtestSummary: { annualizedReturn: 0, maxDrawdown: 0, sharpe: 0, winRate: 0 }
    }
  };
};

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

type Tab = 'top-picks' | 'portfolio' | 'dashboard' | 'ranking' | 'search';

// ─── 今日推荐 Top 10 组件 ────────────────────────────────────────────────────
function TopPicksPanel() {
  const [data, setData] = useState<TopPicksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTopPicks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/funds/top-picks`);
      if (!res.ok) throw new Error(`请求失败：${res.status}`);
      setData(await res.json() as TopPicksResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadTopPicks(); }, [loadTopPicks]);

  const ratingClass = (r: ScoredRecommendation) => {
    if (r.rating === '强烈推荐') return 'rating-strong';
    if (r.rating === '推荐') return 'rating-normal';
    return 'rating-watch';
  };

  const actionClass = (r: ScoredRecommendation) => {
    if (r.action === '可加仓' || r.action === '可建仓') return 'action-buy';
    if (r.action === '持有观察') return 'action-hold';
    return 'action-sell';
  };

  return (
    <section className="content-grid">
      <article className="panel wide">
        <div className="panel-header">
          <h2>今日量化策略推荐 Top 10</h2>
          <span>
            {data ? `扫描 ${data.scannedCount} 只基金 · ${new Date(data.generatedAt).toLocaleString('zh-CN')}` : '加载中…'}
            <button className="btn-small" style={{ marginLeft: 12 }} onClick={loadTopPicks} disabled={loading}>
              {loading ? '刷新中…' : '刷新'}
            </button>
          </span>
        </div>
        {loading && <section className="banner info">正在扫描全市场基金（股票型+混合型+指数型），请稍候…</section>}
        {error && <section className="banner error">{error}</section>}
        {data && data.recommendations.length === 0 && !loading && (
          <section className="banner info">当前暂无符合策略条件的推荐基金</section>
        )}
        {data && data.recommendations.length > 0 && (
          <>
            <div className="top-picks-cards">
              {data.recommendations.slice(0, 3).map((r, idx) => (
                <div key={r.code} className={`pick-card pick-card-${idx + 1}`}>
                  <div className="pick-rank">#{idx + 1}</div>
                  <div className="pick-info">
                    <div className="pick-name">{r.name}</div>
                    <div className="pick-code">{r.code}</div>
                  </div>
                  <div className="pick-score">{r.score.toFixed(1)}<small>分</small></div>
                  <div className="pick-badges">
                    <span className={`rating-badge ${ratingClass(r)}`}>{r.rating}</span>
                    <span className={`action-badge ${actionClass(r)}`}>{r.action}</span>
                  </div>
                  <div className="pick-returns">
                    <span className={r.returns.daily >= 0 ? 'text-up' : 'text-down'}>日 {r.returns.daily.toFixed(2)}%</span>
                    <span className={r.returns.month >= 0 ? 'text-up' : 'text-down'}>月 {r.returns.month.toFixed(2)}%</span>
                    <span className={r.returns.threeMonth >= 0 ? 'text-up' : 'text-down'}>3月 {r.returns.threeMonth.toFixed(2)}%</span>
                  </div>
                  <div className="pick-reasons">
                    {r.reasons.map(reason => <span key={reason} className="reason-tag">{reason}</span>)}
                  </div>
                </div>
              ))}
            </div>

            <div className="table-wrapper" style={{ marginTop: 20 }}>
              <table>
                <thead>
                  <tr>
                    <th>排名</th><th>代码</th><th>名称</th><th>综合评分</th>
                    <th>评级</th><th>建议</th>
                    <th>日涨幅</th><th>近1月</th><th>近3月</th><th>近6月</th><th>近1年</th>
                    <th>推荐理由</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recommendations.map((r, idx) => (
                    <tr key={r.code}>
                      <td><strong>{idx + 1}</strong></td>
                      <td>{r.code}</td>
                      <td className="fund-name-cell">{r.name}</td>
                      <td><strong className="score-highlight">{r.score.toFixed(1)}</strong></td>
                      <td><span className={`rating-badge ${ratingClass(r)}`}>{r.rating}</span></td>
                      <td><span className={`action-badge ${actionClass(r)}`}>{r.action}</span></td>
                      <td className={r.returns.daily >= 0 ? 'text-up' : 'text-down'}>{r.returns.daily.toFixed(2)}%</td>
                      <td className={r.returns.month >= 0 ? 'text-up' : 'text-down'}>{r.returns.month.toFixed(2)}%</td>
                      <td className={r.returns.threeMonth >= 0 ? 'text-up' : 'text-down'}>{r.returns.threeMonth.toFixed(2)}%</td>
                      <td className={r.returns.sixMonth >= 0 ? 'text-up' : 'text-down'}>{r.returns.sixMonth.toFixed(2)}%</td>
                      <td className={r.returns.year >= 0 ? 'text-up' : 'text-down'}>{r.returns.year.toFixed(2)}%</td>
                      <td className="reasons-cell">{r.reasons.join('；')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="scoring-legend" style={{ marginTop: 16 }}>
              <h3>评分维度说明</h3>
              <div className="legend-items">
                <div><span className="legend-dot" style={{background:'#4f46e5'}} />短期动量（20%）：日+周+月收益率</div>
                <div><span className="legend-dot" style={{background:'#0ea5e9'}} />中期趋势（30%）：3月+6月收益率</div>
                <div><span className="legend-dot" style={{background:'#22c55e'}} />长期收益（30%）：年收益率+今年来</div>
                <div><span className="legend-dot" style={{background:'#f97316'}} />趋势一致性（20%）：各周期方向一致性</div>
              </div>
            </div>
          </>
        )}
      </article>
    </section>
  );
}

// ─── 我的持仓组件 ────────────────────────────────────────────────────────────
function PortfolioPanel() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [addShares, setAddShares] = useState('');
  const [addCost, setAddCost] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const showMsg = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(null), 3000); };

  const loadHoldings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/portfolio`);
      if (res.ok) {
        const data = await res.json() as { holdings: Holding[] };
        setHoldings(data.holdings);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadHoldings(); }, [loadHoldings]);

  const handleAdd = async () => {
    const code = addCode.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      showMsg('请输入有效的6位基金代码');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/portfolio/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          shares: Number(addShares) || 0,
          costPrice: Number(addCost) || 0,
        })
      });
      const data = await res.json() as { message?: string; error?: string };
      showMsg(data.message ?? data.error ?? '操作完成');
      if (res.ok) {
        setAddCode('');
        setAddShares('');
        setAddCost('');
        void loadHoldings();
      }
    } catch { showMsg('添加失败'); }
  };

  const handleRemove = async (code: string) => {
    try {
      const res = await fetch(`${API_BASE}/portfolio/${code}`, { method: 'DELETE' });
      const data = await res.json() as { message?: string };
      showMsg(data.message ?? '已移除');
      if (res.ok) void loadHoldings();
    } catch { showMsg('移除失败'); }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/portfolio/analysis`);
      if (res.ok) setAnalysis(await res.json() as PortfolioAnalysis);
      else showMsg('分析失败');
    } catch { showMsg('分析请求失败'); }
    finally { setAnalyzing(false); }
  };

  return (
    <section className="content-grid">
      <article className="panel wide">
        <div className="panel-header">
          <h2>我的持仓</h2>
          <span>通过基金代码添加持仓，获取量化策略分析</span>
        </div>

        {message && <section className="banner info">{message}</section>}

        {/* 添加持仓表单 */}
        <div className="portfolio-add-form">
          <input
            type="text" value={addCode} onChange={e => setAddCode(e.target.value)}
            placeholder="基金代码（6位）" maxLength={6}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <input
            type="number" value={addShares} onChange={e => setAddShares(e.target.value)}
            placeholder="持有份额（选填）" min={0} step={0.01}
          />
          <input
            type="number" value={addCost} onChange={e => setAddCost(e.target.value)}
            placeholder="成本价（选填）" min={0} step={0.0001}
          />
          <button onClick={handleAdd}>+ 添加持仓</button>
        </div>

        {/* 持仓列表 */}
        {loading ? (
          <section className="banner info">加载持仓中…</section>
        ) : holdings.length === 0 ? (
          <section className="banner info">暂无持仓，请通过上方输入框添加基金代码</section>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>代码</th><th>名称</th><th>持有份额</th><th>成本价</th><th>添加时间</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {holdings.map(h => (
                    <tr key={h.code}>
                      <td>{h.code}</td>
                      <td className="fund-name-cell">{h.name}</td>
                      <td>{h.shares > 0 ? h.shares.toFixed(2) : '--'}</td>
                      <td>{h.costPrice > 0 ? h.costPrice.toFixed(4) : '--'}</td>
                      <td>{new Date(h.addedAt).toLocaleString('zh-CN')}</td>
                      <td><button className="btn-small btn-danger" onClick={() => handleRemove(h.code)}>移除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button className="analyze-btn" onClick={handleAnalyze} disabled={analyzing}>
                {analyzing ? '分析中（获取实时数据）…' : `对 ${holdings.length} 只持仓基金进行策略分析`}
              </button>
            </div>
          </>
        )}
      </article>

      {/* 持仓分析结果 */}
      {analysis && analysis.scores.length > 0 && (
        <>
          <article className="panel wide">
            <div className="panel-header">
              <h2>持仓策略评分</h2>
              <span>基于动量/回撤/波动/持仓共振等多因子深度评分</span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>基金</th><th>总分</th><th>动量</th><th>回撤</th><th>波动</th><th>基准</th><th>共振</th><th>评语</th></tr>
                </thead>
                <tbody>
                  {analysis.scores.map(s => {
                    const h = analysis.holdings.find(x => x.code === s.fundCode);
                    return (
                      <tr key={s.fundCode}>
                        <td className="fund-name-cell"><strong>{s.fundCode}</strong><small>{h?.name ?? ''}</small></td>
                        <td><strong className="score-highlight">{s.totalScore.toFixed(2)}</strong></td>
                        <td>{s.breakdown.momentum.toFixed(1)}</td>
                        <td>{s.breakdown.drawdownControl.toFixed(1)}</td>
                        <td>{s.breakdown.volatilityControl.toFixed(1)}</td>
                        <td>{s.breakdown.benchmarkStrength.toFixed(1)}</td>
                        <td>{s.breakdown.holdingResonance.toFixed(1)}</td>
                        <td className="reasons-cell">{s.reasoning.slice(0, 2).join('；')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel wide">
            <div className="panel-header">
              <h2>持仓净值变化估算</h2>
              <span>基于股票持仓代理 + ETF/基准修正</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={analysis.navEstimates}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23304b" />
                <XAxis dataKey="fundCode" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={percent} />
                <Tooltip formatter={(value: number) => percent(value)} />
                <Bar dataKey="estimatedChangeRate" fill="#22c55e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </article>
        </>
      )}
    </section>
  );
}

// ─── 基金排行组件 ─────────────────────────────────────────────────────────────
function FundRankingPanel({ onAddFund }: { onAddFund: (code: string) => void }) {
  const [ranking, setRanking] = useState<FundRankResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fundType, setFundType] = useState('hh');
  const [sortBy, setSortBy] = useState('1nzf');
  const [page, setPage] = useState(1);
  const [addingCode, setAddingCode] = useState<string | null>(null);

  const loadRanking = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/funds/ranking?type=${fundType}&sort=${sortBy}&page=${page}&pageSize=20`);
      if (res.ok) setRanking(await res.json() as FundRankResult);
    } finally { setLoading(false); }
  }, [fundType, sortBy, page]);

  useEffect(() => { void loadRanking(); }, [loadRanking]);

  const handleAdd = async (item: FundRankItem) => {
    setAddingCode(item.code);
    try { await onAddFund(item.code); } finally { setAddingCode(null); }
  };

  const totalPages = ranking ? Math.ceil(ranking.total / ranking.pageSize) : 0;

  return (
    <article className="panel wide">
      <div className="panel-header">
        <h2>场外基金排行榜</h2>
        <span>共 {ranking?.total?.toLocaleString() ?? '...'} 只基金</span>
      </div>
      <div className="filter-bar">
        <label>
          类型：
          <select value={fundType} onChange={e => { setFundType(e.target.value); setPage(1); }}>
            <option value="all">全部</option>
            <option value="gp">股票型</option>
            <option value="hh">混合型</option>
            <option value="zq">债券型</option>
            <option value="zs">指数型</option>
            <option value="qdii">QDII</option>
            <option value="fof">FOF</option>
          </select>
        </label>
        <label>
          排序：
          <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}>
            <option value="rzdf">日涨幅</option>
            <option value="zzf">近1周</option>
            <option value="1yzf">近1月</option>
            <option value="3yzf">近3月</option>
            <option value="6yzf">近6月</option>
            <option value="1nzf">近1年</option>
            <option value="jnzf">今年来</option>
          </select>
        </label>
      </div>
      {loading ? (
        <section className="banner info">加载排行数据中…</section>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>排名</th><th>代码</th><th>名称</th><th>净值</th>
                <th>日涨幅</th><th>近1月</th><th>近3月</th>
                <th>近6月</th><th>近1年</th><th>今年来</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {ranking?.items.map((item, idx) => (
                <tr key={item.code}>
                  <td>{(page - 1) * 20 + idx + 1}</td>
                  <td>{item.code}</td>
                  <td className="fund-name-cell">{item.name}</td>
                  <td>{item.nav.toFixed(4)}</td>
                  <td className={item.dailyReturn >= 0 ? 'text-up' : 'text-down'}>{item.dailyReturn.toFixed(2)}%</td>
                  <td className={item.monthReturn >= 0 ? 'text-up' : 'text-down'}>{item.monthReturn.toFixed(2)}%</td>
                  <td className={item.threeMonthReturn >= 0 ? 'text-up' : 'text-down'}>{item.threeMonthReturn.toFixed(2)}%</td>
                  <td className={item.sixMonthReturn >= 0 ? 'text-up' : 'text-down'}>{item.sixMonthReturn.toFixed(2)}%</td>
                  <td className={item.yearReturn >= 0 ? 'text-up' : 'text-down'}>{item.yearReturn.toFixed(2)}%</td>
                  <td className={item.ytdReturn >= 0 ? 'text-up' : 'text-down'}>{item.ytdReturn.toFixed(2)}%</td>
                  <td>
                    <button className="btn-small" onClick={() => handleAdd(item)} disabled={addingCode === item.code}>
                      {addingCode === item.code ? '添加中…' : '+ 分析'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
        <span>第 {page} / {totalPages} 页</span>
        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
      </div>
    </article>
  );
}

// ─── 基金搜索组件 ─────────────────────────────────────────────────────────────
function FundSearchPanel({ onAddFund }: { onAddFund: (code: string, typeDesc?: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FundSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingCode, setAddingCode] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/funds/search?q=${encodeURIComponent(query)}`);
      if (res.ok) setResults(await res.json() as FundSearchItem[]);
    } finally { setLoading(false); }
  };

  const handleAdd = async (item: FundSearchItem) => {
    setAddingCode(item.code);
    try { await onAddFund(item.code, item.typeDesc); } finally { setAddingCode(null); }
  };

  return (
    <article className="panel wide">
      <div className="panel-header">
        <h2>搜索并添加基金</h2>
        <span>输入基金代码、名称或拼音搜索</span>
      </div>
      <div className="search-bar">
        <input
          type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="搜索基金代码/名称/拼音..."
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? '搜索中…' : '搜索'}
        </button>
      </div>
      {results.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>代码</th><th>名称</th><th>类型</th><th>基金公司</th><th>基金经理</th><th>净值</th><th>操作</th></tr>
            </thead>
            <tbody>
              {results.map(item => (
                <tr key={item.code}>
                  <td>{item.code}</td>
                  <td className="fund-name-cell">{item.name}</td>
                  <td>{item.typeDesc}</td>
                  <td>{item.company}</td>
                  <td>{item.manager}</td>
                  <td>{item.nav.toFixed(4)}</td>
                  <td>
                    <button className="btn-small" onClick={() => handleAdd(item)} disabled={addingCode === item.code}>
                      {addingCode === item.code ? '添加中…' : '+ 分析'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

// ─── 主应用 ──────────────────────────────────────────────────────────────────
export function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(buildFallbackData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>('top-picks');
  const [addMessage, setAddMessage] = useState<string | null>(null);

  const handleRefresh = () => setRefreshKey(prev => prev + 1);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/dashboard/live`);
        if (!response.ok) throw new Error(`请求失败：${response.status}`);
        const data = (await response.json()) as DashboardSnapshot;
        setSnapshot(data);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '加载失败');
      } finally { setLoading(false); }
    };
    void loadDashboard();
  }, [refreshKey]);

  const handleAddFund = async (code: string, typeDesc?: string) => {
    try {
      const res = await fetch(`${API_BASE}/funds/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, typeDesc })
      });
      const data = await res.json() as { message?: string; error?: string };
      setAddMessage(data.message ?? data.error ?? '操作完成');
      setTimeout(() => setAddMessage(null), 3000);
      if (res.ok) handleRefresh();
    } catch {
      setAddMessage('添加失败，请检查网络');
      setTimeout(() => setAddMessage(null), 3000);
    }
  };

  const handleRemoveFund = async (code: string) => {
    try {
      const res = await fetch(`${API_BASE}/funds/${code}`, { method: 'DELETE' });
      const data = await res.json() as { message?: string };
      setAddMessage(data.message ?? '操作完成');
      setTimeout(() => setAddMessage(null), 3000);
      if (res.ok) handleRefresh();
    } catch {
      setAddMessage('移除失败');
      setTimeout(() => setAddMessage(null), 3000);
    }
  };

  const navChartData = useMemo(() => {
    const firstFund = snapshot.funds[0];
    return firstFund?.navHistory ?? [];
  }, [snapshot.funds]);

  const strategyCurve = snapshot.strategyResearch?.equityCurve ?? [];
  const top10Scores = useMemo(() => snapshot.scores.slice(0, 10), [snapshot.scores]);

  return (
    <div className="page-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">基金量化研究与策略辅助平台</p>
          <h1>从评分、估值到仓位建议的一体化看板</h1>
          <p className="subtitle">
            每日自动扫描全市场基金，量化策略筛选 Top 10 加仓推荐。支持持仓管理、深度分析、排行浏览和当日研究指示。
          </p>
        </div>
        <div className="hero-meta">
          <div>
            <span>分析基金数</span>
            <strong>{snapshot.funds.length}</strong>
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
          <div>
            <button type="button" onClick={handleRefresh} disabled={loading} className="refresh-btn">
              {loading ? '加载中…' : '刷新数据'}
            </button>
          </div>
        </div>
      </header>

      {addMessage && <section className="banner info">{addMessage}</section>}
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

      {/* 导航标签 */}
      <nav className="tab-bar">
        <button className={activeTab === 'top-picks' ? 'tab active' : 'tab'} onClick={() => setActiveTab('top-picks')}>今日推荐</button>
        <button className={activeTab === 'portfolio' ? 'tab active' : 'tab'} onClick={() => setActiveTab('portfolio')}>我的持仓</button>
        <button className={activeTab === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setActiveTab('dashboard')}>策略看板</button>
        <button className={activeTab === 'ranking' ? 'tab active' : 'tab'} onClick={() => setActiveTab('ranking')}>基金排行</button>
        <button className={activeTab === 'search' ? 'tab active' : 'tab'} onClick={() => setActiveTab('search')}>搜索添加</button>
      </nav>

      {/* ─── 今日推荐 Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'top-picks' && <TopPicksPanel />}

      {/* ─── 我的持仓 Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'portfolio' && <PortfolioPanel />}

      {/* ─── 策略看板 Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <>
          <section className="metrics-grid">
            <article className="metric-card"><span>年化收益</span><strong>{percent(snapshot.advice.backtestSummary.annualizedReturn)}</strong></article>
            <article className="metric-card"><span>最大回撤</span><strong>{percent(snapshot.advice.backtestSummary.maxDrawdown)}</strong></article>
            <article className="metric-card"><span>Sharpe</span><strong>{snapshot.advice.backtestSummary.sharpe.toFixed(2)}</strong></article>
            <article className="metric-card"><span>胜率</span><strong>{percent(snapshot.advice.backtestSummary.winRate)}</strong></article>
            <article className="metric-card"><span>策略评分</span><strong>{snapshot.strategyResearch?.score.toFixed(2) ?? '--'}</strong></article>
          </section>

          <section className="content-grid">
            {/* 基金评分排名（前10） */}
            <article className="panel tall">
              <div className="panel-header">
                <h2>基金评分排名 Top {top10Scores.length}</h2>
                <span>按综合评分降序（共分析 {snapshot.scores.length} 只）</span>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>#</th><th>基金</th><th>总分</th><th>动量</th><th>回撤</th><th>波动</th><th>共振</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {top10Scores.map((score, idx) => {
                      const fund = snapshot.funds.find(f => f.code === score.fundCode);
                      return (
                        <tr key={score.fundCode}>
                          <td>{idx + 1}</td>
                          <td className="fund-name-cell"><strong>{score.fundCode}</strong><small>{fund?.name ?? ''}</small></td>
                          <td><strong>{score.totalScore.toFixed(2)}</strong></td>
                          <td>{score.breakdown.momentum.toFixed(1)}</td>
                          <td>{score.breakdown.drawdownControl.toFixed(1)}</td>
                          <td>{score.breakdown.volatilityControl.toFixed(1)}</td>
                          <td>{score.breakdown.holdingResonance.toFixed(1)}</td>
                          <td><button className="btn-small btn-danger" onClick={() => handleRemoveFund(score.fundCode)}>移除</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>

            {/* 组合建议权重 */}
            <article className="panel">
              <div className="panel-header"><h2>组合建议权重</h2><span>分数凯利 + 单标的仓位上限</span></div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={snapshot.advice.suggestedFunds} dataKey="weight" nameKey="fundName" innerRadius={55} outerRadius={90} paddingAngle={4}>
                    {snapshot.advice.suggestedFunds.map((entry, index) => (
                      <Cell key={entry.fundCode} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => percent(value)} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="hint-list">
                {snapshot.advice.suggestedFunds.map((item) => (
                  <li key={item.fundCode}><strong>{item.fundName}</strong><span>{percent(item.weight)}</span></li>
                ))}
              </ul>
            </article>

            {/* 净值变化估算 */}
            <article className="panel">
              <div className="panel-header"><h2>基金净值变化估算</h2><span>股票持仓代理 + ETF/基准修正</span></div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={snapshot.navEstimates.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#23304b" />
                  <XAxis dataKey="fundCode" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" tickFormatter={percent} />
                  <Tooltip formatter={(value: number) => percent(value)} />
                  <Bar dataKey="estimatedChangeRate" fill="#22c55e" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </article>

            {/* 策略研究曲线 */}
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

            {/* 净值历史 */}
            <article className="panel wide">
              <div className="panel-header"><h2>基金净值历史示意</h2><span>展示评分最高基金的历史净值曲线</span></div>
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

            {/* 当日研究指示 */}
            <article className="panel wide">
              <div className="panel-header"><h2>当日研究指示</h2><span>基于最优历史策略 + 当日估值代理 + 分数凯利仓位建议</span></div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>基金</th><th>动作</th><th>目标权重</th><th>信号分</th><th>估算涨跌</th><th>置信度</th></tr>
                  </thead>
                  <tbody>
                    {snapshot.dailyInstructions?.slice(0, 10).map((instruction) => (
                      <tr key={instruction.fundCode}>
                        <td>{instruction.fundName}</td>
                        <td><span className={`action-badge action-${instruction.action === '优先关注' ? 'buy' : instruction.action === '回避观察' ? 'sell' : 'hold'}`}>{instruction.action}</span></td>
                        <td>{percent(instruction.targetWeight)}</td>
                        <td>{instruction.signalScore.toFixed(2)}</td>
                        <td className={instruction.estimatedChangeRate >= 0 ? 'text-up' : 'text-down'}>{percent(instruction.estimatedChangeRate)}</td>
                        <td>{percent(instruction.confidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            {/* 风险提示 */}
            <article className="panel wide">
              <div className="panel-header"><h2>风险提示与说明</h2><span>结果仅用于研究与策略辅助</span></div>
              <div className="warning-block">
                {snapshot.advice.warnings.map((warning) => (<p key={warning}>{warning}</p>))}
              </div>
              <div className="warning-block source-block">
                <p>数据来源：{snapshot.dataSources?.join(' / ') ?? '未知'}</p>
              </div>
            </article>
          </section>
        </>
      )}

      {/* ─── 基金排行 Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'ranking' && (
        <section className="content-grid">
          <FundRankingPanel onAddFund={(code) => handleAddFund(code)} />
        </section>
      )}

      {/* ─── 搜索添加 Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'search' && (
        <section className="content-grid">
          <FundSearchPanel onAddFund={(code, typeDesc) => handleAddFund(code, typeDesc)} />
        </section>
      )}
    </div>
  );
}