export type FactorBreakdown = {
  momentum: number;
  drawdownControl: number;
  volatilityControl: number;
  benchmarkStrength: number;
  holdingResonance: number;
};

export type FundScore = {
  fundCode: string;
  totalScore: number;
  breakdown: FactorBreakdown;
  reasoning: string[];
};

export type NavEstimate = {
  fundCode: string;
  fundName?: string;
  estimateDate: string;
  estimatedChangeRate: number;
  previousNavDate?: string;
  previousNav?: number;
  estimatedNav?: number;
  isOfficial?: boolean;
  isEstimated?: boolean;
  confidence: number;
  drivers: string[];
};

export type StrategyResearchResult = {
  strategyName: string;
  params: {
    momentumWindow: number;
    riskWindow: number;
    rebalanceInterval: number;
    topN: number;
    maxDrawdownThreshold: number;
  };
  annualizedReturn: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
  score: number;
  selectedFundCodes: string[];
  equityCurve: Array<{
    date: string;
    value: number;
  }>;
};

export type DailyInstruction = {
  fundCode: string;
  fundName: string;
  action: '优先关注' | '持有观察' | '逢高减仓观察' | '回避观察';
  targetWeight: number;
  signalScore: number;
  estimatedChangeRate: number;
  confidence: number;
  reasons: string[];
};

export type PortfolioAdvice = {
  generatedAt: string;
  totalExposure: number;
  kellyFraction: number;
  suggestedFunds: Array<{
    fundCode: string;
    fundName: string;
    weight: number;
    score: number;
    estimatedChangeRate: number;
  }>;
  warnings: string[];
  backtestSummary: {
    annualizedReturn: number;
    maxDrawdown: number;
    sharpe: number;
    winRate: number;
  };
  strategy?: StrategyResearchResult;
};

// 修复问题15：与后端 domain/types.ts 对齐，补充缺失字段，收紧 riskLevel 类型
export type Fund = {
  code: string;
  name: string;
  category: string;
  benchmark: string;
  benchmarkEtfSymbol?: string;
  riskLevel: '低' | '中' | '高';
  source?: string;
  stockPosition?: number;
  holdings: Array<{
    stockSymbol: string;
    secid?: string;
    weight: number;
  }>;
  navHistory: Array<{
    date: string;
    nav: number;
    dailyReturn: number;
  }>;
};

export type DashboardSnapshot = {
  generatedAt: string;
  dataMode?: 'real' | 'fallback';
  dataSources?: string[];
  warnings?: string[];
  funds: Fund[];
  scores: FundScore[];
  navEstimates: NavEstimate[];
  advice: PortfolioAdvice;
  strategyResearch?: StrategyResearchResult;
  dailyInstructions?: DailyInstruction[];
};

// ─── 基金排行 API 类型 ──────────────────────────────────────────────────────
export type FundRankItem = {
  code: string;
  name: string;
  nav: number;
  navDate: string;
  dailyReturn: number;
  weekReturn: number;
  monthReturn: number;
  threeMonthReturn: number;
  sixMonthReturn: number;
  yearReturn: number;
  ytdReturn: number;
  sinceInception: number;
  establishDate: string;
};

export type FundRankResult = {
  items: FundRankItem[];
  total: number;
  page: number;
  pageSize: number;
};

// ─── 基金搜索 API 类型 ──────────────────────────────────────────────────────
export type FundSearchItem = {
  code: string;
  name: string;
  type: string;
  typeDesc: string;
  company: string;
  manager: string;
  nav: number;
  navDate: string;
  isBuyable: boolean;
};

// ─── 今日推荐评分类型 ───────────────────────────────────────────────────────
export type ScoredRecommendation = {
  code: string;
  name: string;
  score: number;
  rating: '强烈推荐' | '推荐' | '观望';
  action: '可加仓' | '可建仓' | '持有观察' | '暂不操作';
  breakdown: {
    shortMomentum: number;
    midTrend: number;
    longReturn: number;
    consistency: number;
  };
  returns: {
    daily: number;
    week: number;
    month: number;
    threeMonth: number;
    sixMonth: number;
    year: number;
    ytd: number;
  };
  reasons: string[];
};

export type TopPicksResponse = {
  generatedAt: string;
  scannedCount: number;
  recommendations: ScoredRecommendation[];
};

// ─── 持仓管理类型 ───────────────────────────────────────────────────────────
export type Holding = {
  code: string;
  name: string;
  shares: number;
  costPrice: number;
  addedAt: string;
};

export type PortfolioResponse = {
  holdings: Holding[];
  count: number;
};

export type PortfolioAnalysis = {
  holdings: Holding[];
  scores: FundScore[];
  navEstimates: NavEstimate[];
  message?: string;
};