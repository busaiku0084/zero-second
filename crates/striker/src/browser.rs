//! ブラウザ操作モード（ADR 0021）。ヘッドレス Chrome を CDP で操作する。
//!
//! API を叩けず、画面の操作でしか買えないサイトのアダプタが使う。アダプタは `ctx.browser` の
//! メソッド（goto / click / fill / wait_for など）だけで操作し、操作ごとの所要時間を timings に残す。
//! 待ち時間にはすべて上限を設ける（無限に待たない）。

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use anyhow::{Context, anyhow};
use chromiumoxide::{Browser, BrowserConfig, Element, Page};
use futures::StreamExt;
use reqwest::Url;
use tokio::task::JoinHandle;

use crate::clock::now_ms;
use crate::metrics::{Phase, RequestTiming};
use crate::site::SiteError;

/// 要素を探し直す間隔
const POLL: Duration = Duration::from_millis(25);
/// ページの移動を待つ上限
const NAVIGATION_TIMEOUT: Duration = Duration::from_secs(15);

/// プロファイルのディレクトリ名を、同時に起動しても重ならないようにする連番
static PROFILE_SEQ: AtomicU64 = AtomicU64::new(0);

/// 実行ごとのプロファイルのディレクトリ（同じミリ秒に複数起動しても別の名前になる）
fn profile_dir() -> PathBuf {
    std::env::temp_dir().join(format!(
        "zero-second-striker-{}-{}-{}",
        std::process::id(),
        now_ms(),
        PROFILE_SEQ.fetch_add(1, Ordering::Relaxed)
    ))
}

/// ブラウザの起動設定（環境変数。docs/operations.md）
#[derive(Debug, Clone, Default)]
pub struct BrowserSettings {
    /// Chrome / Chromium の実行ファイル（`STRIKER_CHROME_PATH`）。None なら標準の場所から探す
    pub executable: Option<PathBuf>,
    /// 画面を出して動かす（`STRIKER_BROWSER_HEADFUL=true`）。動きを目で確かめるとき用
    pub headful: bool,
    /// サンドボックスを使わない（`STRIKER_CHROME_NO_SANDBOX=true`）。Docker の中だけで使う
    pub no_sandbox: bool,
}

/// 1 回の実行で使うブラウザ。実行ごとに新しいプロファイルで起動し、終わったら消す
pub struct BrowserSession {
    browser: Browser,
    handler: JoinHandle<()>,
    page: Page,
    profile_dir: PathBuf,
    /// 今の段階。executor が login / prepare / purchase の前に切り替える
    pub phase: Phase,
    timings: Vec<RequestTiming>,
}

impl BrowserSession {
    pub async fn launch(settings: &BrowserSettings) -> anyhow::Result<Self> {
        // 利用者の普段の Chrome のプロファイルには触れない。実行ごとに空のプロファイルを使う
        let profile_dir = profile_dir();
        let mut builder = BrowserConfig::builder()
            .user_data_dir(&profile_dir)
            .window_size(1280, 900)
            // /dev/shm が小さい環境（Docker）で、複数の Chrome を同時に動かしても固まらないようにする
            .arg("--disable-dev-shm-usage")
            .request_timeout(Duration::from_secs(30));
        if let Some(path) = &settings.executable {
            builder = builder.chrome_executable(path);
        }
        if settings.headful {
            builder = builder.with_head();
        }
        if settings.no_sandbox {
            builder = builder.no_sandbox();
        }
        let config = builder.build().map_err(|e| {
            anyhow!("Chrome が見つかりません（STRIKER_CHROME_PATH で指定できます）: {e}")
        })?;
        let (browser, mut handler) = Browser::launch(config)
            .await
            .context("Chrome を起動できません")?;
        let handler = tokio::spawn(async move {
            while let Some(event) = handler.next().await {
                if event.is_err() {
                    break;
                }
            }
        });
        let page = browser
            .new_page("about:blank")
            .await
            .context("ブラウザのタブを開けません")?;
        Ok(Self {
            browser,
            handler,
            page,
            profile_dir,
            phase: Phase::Login,
            timings: Vec::new(),
        })
    }

    /// 操作を記録する。method は GOTO / CLICK / TYPE / WAIT、target は URL かセレクタ
    fn record(&mut self, method: &str, target: &str, started_at_ms: i64, started: Instant) {
        self.timings.push(RequestTiming {
            phase: self.phase,
            method: method.to_string(),
            url: target.to_string(),
            status: None,
            started_at_ms,
            duration_ms: started.elapsed().as_secs_f64() * 1000.0,
        });
    }

    /// ページを開き、文書が読み込まれる（DOM ができる）まで待つ。
    ///
    /// chromiumoxide の `Page::goto` は、まれに読み込み完了の通知を取りこぼして 30 秒待ち続けるため、
    /// JavaScript で移動して URL と `document.readyState` を見て待つ（上限 NAVIGATION_TIMEOUT）
    pub async fn goto(&mut self, url: &str) -> Result<(), SiteError> {
        let (at, started) = (now_ms(), Instant::now());
        let result = self.navigate(url).await;
        self.record("GOTO", url, at, started);
        result
    }

