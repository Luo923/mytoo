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

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${url}`);
  }
  return response.text();
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
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

  getScriptVariable<T>(script: string, variableName: string): T | null {
    return parseScriptVariable<T>(script, variableName);
  }
}