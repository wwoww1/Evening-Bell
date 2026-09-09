/** Only the ANNA entry point installs a runtime; normal web builds stay local. */
export interface AnnaStorage {
  get(args: { key: string }): Promise<{
    value: unknown;
    exists?: boolean;
    etag?: string;
  }>;
  set(args: {
    key: string;
    value: unknown;
    if_match?: string;
  }): Promise<unknown>;
}
export interface AnnaRuntime {
  storage: AnnaStorage;
  capabilities?: { scopes?: string[]; llm?: string[] };
  llm: {
    complete(
      args: {
        systemPrompt: string;
        messages: { role: 'user'; content: { type: 'text'; text: string } }[];
        maxTokens: number;
        temperature: number;
      },
      options?: { timeoutMs: number },
    ): Promise<{
      content?: { type?: string; text?: string };
      stopReason?: string;
    }>;
  };
  on(event: string, handler: (payload: unknown) => void): () => void;
}
let runtime: AnnaRuntime | undefined;
export function installAnnaRuntime(value: AnnaRuntime) {
  runtime = value;
}
export function isAnna() {
  return runtime !== undefined;
}
export function getAnnaRuntime(): AnnaRuntime {
  if (!runtime)
    throw new Error('Open Evening Bell inside ANNA. / 请在 ANNA 内打开晚钟。');
  return runtime;
}

export function annaError(error: unknown, locale: 'en' | 'zh-CN' = 'en') {
  const e = error as {
    code?: unknown;
    errorCode?: unknown;
    name?: unknown;
    message?: unknown;
    data?: { errorCode?: unknown };
    details?: { errorCode?: unknown };
  };
  const code = [
    e?.code,
    e?.errorCode,
    e?.name,
    e?.data?.errorCode,
    e?.details?.errorCode,
    e?.message,
  ]
    .join(' ')
    .toLowerCase();
  let en =
      'ANNA could not complete the request. Check the connection and try again.',
    zh = 'ANNA 暂时无法完成请求，请检查连接后重试。';
  if (/precondition_failed/.test(code)) {
    en =
      'Your data changed in another window. This change was not saved. Refresh and review before trying again.';
    zh = '其他窗口已更新数据，本次修改未保存。请刷新并检查最新内容后重试。';
  } else if (/quota|value_too_large|state_too_large/.test(code)) {
    en =
      'ANNA storage or model quota is insufficient. Check your quota; your saved data has not been replaced.';
    zh = 'ANNA 存储或模型额度不足，请检查额度；已保存的数据未被替换。';
  } else if (
    /not_granted|permission_denied|forbidden|invalid_token|expired/.test(code)
  ) {
    en =
      'ANNA access is unavailable. Reopen the app and check its permissions in Installed Apps.';
    zh =
      'ANNA 访问权限不可用，请重新打开应用，并在 Installed Apps 中检查权限。';
  } else if (/timeout|timed out/.test(code)) {
    en =
      'ANNA did not respond in time. Reopen the app to check the latest saved data before retrying.';
    zh = 'ANNA 响应超时。请重新打开应用确认最新保存结果，再决定是否重试。';
  } else if (/not_implemented|provider_error/.test(code)) {
    en =
      'The ANNA model is unavailable. Check your model settings; local planning is still available.';
    zh = 'ANNA 模型暂不可用，请检查模型设置；仍可使用本地规划。';
  }
  return locale === 'zh-CN' ? zh : en;
}
