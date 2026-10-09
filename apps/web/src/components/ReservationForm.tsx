"use client";

import {
  type Account,
  MOCK_SCENARIOS,
  type MockScenarioId,
  mockEventUrl,
  type Site,
} from "@zero-second/shared";
import { useActionState, useState } from "react";
import { createReservation } from "@/app/actions";
import type { FormState } from "@/lib/form";
import { toJstInput } from "@/lib/format";
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
  const siteAccounts = accounts.filter((a) => a.site === siteId);
  const [title, setTitle] = useState(v.title ?? "");
  const [eventUrl, setEventUrl] = useState(v.eventUrl ?? "");
  const [saleStartsAt, setSaleStartsAt] = useState(v.saleStartsAt ?? defaultSaleStartsAt);
  const scenario = MOCK_SCENARIOS.find((s) => mockEventUrl(s.id) === eventUrl);

  function selectSite(id: string) {
    setSiteId(id);
    if (id === "mock" && eventUrl === "") selectScenario("ok");
  }

  /** モックサイトのシナリオを選ぶと、公演 URL と公演名を埋める */
  function selectScenario(id: MockScenarioId) {
    setEventUrl(mockEventUrl(id));
    const name = MOCK_SCENARIOS.find((s) => s.id === id)?.name;
    if (title === "" || title.startsWith("モック公演")) setTitle(`モック公演「${name}」`);
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
                  onChange={() => selectScenario(s.id)}
                />
                <span className="choice-title">{s.name}</span>
                <span className="choice-sub">{s.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="form-grid">
        <Field id="title" label="公演名" error={e.title} wide>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            required
            aria-invalid={Boolean(e.title)}
          />
        </Field>
        <Field id="eventUrl" label="公演ページの URL" error={e.eventUrl} wide>
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
            {siteId === "mock" ? (
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
        <Field id="ticketType" label="席種" error={e.ticketType} hint="例: 一般、前方エリア">
          <input
            id="ticketType"
            name="ticketType"
            defaultValue={v.ticketType}
            required
            aria-invalid={Boolean(e.ticketType)}
          />
        </Field>
        <Field id="quantity" label="枚数" error={e.quantity}>
          <select id="quantity" name="quantity" defaultValue={v.quantity ?? "1"}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
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
        <div className="choice-row" key={siteId}>
          <label className="choice">
            <input type="radio" name="mode" value="manual" defaultChecked={!autoAllowed} />
            <span className="choice-title">手動で購入</span>
            <span className="choice-sub">カウントダウンと所要時間の記録で補助します</span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="mode"
              value="auto"
              disabled={!autoAllowed}
              defaultChecked={autoAllowed}
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

      <Field id="notes" label="メモ" hint="当日の手順や同行者のことなど" wide>
        <textarea id="notes" name="notes" defaultValue={v.notes} />
      </Field>

      <div className="button-row">
        <SubmitButton pendingLabel="登録しています…">予約を登録</SubmitButton>
      </div>
    </form>
  );
}
