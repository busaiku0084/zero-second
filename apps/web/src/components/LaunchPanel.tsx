"use client";

import { useEffect, useRef, useState } from "react";
import { Countdown, useRemaining } from "./Countdown";

/** 残り 3・2・1 秒と 0 秒で鳴らす（0 秒だけ高い音） */
const BEEPS = [3000, 2000, 1000, 0];

function beep(ctx: AudioContext, high: boolean) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = high ? 1320 : 880;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (high ? 0.6 : 0.15));
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + (high ? 0.6 : 0.15));
}

/**
 * 販売開始の瞬間に手で操作するための画面（#12）。
 * 公演ページは押したときにだけ開く。チケットサイトへ自動でアクセスしない（ADR 0005）
 */
export function LaunchPanel({ targetMs, eventUrl }: { targetMs: number; eventUrl: string }) {
  const { remaining } = useRemaining(targetMs);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const played = useRef(new Set<number>());

  useEffect(() => {
    if (!sound || remaining === null || !audio.current) return;
    for (const at of BEEPS) {
      // 100ms ごとの更新で、境目をまたいだ回に 1 度だけ鳴らす
      if (remaining <= at && remaining > at - 300 && !played.current.has(at)) {
        played.current.add(at);
        beep(audio.current, at === 0);
      }
    }
  }, [remaining, sound]);

  function toggleSound() {
    // 音はユーザーの操作のあとでしか鳴らせないので、ここで作る
    if (!audio.current) audio.current = new AudioContext();
    void audio.current.resume();
    setSound((v) => !v);
  }

  const soon = remaining !== null && remaining <= 60_000;
  return (
    <section className="panel launch" aria-label="販売開始">
      <span className="eyebrow">販売開始まで（補正済み）</span>
      <Countdown targetMs={targetMs} showClock large />
      <div className="button-row">
        <a
          className={soon ? "button button-primary button-launch is-soon" : "button button-launch"}
          href={eventUrl}
          target="_blank"
          rel="noreferrer"
        >
          公演ページを開く
        </a>
        <button type="button" className="button" onClick={toggleSound} aria-pressed={sound}>
          {sound ? "音を止める" : "3 秒前から音で知らせる"}
        </button>
      </div>
      <p className="field-hint">
        ページは押したときだけ新しいタブで開きます。販売開始の 1
        分前になるとボタンが目立つ色になります
      </p>
    </section>
  );
}
