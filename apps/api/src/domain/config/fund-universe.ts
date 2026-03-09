export const defaultFundUniverse = [
  {
    code: '005827',
    benchmark: '沪深300',
    benchmarkEtfSymbol: '510300',
    category: '偏股混合',
    riskLevel: '中' as const
  },
  {
    code: '001875',
    benchmark: '沪深300',
    benchmarkEtfSymbol: '510300',
    category: '偏股混合',
    riskLevel: '高' as const
  },
  {
    code: '161725',
    benchmark: '新能源',
    benchmarkEtfSymbol: '515030',
    category: 'LOF',
    riskLevel: '高' as const
  },
  {
    code: '012345',
    benchmark: '沪深300',
    benchmarkEtfSymbol: '510300',
    category: '偏股混合',
    riskLevel: '高' as const
  }
];

export const defaultStockUniverse = [
  { symbol: '600519', secid: '1.600519', sector: '消费' },
  { symbol: '600036', secid: '1.600036', sector: '金融' },
  { symbol: '300750', secid: '0.300750', sector: '新能源' },
  { symbol: '601012', secid: '1.601012', sector: '新能源' },
  { symbol: '000858', secid: '0.000858', sector: '消费' }
];

export const defaultEtfUniverse = [
  { symbol: '510300', secid: '1.510300', benchmark: '沪深300' },
  { symbol: '515030', secid: '1.515030', benchmark: '新能源' }
];