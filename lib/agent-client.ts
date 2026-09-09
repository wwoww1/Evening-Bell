import { getAnnaRuntime, isAnna, annaError } from './anna-runtime.ts';
import { handleAgentRequest, UserFacingAgentError } from './agent-service.ts';
import { normalizeLocale } from './i18n.ts';

/** Same response contract for the web server and ANNA's host-mediated LLM. */
export async function agentRequest(init?: RequestInit): Promise<Response> {
  if (!isAnna()) return fetch('/api/agent', init);
  const runtime = getAnnaRuntime();
  const allowed =
    runtime.capabilities?.scopes?.some(
      (scope) => scope === 'llm.complete' || scope === 'llm.*',
    ) ??
    runtime.capabilities?.llm?.some(
      (method) => method === 'complete' || method === '*',
    ) ??
    false;
  if (!init || !init.method || init.method.toUpperCase() === 'GET')
    return Response.json({
      configured: allowed,
      mode: allowed ? 'ai' : 'local',
    });
  const request = new Request('https://evening-bell.invalid/api/agent', init);
  const locale = normalizeLocale(request.headers.get('X-App-Language'));
  return handleAgentRequest(
    request,
    allowed
      ? async (input) => {
          try {
            const result = await runtime.llm.complete(
              {
                systemPrompt: input.system,
                messages: [
                  { role: 'user', content: { type: 'text', text: input.user } },
                ],
                maxTokens: input.maxTokens,
                temperature: 0.4,
              },
              { timeoutMs: 90000 },
            );
            if (result.stopReason === 'maxTokens')
              throw new UserFacingAgentError(
                locale === 'zh-CN'
                  ? '模型回答被截断，请减少输入内容后重试，或使用本地拆分。'
                  : 'The model response was cut short. Use a smaller input or local breakdown.',
              );
            if (
              typeof result.content?.text !== 'string' ||
              !result.content.text.trim()
            )
              throw new UserFacingAgentError(
                locale === 'zh-CN'
                  ? '模型未返回可用内容。'
                  : 'The model returned no usable content.',
              );
            return result.content.text;
          } catch (error) {
            if (error instanceof UserFacingAgentError) throw error;
            throw new UserFacingAgentError(annaError(error, locale));
          }
        }
      : undefined,
  );
}
