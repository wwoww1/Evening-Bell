import { env } from 'cloudflare:workers';
import { handleAgentRequest, UserFacingAgentError } from '@/lib/agent-service';
import { createTranslator, normalizeLocale } from '@/lib/i18n';

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const config = () => {
  const vars = env as Record<string, string | undefined>;
  return {
    key: vars.AI_API_KEY || process.env.AI_API_KEY,
    base: vars.AI_BASE_URL || process.env.AI_BASE_URL,
    model: vars.AI_MODEL || process.env.AI_MODEL,
  };
};
export async function GET() {
  const c = config();
  return json({
    configured: !!(c.key && c.base && c.model),
    mode: c.key && c.base && c.model ? 'ai' : 'local',
  });
}
export async function POST(request: Request) {
  const c = config();
  const tr = createTranslator(
    normalizeLocale(request.headers.get('X-App-Language')),
  );
  return handleAgentRequest(
    request,
    c.key && c.base && c.model
      ? async (input) => {
          const endpoint = new URL(
            c.base!.replace(/\/$/, '') + '/chat/completions',
          );
          if (
            endpoint.protocol !== 'https:' &&
            !(
              endpoint.protocol === 'http:' &&
              ['localhost', '127.0.0.1'].includes(endpoint.hostname)
            )
          )
            throw new UserFacingAgentError(
              tr('模型服务请使用 HTTPS 地址，本地模型可使用 localhost。'),
            );
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + c.key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: c.model,
              messages: [
                { role: 'system', content: input.system },
                { role: 'user', content: input.user },
              ],
              temperature: 0.4,
              ...(input.structured
                ? { response_format: { type: 'json_object' } }
                : {}),
            }),
            signal: AbortSignal.timeout(25000),
          });
          if (!response.ok)
            throw new UserFacingAgentError(
              tr('模型服务暂时不可用（{0}），可以继续使用本地规划。', [
                response.status,
              ]),
            );
          const result = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          return result.choices?.[0]?.message?.content || '';
        }
      : undefined,
  );
}
