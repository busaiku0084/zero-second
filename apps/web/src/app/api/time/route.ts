// 端末の時計のずれを測るための、サーバーの現在時刻（ADR 0018）。
// サーバー（ホスト）の時計は OS が NTP で合わせている前提

export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
