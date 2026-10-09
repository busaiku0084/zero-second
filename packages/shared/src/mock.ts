/**
 * 検証用のモックサイト（apps/mock-site）。
 *
 * 公演 URL の末尾（/events/{id}）でシナリオを選ぶ。striker の mock アダプタも同じ id を使う。
 */
export const MOCK_SITE_URL = "http://127.0.0.1:47302";

export const MOCK_SCENARIOS = [
  { id: "ok", name: "成功", description: "そのまま購入できます" },
  { id: "flaky", name: "混雑", description: "2 回失敗してから購入できます（再試行の確認）" },
  { id: "slow", name: "低速", description: "購入の応答に約 0.8 秒かかります" },
  { id: "sold-out", name: "売り切れ", description: "売り切れで購入できません" },
  { id: "captcha", name: "CAPTCHA", description: "人の対応が必要になり、そこで止まります" },
] as const satisfies readonly MockScenario[];

export type MockScenario = { id: string; name: string; description: string };
export type MockScenarioId = (typeof MOCK_SCENARIOS)[number]["id"];

export function findMockScenario(id: string): MockScenario | undefined {
  return MOCK_SCENARIOS.find((s) => s.id === id);
}

/** Sauce Demo（ローカルで動かしたもの。ADR 0021）。予約の公演 URL は商品ページ */
export const SAUCE_DEMO_URL = "http://127.0.0.1:47303";

export const SAUCE_DEMO_PRODUCTS = [
  { id: 4, name: "Sauce Labs Backpack" },
  { id: 0, name: "Sauce Labs Bike Light" },
  { id: 1, name: "Sauce Labs Bolt T-Shirt" },
] as const;

/** Sauce Demo のテストユーザー（アカウントの登録で使う）。パスワードはどれも secret_sauce（Sauce Demo の画面に書かれている値） */
export const SAUCE_DEMO_USERS = [
  { loginId: "standard_user", description: "成功する" },
  { loginId: "performance_glitch_user", description: "ログインに約 5 秒かかる（遅延）" },
  { loginId: "locked_out_user", description: "ログインできない（失敗）" },
  { loginId: "problem_user", description: "id が奇数の商品をカートに入れられない（失敗）" },
] as const;

export function sauceDemoProductUrl(id: number, base: string = SAUCE_DEMO_URL): string {
  return `${base}/inventory-item.html?id=${id}`;
}

export function mockEventUrl(scenario: MockScenarioId, base: string = MOCK_SITE_URL): string {
  return `${base}/events/${scenario}`;
}
