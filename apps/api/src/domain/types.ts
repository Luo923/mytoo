export type MarketDailyBar = {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  changeRate: number;
  volume?: number;
  amount?: number;
};

export type Stock = {
  symbol: string;
  name: string;
  sector: string;
  bars: MarketDailyBar[];
};

export type Etf = {
  symbol: string;
  name: string;
  benchmark: string;
  bars: MarketDailyBar[];
};

export type FundHolding = {
  stockSymbol: string;
  secid?: string;
  weight: number;
};

export type FundNavPoint = {
  date: string;
  nav: number;
  dailyReturn: number;
};

export type Fund = {
  code: string;
  name: string;
  category: string;
  benchmark: string;
  benchmarkEtfSymbol?: string;
  riskLevel: '低' | '中' | '高';
  source?: string;
  stockPosition?: number;
  holdings: FundHolding[];
  navHistory: FundNavPoint[];
};

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

export type RealtimeQuote = {
  symbol: string;
  secid: string;
  name: string;
  latestPrice: number;
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  previousClose?: number;
  changeRate: number;
  amount?: number;
};

export type BacktestSummary = {
  annualizedReturn: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
};

export type StrategyParameters = {
  momentumWindow: number;
  riskWindow: number;
  rebalanceInterval: number;
  topN: number;
  maxDrawdownThreshold: number;
};

export type StrategyResearchResult = {
  strategyName: string;
  params: StrategyParameters;
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
  backtestSummary: BacktestSummary;
  strategy?: StrategyResearchResult;
};

export type DashboardSnapshot = {
  generatedAt: string;
  dataMode?: 'real' | 'fallback';
  dataSources?: string[];
  warnings?: string[];
  funds: Fund[];
  etfs?: Etf[];
  scores: FundScore[];
  navEstimates: NavEstimate[];
  advice: PortfolioAdvice;
  strategyResearch?: StrategyResearchResult;
  dailyInstructions?: DailyInstruction[];
};