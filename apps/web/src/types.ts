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