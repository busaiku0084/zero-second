-- 自動購入の実行に使った操作の方法（ADR 0022）
-- http（API を叩く）/ browser（ブラウザ操作）。手動購入の記録と、これより前の実行は NULL
ALTER TABLE runs ADD COLUMN driver TEXT CHECK (driver IN ('http', 'browser'));
