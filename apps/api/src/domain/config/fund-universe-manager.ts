import { defaultFundUniverse } from './fund-universe.js';

/**
 * 基金条目配置，用于深度分析。
 * 当用户添加基金时，自动推断或使用默认值填充。
 */
export type FundEntry = {
  code: string;
  benchmark: string;
  benchmarkEtfSymbol: string;
  category: string;
  riskLevel: '低' | '中' | '高';
};

// 基金类型到基准和 ETF 符号的映射
const CATEGORY_DEFAULTS: Record<string, Pick<FundEntry, 'benchmark' | 'benchmarkEtfSymbol' | 'category' | 'riskLevel'>> = {
  '股票型': { benchmark: '沪深300', benchmarkEtfSymbol: '510300', category: '股票型', riskLevel: '高' },
  '混合型-偏股': { benchmark: '沪深300', benchmarkEtfSymbol: '510300', category: '偏股混合', riskLevel: '高' },
  '混合型-偏债': { benchmark: '沪深300', benchmarkEtfSymbol: '510300', category: '偏债混合', riskLevel: '中' },
  '混合型-平衡': { benchmark: '沪深300', benchmarkEtfSymbol: '510300', category: '平衡混合', riskLevel: '中' },
  '混合型-灵活配置': { benchmark: '沪深300', benchmarkEtfSymbol: '510300', category: '灵活配置', riskLevel: '中' },
  '指数型-股票': { benchmark: '沪深300', benchmarkEtfSymbol: '510300', category: '指数型', riskLevel: '高' },
  'QDII-混合偏股': { benchmark: '沪深300', benchmarkEtfSymbol: '510300', category: 'QDII', riskLevel: '高' },
  'QDII': { benchmark: '沪深300', benchmarkEtfSymbol: '510300', category: 'QDII', riskLevel: '高' },
  'LOF': { benchmark: '新能源', benchmarkEtfSymbol: '515030', category: 'LOF', riskLevel: '高' },
  'FOF': { benchmark: '沪深300', benchmarkEtfSymbol: '510300', category: 'FOF', riskLevel: '中' },
};

const FALLBACK_DEFAULTS: Pick<FundEntry, 'benchmark' | 'benchmarkEtfSymbol' | 'category' | 'riskLevel'> = {
  benchmark: '沪深300',
  benchmarkEtfSymbol: '510300',
  category: '偏股混合',
  riskLevel: '中'
};

/**
 * 根据基金类型描述推断基金配置默认值
 */
export const inferFundEntry = (code: string, typeDesc?: string): FundEntry => {
  if (typeDesc) {
    // 尝试精确匹配
    const exact = CATEGORY_DEFAULTS[typeDesc];
    if (exact) return { code, ...exact };
    // 尝试模糊匹配
    for (const [key, defaults] of Object.entries(CATEGORY_DEFAULTS)) {
      if (typeDesc.includes(key) || key.includes(typeDesc)) {
        return { code, ...defaults };
      }
    }
  }
  return { code, ...FALLBACK_DEFAULTS };
};

/**
 * 动态基金宇宙管理器。
 * 维护用户当前关注的基金列表，支持增删查。
 */
class FundUniverseManager {
  private entries: Map<string, FundEntry> = new Map();

  constructor() {
    // 初始化默认基金
    for (const fund of defaultFundUniverse) {
      this.entries.set(fund.code, fund);
    }
  }

  /** 获取当前所有基金条目 */
  getAll(): FundEntry[] {
    return [...this.entries.values()];
  }

  /** 获取基金数量 */
  get size(): number {
    return this.entries.size;
  }

  /** 检查基金是否存在 */
  has(code: string): boolean {
    return this.entries.has(code);
  }

  /** 添加基金，返回添加的条目 */
  add(code: string, typeDesc?: string): FundEntry {
    if (this.entries.has(code)) {
      return this.entries.get(code)!;
    }
    const entry = inferFundEntry(code, typeDesc);
    this.entries.set(code, entry);
    return entry;
  }

  /** 批量添加基金代码 */
  addBatch(codes: Array<{ code: string; typeDesc?: string }>): FundEntry[] {
    return codes.map(({ code, typeDesc }) => this.add(code, typeDesc));
  }

  /** 删除基金 */
  remove(code: string): boolean {
    return this.entries.delete(code);
  }

  /** 重置为默认基金列表 */
  reset(): void {
    this.entries.clear();
    for (const fund of defaultFundUniverse) {
      this.entries.set(fund.code, fund);
    }
  }

  /** 替换整个列表（用于从排行榜批量导入） */
  replaceAll(entries: FundEntry[]): void {
    this.entries.clear();
    for (const entry of entries) {
      this.entries.set(entry.code, entry);
    }
  }
}

// 全局单例
export const fundUniverseManager = new FundUniverseManager();
