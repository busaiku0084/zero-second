"use client";

import {
  type Account,
  DEFAULT_REMINDER_MINUTES,
  type EventInfo,
  MOCK_SCENARIOS,
  type MockScenarioId,
  mockEventUrl,
  REMINDER_MINUTE_OPTIONS,
  SAUCE_DEMO_PRODUCTS,
  SAUCE_DEMO_USERS,
  type Site,
  sauceDemoProductUrl,
  supportsEventInfo,
} from "@zero-second/shared";
import { useActionState, useEffect, useState } from "react";
import { createReservation, lookupEventInfo } from "@/app/actions";
import type { FormState } from "@/lib/form";
import { toJstInput } from "@/lib/format";
import { reminderLabel } from "@/lib/labels";
import { Field, FormMessage } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function ReservationForm({
  sites,
  accounts,
  defaultSaleStartsAt,
}: {
  sites: Site[];
  accounts: Account[];
  defaultSaleStartsAt: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(createReservation, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const [siteId, setSiteId] = useState(v.site ?? sites[0]?.id ?? "");
  const site = sites.find((s) => s.id === siteId);
  const autoAllowed = site?.automation === "auto";
  /** 公演 URL から公演名・席種・枚数の上限を自動で入れられるサイトか（#43） */
  const autoFill = site !== undefined && supportsEventInfo(site);
  const siteAccounts = accounts.filter((a) => a.site === siteId);
  const [title, setTitle] = useState(v.title ?? "");
  const [eventUrl, setEventUrl] = useState(v.eventUrl ?? "");
  const [ticketType, setTicketType] = useState(v.ticketType ?? "");
  const [quantity, setQuantity] = useState(v.quantity ?? "1");
  const [mode, setMode] = useState(v.mode ?? (autoAllowed ? "auto" : "manual"));
  const [info, setInfo] = useState<EventInfo | null>(null);
  const [lookup, setLookup] = useState<{ state: "idle" | "loading" | "done" } | { error: string }>({
    state: "idle",
  });
  const [saleStartsAt, setSaleStartsAt] = useState(v.saleStartsAt ?? defaultSaleStartsAt);
  const scenario = MOCK_SCENARIOS.find((s) => mockEventUrl(s.id) === eventUrl);
  const reminders =
    v.reminderMinutes === undefined
      ? DEFAULT_REMINDER_MINUTES
      : v.reminderMinutes.split(",").filter(Boolean).map(Number);

  /** 検証用のサイト（モック・Sauce Demo）なら、販売開始を「1 分後」にするボタンを出す */
  const testSite = siteId === "mock" || siteId === "saucedemo";
  const product = SAUCE_DEMO_PRODUCTS.find((p) => sauceDemoProductUrl(p.id) === eventUrl);

  /**
   * 公演 URL が変わったら、公演情報を読んで公演名・席種・枚数を入れる（#43）。
   * 打ち終わるのを少し待ってから読み、古い応答は捨てる
   */
  useEffect(() => {
    if (!autoFill || !isUrl(eventUrl)) {
      setInfo(null);
      setLookup({ state: "idle" });
      // 前の URL から入れた公演名を残さない
      if (autoFill) setTitle("");
      return;
    }
    let current = true;
    setLookup({ state: "loading" });
    const timer = setTimeout(async () => {
      const result = await lookupEventInfo(siteId, eventUrl);
      if (!current) return;
      if (!result.ok) {
        setInfo(null);
        setLookup({ error: result.message });
        setTitle("");
        return;
      }
      const found = result.info;
      setInfo(found);
      setLookup({ state: "done" });
      setTitle(found.title);
      setTicketType((t) => (found.ticketTypes.includes(t) ? t : (found.ticketTypes[0] ?? "")));
      setQuantity((q) => String(Math.min(Number(q) || 1, found.maxQuantity)));
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [autoFill, siteId, eventUrl]);

  /** サイトを切り替えたら、サイトごとの項目（公演名・URL・席種・枚数・購入のしかた）を初期値に戻す */
  function selectSite(id: string) {
    const next = sites.find((s) => s.id === id);
    setSiteId(id);
    setTitle("");
    setEventUrl("");
    setTicketType("");
    setQuantity("1");
    setMode(next?.automation === "auto" ? "auto" : "manual");
    if (id === "mock") setEventUrl(mockEventUrl("ok"));
    if (id === "saucedemo") setEventUrl(sauceDemoProductUrl(4));
  }

  return (
    <form action={action} className="form panel" noValidate>
      <FormMessage message={state.message} />

      <fieldset className="field">
        <legend>サイト</legend>
        <div className="choice-row">
          {sites.map((s) => (
            <label key={s.id} className="choice">
              <input
                type="radio"
                name="site"
                value={s.id}
                checked={siteId === s.id}
                onChange={() => selectSite(s.id)}
              />
              <span className="choice-title">{s.name}</span>
              <span className="choice-sub">
                {s.automation === "auto" ? "自動購入に対応" : "購入補助のみ"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {siteId === "saucedemo" ? (
        <fieldset className="field">
          <legend>商品（Sauce Demo）</legend>
          <div className="choice-row">
            {SAUCE_DEMO_PRODUCTS.map((p) => (
              <label key={p.id} className="choice">
                <input
                  type="radio"
                  name="sauceDemoProduct"
                  value={p.id}
                  checked={product?.id === p.id}
                  onChange={() => setEventUrl(sauceDemoProductUrl(p.id))}
                />
                <span className="choice-title">{p.name}</span>
                <span className="choice-sub">
                  id {p.id}（{p.id % 2 === 1 ? "奇数" : "偶数"}）
                </span>
              </label>
            ))}
          </div>
          <p className="field-hint">
            ブラウザを操作して買います。アカウントに Sauce Demo のテストユーザー（パスワードは
            secret_sauce）を登録して指定してください:{" "}
            {SAUCE_DEMO_USERS.map((u) => `${u.loginId}（${u.description}）`).join("、")}
          </p>
        </fieldset>
      ) : null}

      {siteId === "mock" ? (
        <fieldset className="field">
          <legend>シナリオ（モックサイト）</legend>
          <div className="choice-row">
            {MOCK_SCENARIOS.map((s) => (
              <label key={s.id} className="choice">
                <input
                  type="radio"
                  name="mockScenario"
                  value={s.id}
                  checked={scenario?.id === s.id}
                  onChange={() => setEventUrl(mockEventUrl(s.id as MockScenarioId))}
                />
                <span className="choice-title">{s.name}</span>
                <span className="choice-sub">{s.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="form-grid">
        <Field
          id="eventUrl"
          label="公演ページの URL"
          error={e.eventUrl ?? ("error" in lookup ? lookup.error : undefined)}
          hint={eventUrlHint(autoFill, lookup, info)}
          wide
        >
          <input
            id="eventUrl"
            name="eventUrl"
            type="url"
            inputMode="url"
            placeholder={site?.url}
            value={eventUrl}
            onChange={(ev) => setEventUrl(ev.target.value)}
            required
            aria-invalid={Boolean(e.eventUrl)}
          />
        </Field>
        <Field
          id="title"
          label="公演名"
          error={e.title}
          hint={info ? "公演 URL から自動で入りました" : undefined}
          wide
        >
          <input
            id="title"
            name="title"
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            readOnly={info !== null}
            required
            aria-invalid={Boolean(e.title)}
          />
        </Field>
        <Field
          id="saleStartsAt"
          label="販売開始（日本時間）"
          error={e.saleStartsAtMs}
          hint="秒まで指定できます"
        >
          <div className="input-row">
            <input
              id="saleStartsAt"
              name="saleStartsAt"
              type="datetime-local"
              step={1}
              value={saleStartsAt}
              onChange={(ev) => setSaleStartsAt(ev.target.value)}
              required
              aria-invalid={Boolean(e.saleStartsAtMs)}
            />
            {testSite ? (
              <button
                type="button"
                className="button"
                onClick={() => setSaleStartsAt(toJstInput(Date.now() + 60_000))}
              >
                1 分後
              </button>
            ) : null}
          </div>
        </Field>
        <Field
          id="ticketType"
          label="席種"
          error={e.ticketType}
          hint={info ? undefined : "例: 一般、前方エリア"}
        >
          {info ? (
            <select
              id="ticketType"
              name="ticketType"
              value={ticketType}
              onChange={(ev) => setTicketType(ev.target.value)}
            >
              {info.ticketTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="ticketType"
              name="ticketType"
              value={ticketType}
              onChange={(ev) => setTicketType(ev.target.value)}
              required
              aria-invalid={Boolean(e.ticketType)}
            />
          )}
        </Field>
        <Field
          id="quantity"
          label="枚数"
          error={e.quantity}
          hint={info ? `1 回の注文は ${info.maxQuantity} 枚まで` : undefined}
        >
          <select
            id="quantity"
            name="quantity"
            value={quantity}
            onChange={(ev) => setQuantity(ev.target.value)}
          >
            {Array.from({ length: info?.maxQuantity ?? 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} 枚
              </option>
            ))}
          </select>
        </Field>
        <Field id="paymentMethod" label="支払い方法">
          <select id="paymentMethod" name="paymentMethod" defaultValue="convenience_store">
            <option value="convenience_store">コンビニ払い</option>
          </select>
        </Field>
        <Field
          id="accountId"
          label="アカウント"
          error={e.accountId}
          hint={
            siteAccounts.length === 0
              ? "このサイトのアカウントは未登録です（手動購入なら不要）"
              : undefined
          }
        >
          <select id="accountId" name="accountId" defaultValue={v.accountId ?? ""} key={siteId}>
            <option value="">指定しない</option>
            {siteAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.loginId}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="field">
        <legend>購入のしかた</legend>
        <div className="choice-row">
          <label className="choice">
            <input
              type="radio"
              name="mode"
              value="manual"
              checked={mode === "manual"}
              onChange={() => setMode("manual")}
            />
            <span className="choice-title">手動で購入</span>
            <span className="choice-sub">カウントダウンと所要時間の記録で補助します</span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="mode"
              value="auto"
              disabled={!autoAllowed}
              checked={mode === "auto"}
              onChange={() => setMode("auto")}
            />
            <span className="choice-title">自動で購入</span>
            <span className="choice-sub">
              {autoAllowed
                ? "販売開始時刻にワーカーが購入します"
                : "このサイトは利用規約で自動購入が禁止されています"}
            </span>
          </label>
        </div>
        {e.mode ? <p className="field-error">{e.mode}</p> : null}
      </fieldset>

      <fieldset className="field">
        <legend>通知</legend>
        <div className="check-row">
          {REMINDER_MINUTE_OPTIONS.map((m) => (
            <label key={m} className="check">
              <input
                type="checkbox"
                name="reminderMinutes"
                value={m}
                defaultChecked={reminders.includes(m)}
              />
              {reminderLabel(m)}
            </label>
          ))}
        </div>
        <p className="field-hint">
          販売開始前に、アプリ内の通知と設定した届け先（ブラウザ・Discord・Slack）で知らせます
        </p>
        {e.reminderMinutes ? <p className="field-error">{e.reminderMinutes}</p> : null}
      </fieldset>

      <Field id="notes" label="メモ" hint="当日の手順や同行者のことなど" wide>
        <textarea id="notes" name="notes" defaultValue={v.notes} />
      </Field>

      <div className="button-row">
        <SubmitButton pendingLabel="登録しています…">予約を登録</SubmitButton>
      </div>
    </form>
  );
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** 公演 URL の欄の下に出す、自動入力の状態 */
function eventUrlHint(
  autoFill: boolean,
  lookup: { state: "idle" | "loading" | "done" } | { error: string },
  info: EventInfo | null,
): string | undefined {
  if (!autoFill) return undefined;
  if ("error" in lookup) return undefined;
  if (lookup.state === "loading") return "公演情報を読み込んでいます…";
  if (lookup.state === "done" && info) {
    return `公演情報を読み込みました（席種 ${info.ticketTypes.length} つ・1 回 ${info.maxQuantity} 枚まで）`;
  }
  return "URL を入れると、公演名・席種・枚数の上限が自動で入ります";
}
