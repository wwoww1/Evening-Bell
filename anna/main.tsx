import { createRoot } from 'react-dom/client';
import type { AnnaRuntime } from '@/lib/anna-runtime';
import PlannerApp from '@/components/planner/planner-app';
import {
  LanguageProvider,
  initializeAnnaLanguage,
} from '@/components/planner/language-provider';
import { installAnnaRuntime } from '@/lib/anna-runtime';
import { initializeState, rawBackup } from '@/lib/store';
import { downloadJSON } from '@/components/planner/settings-view';
import '@/app/globals.css';

const root = document.getElementById('root')!;
async function start() {
  const sdkUrl = '/static/anna-apps/_sdk/latest/index.js';
  const { AnnaAppRuntime } = (await import(/* @vite-ignore */ sdkUrl)) as {
    AnnaAppRuntime: { connect(): Promise<AnnaRuntime> };
  };
  const runtime = await AnnaAppRuntime.connect();
  installAnnaRuntime(runtime);
  await initializeState();
  await initializeAnnaLanguage();
  root.removeAttribute('role');
  createRoot(root).render(
    <LanguageProvider>
      <PlannerApp />
    </LanguageProvider>,
  );
}
void start().catch((error) => {
  root.className = 'page-content';
  root.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'Unable to open Evening Bell / 暂时无法打开晚钟';
  const detail = document.createElement('p');
  detail.textContent =
    'Open this app in ANNA and check your connection and app permissions. Your stored records have not been overwritten. / 请在 ANNA 内打开应用，检查网络和应用权限。已保存的记录未被覆盖。';
  const errorText = document.createElement('p');
  errorText.textContent =
    error instanceof Error ? error.message : String(error);
  const retry = document.createElement('button');
  retry.textContent = 'Retry / 重试';
  retry.onclick = () => window.location.reload();
  const backup = document.createElement('button');
  backup.textContent = 'Export loaded data / 导出已读取的数据';
  backup.onclick = () => downloadJSON(rawBackup(), 'evening-bell-backup.json');
  for (const child of [heading, detail, errorText, retry, backup])
    root.appendChild(child);
});