    async fn navigate(&self, url: &str) -> Result<(), SiteError> {
        let target = Url::parse(url)
            .map_err(|e| SiteError::Other(anyhow!("URL を読めません: {url}: {e}")))?;
        let script = format!(
            "window.location.href = {}",
            serde_json::to_string(target.as_str()).map_err(|e| SiteError::Other(e.into()))?
        );
        self.page
            .evaluate(script)
            .await
            .map_err(|e| SiteError::Other(anyhow!("{url} を開けません: {e}")))?;
        let deadline = Instant::now() + NAVIGATION_TIMEOUT;
        loop {
            // 移動の途中は評価に失敗することがあるので、失敗は「まだ」とみなす
            if let Ok(result) = self
                .page
                .evaluate("location.href + ' ' + document.readyState")
                .await
                && let Ok(state) = result.into_value::<String>()
                && let Some((href, ready)) = state.rsplit_once(' ')
                && Url::parse(href).is_ok_and(|h| h == target)
                && ready != "loading"
            {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(SiteError::Other(anyhow!(
                    "{} 秒待っても {url} を開けません",
                    NAVIGATION_TIMEOUT.as_secs()
                )));
            }
            tokio::time::sleep(POLL).await;
        }
    }

    /// 要素が出るまで待つ（timeout まで）
    pub async fn wait_for(
        &mut self,
        selector: &str,
        timeout: Duration,
    ) -> Result<Element, SiteError> {
        let (at, started) = (now_ms(), Instant::now());
        let result = self.poll(&[selector], timeout).await;
        self.record("WAIT", selector, at, started);
        result.map(|(_, element)| element)
    }

    /// いずれかの要素が出るまで待ち、出たものの番号を返す（成功の画面とエラーの表示を同時に待つときなど）
    pub async fn wait_for_any(
        &mut self,
        selectors: &[&str],
        timeout: Duration,
    ) -> Result<usize, SiteError> {
        let (at, started) = (now_ms(), Instant::now());
        let result = self.poll(selectors, timeout).await;
        self.record("WAIT", &selectors.join(" | "), at, started);
        result.map(|(i, _)| i)
    }

    async fn poll(
        &self,
        selectors: &[&str],
        timeout: Duration,
    ) -> Result<(usize, Element), SiteError> {
        let deadline = Instant::now() + timeout;
        loop {
            for (i, selector) in selectors.iter().enumerate() {
                if let Ok(element) = self.page.find_element(*selector).await {
                    return Ok((i, element));
                }
            }
            if Instant::now() >= deadline {
                return Err(SiteError::Other(anyhow!(
                    "{} 秒待っても {} が表示されません",
                    timeout.as_secs_f32(),
                    selectors.join(" / ")
                )));
            }
            tokio::time::sleep(POLL).await;
        }
    }

    /// 要素が出るまで待ってから押す
    pub async fn click(&mut self, selector: &str, timeout: Duration) -> Result<(), SiteError> {
        let element = self.wait_for(selector, timeout).await?;
        let (at, started) = (now_ms(), Instant::now());
        let result = element.click().await.map(|_| ());
        self.record("CLICK", selector, at, started);
        result.map_err(|e| SiteError::Other(anyhow!("{selector} を押せません: {e}")))
    }

    /// 入力欄に文字を入れる。入れた値は記録しない（パスワードなど）
    pub async fn fill(
        &mut self,
        selector: &str,
        value: &str,
        timeout: Duration,
    ) -> Result<(), SiteError> {
        let element = self.wait_for(selector, timeout).await?;
        let (at, started) = (now_ms(), Instant::now());
        let result = async {
            element.click().await?;
            element.type_str(value).await.map(|_| ())
        }
        .await;
        self.record("TYPE", selector, at, started);
        result.map_err(|e| SiteError::Other(anyhow!("{selector} に入力できません: {e}")))
    }

    /// 要素があれば、その表示中のテキスト
    pub async fn text(&self, selector: &str) -> Option<String> {
        let element = self.page.find_element(selector).await.ok()?;
        element
            .inner_text()
            .await
            .ok()
            .flatten()
            .map(|t| t.trim().to_string())
    }

    /// 要素が今あるか（待たない）
    pub async fn exists(&self, selector: &str) -> bool {
        self.page.find_element(selector).await.is_ok()
    }

    /// 溜まった計測値を取り出す
    pub fn take_timings(&mut self) -> Vec<RequestTiming> {
        std::mem::take(&mut self.timings)
    }

    /// ブラウザを閉じ、プロファイルを消す
    pub async fn close(mut self) {
        let _ = self.browser.close().await;
        let _ = self.browser.wait().await;
        self.handler.abort();
        let _ = std::fs::remove_dir_all(&self.profile_dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_dirs_never_collide() {
        let dirs: std::collections::HashSet<_> = (0..100).map(|_| profile_dir()).collect();
        assert_eq!(dirs.len(), 100);
    }
}
