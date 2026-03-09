/**
 * 持仓管理器
 * 管理用户现有基金持仓，支持按基金代码添加/移除/查询。
 * 持仓数据仅保存在内存中（服务重启后重置）。
 */

export type Holding = {
  code: string;
  name: string;
  /** 持有份额 */
  shares: number;
  /** 成本价（元） */
  costPrice: number;
  /** 添加时间 */
  addedAt: string;
};

class PortfolioManager {
  private holdings = new Map<string, Holding>();

  getAll(): Holding[] {
    return [...this.holdings.values()];
  }

  get size(): number {
    return this.holdings.size;
  }

  has(code: string): boolean {
    return this.holdings.has(code);
  }

  get(code: string): Holding | undefined {
    return this.holdings.get(code);
  }

  add(code: string, name: string, shares = 0, costPrice = 0): Holding {
    const existing = this.holdings.get(code);
    if (existing) {
      // 累加份额，更新成本价（加权平均）
      const totalShares = existing.shares + shares;
      const totalCost = existing.shares * existing.costPrice + shares * costPrice;
      existing.shares = totalShares;
      existing.costPrice = totalShares > 0 ? totalCost / totalShares : 0;
      return existing;
    }
    const holding: Holding = {
      code,
      name,
      shares,
      costPrice,
      addedAt: new Date().toISOString(),
    };
    this.holdings.set(code, holding);
    return holding;
  }

  remove(code: string): boolean {
    return this.holdings.delete(code);
  }

  clear(): void {
    this.holdings.clear();
  }
}

export const portfolioManager = new PortfolioManager();
