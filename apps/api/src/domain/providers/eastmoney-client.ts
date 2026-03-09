type JsonRecord = Record<string, unknown>;

const DEFAULT_HEADERS = {
  Referer: 'https://fund.eastmoney.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
};

const parseJsonp = <T>(payload: string): T => {
  const start = payload.indexOf('(');
  const end = payload.lastIndexOf(')');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('无法解析 JSONP 响应');
  }
  return JSON.parse(payload.slice(start + 1, end)) as T;
};

const parseScriptVariable = <T>(script: string, variableName: string): T | null => {
  const marker = `var ${variableName} =`;
  const start = script.indexOf(marker);
  if (start < 0) return null;

  let index = start + marker.length;
  while (index < script.length && /\s/.test(script[index]!)) index += 1;
  const opening = script[index];
  if (!opening) return null;

  if (opening === '"') {
    const end = script.indexOf('";', index + 1);
    if (end < 0) return null;
    return JSON.parse(script.slice(index, end + 1)) as T;
  }

  if (opening === '[' || opening === '{') {
    const pair = opening === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let cursor = index; cursor < script.length; cursor += 1) {
      const current = script[cursor]!;
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (current === '"') {
          inString = false;
        }
        continue;
      }

      if (current === '"') {
        inString = true;
        continue;
      }

      if (current === opening) depth += 1;
      if (current === pair) {
        depth -= 1;
        if (depth === 0) {
          return JSON.parse(script.slice(index, cursor + 1)) as T;
        }
      }
    }
  }

  const end = script.indexOf(';', index);
  if (end < 0) return null;
  const raw = script.slice(index, end).trim();
  if (raw === 'null') return null;
  if (raw === 'true' || raw === 'false') return JSON.parse(raw) as T;
  if (!Number.isNaN(Number(raw))) return Number(raw) as T;
  return null;
};

// 请求超时时间（毫秒），海外服务器访问中国金融 API 时可能较慢
const FETCH_TIMEOUT_MS = 15_000;

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetchWithTimeout(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${url}`);
  }
  return response.text();
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetchWithTimeout(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${url}`);
  }
  return (await response.json()) as T;
};

export type EastmoneyKlineResponse = {
  data?: {
    code: string;
    name: string;
    klines: string[];
  };
};

export type EastmoneyQuoteResponse = {
  data?: JsonRecord;
};

export type EastmoneyFundEstimate = {
  fundcode: string;
  name: string;
  jzrq: string;
  dwjz: string;
  gsz: string;
  gszzl: string;
  gztime: string;
};

// ─── 基金排行 API 响应类型 ───────────────────────────────────────────────────
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

// ─── 基金搜索 API 响应类型 ───────────────────────────────────────────────────
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

export class EastmoneyClient {
  async getKlines(secid: string, beg: string, end: string): Promise<EastmoneyKlineResponse> {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${beg}&end=${end}`;
    return fetchJson<EastmoneyKlineResponse>(url);
  }

  async getQuote(secid: string): Promise<EastmoneyQuoteResponse> {
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f43,f44,f45,f46,f47,f48,f169,f170`;
    return fetchJson<EastmoneyQuoteResponse>(url);
  }

  async getFundScript(code: string): Promise<string> {
    const cacheBuster = Date.now();
    return fetchText(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${cacheBuster}`);
  }

  async getFundEstimate(code: string): Promise<EastmoneyFundEstimate> {
    const payload = await fetchText(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`);
    return parseJsonp<EastmoneyFundEstimate>(payload);
  }

