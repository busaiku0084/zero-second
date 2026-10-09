# ADR（Architecture Decision Records）

設計上の判断と、その理由を残す場所。コードを読んでも分からない「なぜそうしたか」「何を選ばなかったか」を書く。

## 書くとき

- 後から変えるのが難しい選択をしたとき（言語・データの持ち方・外部とのやり取り・セキュリティ）
- 複数の案を比べて選んだとき
- 守るラインや方針を決めたとき（例: 利用規約で禁止されたサイトは自動化しない）

迷ったら書く。1 つの ADR は 1 つの判断にする。

## 書き方

1. `template.md` をコピーして `NNNN-短い名前.md` を作る（番号は連番、欠番にしない）
2. ステータスは `提案` で始め、PR で合意できたら `採用` にしてマージする
3. 採用済みの ADR は書き換えない。考えが変わったら新しい ADR を作り、古い方のステータスを `廃止（NNNN で置き換え）` にする

`.claude/skills/new-adr` の手順でも作れる。

## 一覧

| 番号 | タイトル | ステータス |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | 設計判断を ADR で記録する | 採用 |
| [0002](0002-monorepo-pnpm-cargo.md) | pnpm と Cargo のモノレポにする | 採用 |
| [0003](0003-rust-for-purchase-worker.md) | 購入ワーカーだけを Rust で書く | 採用 |
| [0004](0004-shared-sqlite-without-queue.md) | SQLite を共有し、キューを使わない | 採用 |
| [0005](0005-respect-site-terms.md) | 利用規約で自動化を禁止するサイトは購入補助のみにする | 採用 |
| [0006](0006-node-sqlite.md) | API の DB ドライバに node:sqlite を使う | 採用 |
| [0007](0007-time-representation.md) | 時刻は UNIX ミリ秒で保存し、日本時間で表示する | 採用 |
| [0008](0008-credential-encryption.md) | ログイン情報を AES-256-GCM で暗号化して保存する | 採用 |
| [0009](0009-server-side-data-access.md) | Web から API へのアクセスはサーバー側だけにする | 採用 |
| [0010](0010-handmade-svg-charts.md) | グラフはライブラリを使わず SVG で描く | 採用 |
| [0011](0011-worker-polling-and-timing-buffer.md) | ワーカーはポーリングで予約を取り、計測値はまとめて書く | 採用 |
| [0012](0012-mock-site-as-local-http-server.md) | 検証用のモックサイトをローカルの HTTP サーバーとして用意する | 採用 |
| [0013](0013-clock-sync-bisection-and-server-time-elapsed.md) | 時刻合わせは秒の切り替わりを二分探索し、所要時間はサーバーの時計で測る | 採用 |
| [0014](0014-site-registry.md) | サイトの定義を sites.json に集め、アダプタは SiteRegistry に登録する | 採用 |
| [0015](0015-docker-and-port-range.md) | Docker で動かし、ポートは 127.0.0.1 の 47300〜47302 に固定する | 採用 |
| [0016](0016-login-and-per-user-data.md) | ID とパスワードでログインし、データはユーザーごとに分ける | 採用 |
| [0017](0017-notifications.md) | 通知は API のプロセスで作り、アプリ内・Web Push・Webhook で届ける | 採用 |
| [0018](0018-browser-clock-correction.md) | 画面のカウントダウンは、web サーバーの時計とのずれを測って補正する | 採用 |
| [0019](0019-checklist-copied-from-template.md) | 購入前チェックリストは、予約を作るときにテンプレートから写す | 採用 |
| [0020](0020-user-management.md) | パスワードの再設定は管理者が発行するリンクで行い、ユーザーは削除せず停止する | 採用 |
| [0021](0021-browser-mode.md) | ワーカーにブラウザ操作モードを足し、Sauce Demo をローカルで動かして確かめる | 採用 |
| [0022](0022-switchable-drivers-per-adapter.md) | 1 つのアダプタが API とブラウザ操作の両方を持ち、ワーカーの設定で切り替える | 採用 |
| [0023](0023-event-info-autofill.md) | 公演 URL からの自動入力は、自動化を許可しているサイトだけにする | 採用 |
