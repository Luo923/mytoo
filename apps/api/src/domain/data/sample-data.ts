import type { Etf, Fund, Stock } from '../types.js';

// 生成相对日期：从当前日期往前推 N 个工作日（简化处理，仅跳过周末）
const recentTradingDates = (count: number): string[] => {
  const dates: string[] = [];
  const cursor = new Date();
  while (dates.length < count) {
    cursor.setDate(cursor.getDate() - 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getDate()).padStart(2, '0');
      dates.unshift(`${yyyy}-${mm}-${dd}`);
    }
  }
  return dates;
};

// 默认使用最近 3 个交易日作为样例数据日期
const [d0, d1, d2] = recentTradingDates(3) as [string, string, string];

export const stocks: Stock[] = [
  {
    symbol: '600519',
    name: '贵州茅台',
    sector: '消费',
    bars: [
      { date: d0, close: 1680, changeRate: 0.012 },
      { date: d1, close: 1698, changeRate: 0.0107 },
      { date: d2, close: 1712, changeRate: 0.0082 }
    ]
  },
  {
    symbol: '300750',
    name: '宁德时代',
    sector: '新能源',
    bars: [
      { date: d0, close: 221, changeRate: 0.016 },
      { date: d1, close: 224, changeRate: 0.0136 },
      { date: d2, close: 226, changeRate: 0.0089 }
    ]
  },
  {
    symbol: '601012',
    name: '隆基绿能',
    sector: '新能源',
    bars: [
      { date: d0, close: 20.2, changeRate: -0.004 },
      { date: d1, close: 20.5, changeRate: 0.0149 },
      { date: d2, close: 20.9, changeRate: 0.0195 }
    ]
  },
  {
    symbol: '600036',
    name: '招商银行',
    sector: '金融',
    bars: [
      { date: d0, close: 43.6, changeRate: 0.003 },
      { date: d1, close: 43.9, changeRate: 0.0069 },
      { date: d2, close: 44.1, changeRate: 0.0046 }
    ]
  },
  {
    symbol: '000858',
    name: '五粮液',
    sector: '消费',
    bars: [
      { date: d0, close: 148.2, changeRate: 0.0051 },
      { date: d1, close: 149.8, changeRate: 0.0108 },
      { date: d2, close: 151.0, changeRate: 0.0080 }
    ]
  }
];

export const etfs: Etf[] = [
  {
    symbol: '510300',
    name: '沪深300ETF',
    benchmark: '沪深300',
    bars: [
      { date: d0, close: 3.86, changeRate: 0.004 },
      { date: d1, close: 3.89, changeRate: 0.0078 },
      { date: d2, close: 3.92, changeRate: 0.0077 }
    ]
  },
  {
    symbol: '515030',
    name: '新能源ETF',
    benchmark: '新能源',
    bars: [
      { date: d0, close: 1.12, changeRate: 0.013 },
      { date: d1, close: 1.14, changeRate: 0.0179 },
      { date: d2, close: 1.16, changeRate: 0.0175 }
    ]
  }
];

export const funds: Fund[] = [
  {
    code: '001875',
    name: '前海开源沪港深优势精选',
    category: '偏股混合',
    benchmark: '沪深300',
    riskLevel: '高',
    holdings: [
      { stockSymbol: '600519', weight: 0.28 },
      { stockSymbol: '600036', weight: 0.18 },
      { stockSymbol: '300750', weight: 0.14 }
    ],
    navHistory: [
      { date: d0, nav: 2.114, dailyReturn: 0.008 },
      { date: d1, nav: 2.139, dailyReturn: 0.0118 },
      { date: d2, nav: 2.162, dailyReturn: 0.0108 }
    ]
  },
  {
    code: '005827',
    name: '易方达蓝筹精选',
    category: '偏股混合',
    benchmark: '沪深300',
    riskLevel: '中',
    holdings: [
      { stockSymbol: '600519', weight: 0.22 },
      { stockSymbol: '600036', weight: 0.22 },
      { stockSymbol: '601012', weight: 0.12 }
    ],
    navHistory: [
      { date: d0, nav: 3.284, dailyReturn: 0.006 },
      { date: d1, nav: 3.305, dailyReturn: 0.0064 },
      { date: d2, nav: 3.331, dailyReturn: 0.0079 }
    ]
  },
  {
    code: '012345',
    name: '嘉实领先优势混合C',
    category: '偏股混合',
    benchmark: '沪深300',
    riskLevel: '高',
    holdings: [
      { stockSymbol: '300750', weight: 0.35 },
      { stockSymbol: '601012', weight: 0.24 }
    ],
    navHistory: [
      { date: d0, nav: 1.628, dailyReturn: 0.0105 },
      { date: d1, nav: 1.654, dailyReturn: 0.016 },
      { date: d2, nav: 1.688, dailyReturn: 0.0206 }
    ]
  }
];