  /**
   * 获取场外基金排行列表（来自 rankhandler.aspx）
   * @param type 基金类型：all=全部, gp=股票, hh=混合, zq=债券, zs=指数, qdii=QDII, fof=FOF
   * @param sort 排序字段：rzdf=日涨幅, 1nzf=近1年, 6yzf=近6月, 3yzf=近3月, jnzf=今年来
   * @param page 页码，从1开始
   * @param pageSize 每页条数
   */
  async getFundRanking(type = 'all', sort = '1nzf', page = 1, pageSize = 20): Promise<FundRankResult> {
    const today = new Date();
    const ed = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const sd = `${today.getFullYear() - 1}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const url = `https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=${type}&rs=&gs=0&sc=${sort}&st=desc&sd=${sd}&ed=${ed}&pi=${page}&pn=${pageSize}&dx=1`;
    const response = await fetchWithTimeout(url, {
      headers: { ...DEFAULT_HEADERS, Referer: 'https://fund.eastmoney.com/data/fundranking.html' }
    });
    if (!response.ok) throw new Error(`排行请求失败: ${response.status}`);
    const text = await response.text();
    return this.parseRankingResponse(text, page, pageSize);
  }

  /**
   * 按关键词搜索基金（名称/代码/拼音）
   */
  async searchFunds(keyword: string, page = 0, pageSize = 10): Promise<FundSearchItem[]> {
    const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}&pageindex=${page}&pagesize=${pageSize}`;
    const response = await fetchWithTimeout(url, {
      headers: { ...DEFAULT_HEADERS, Referer: 'https://fund.eastmoney.com/' }
    });
    if (!response.ok) throw new Error(`搜索请求失败: ${response.status}`);
    const data = await response.json() as { Datas?: Array<{
      CODE?: string;
      NAME?: string;
      FundBaseInfo?: {
        FTYPE?: string;
        FUNDTYPE?: string;
        DWJZ?: number;
        FSRQ?: string;
        JJGS?: string;
        JJJL?: string;
        ISBUY?: string;
      };
    }> };
    return (data.Datas ?? [])
      .filter(item => item.FundBaseInfo)
      .map(item => ({
        code: item.CODE ?? '',
        name: item.NAME ?? '',
        type: item.FundBaseInfo?.FUNDTYPE ?? '',
        typeDesc: item.FundBaseInfo?.FTYPE ?? '',
        company: item.FundBaseInfo?.JJGS ?? '',
        manager: item.FundBaseInfo?.JJJL ?? '',
        nav: item.FundBaseInfo?.DWJZ ?? 0,
        navDate: item.FundBaseInfo?.FSRQ ?? '',
        isBuyable: item.FundBaseInfo?.ISBUY === '1'
      }));
  }

  private parseRankingResponse(text: string, page: number, pageSize: number): FundRankResult {
    // 响应格式: var rankData = {datas:[...],allRecords:N,...};
    // 键名未加引号，需要转为合法 JSON
    let jsonStr = text.replace(/^var\s+rankData\s*=\s*/, '').replace(/;\s*$/, '');
    jsonStr = jsonStr.replace(/([{,])\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
    const parsed = JSON.parse(jsonStr) as { datas?: string[]; allRecords?: number; allNum?: number };
    const items: FundRankItem[] = (parsed.datas ?? []).map(line => {
      const fields = line.split(',');
      return {
        code: fields[0] ?? '',
        name: fields[1] ?? '',
        nav: Number(fields[4]) || 0,
        navDate: fields[3] ?? '',
        dailyReturn: Number(fields[6]) || 0,
        weekReturn: Number(fields[7]) || 0,
        monthReturn: Number(fields[8]) || 0,
        threeMonthReturn: Number(fields[9]) || 0,
        sixMonthReturn: Number(fields[10]) || 0,
        yearReturn: Number(fields[11]) || 0,
        ytdReturn: Number(fields[14]) || 0,
        sinceInception: Number(fields[15]) || 0,
        establishDate: fields[16] ?? ''
      };
    });
    return { items, total: parsed.allNum ?? parsed.allRecords ?? 0, page, pageSize };
  }

  getScriptVariable<T>(script: string, variableName: string): T | null {
    return parseScriptVariable<T>(script, variableName);
  }
}