//! サイトのログイン情報の復号（ADR 0008）。
//!
//! 暗号化は API（apps/api/src/lib/crypto.ts）が行う。保存形式は iv(12) | tag(16) | ciphertext。
//! 復号した値はログや DB に書かない。

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{anyhow, bail};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

const IV_LENGTH: usize = 12;
const TAG_LENGTH: usize = 16;

/// CREDENTIALS_ENCRYPTION_KEY（base64 の 32 バイト）。Debug でも値を出さない
#[derive(Clone)]
pub struct CredentialKey([u8; 32]);

impl std::fmt::Debug for CredentialKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("CredentialKey(***)")
    }
}

impl CredentialKey {
    pub fn parse(base64: &str) -> anyhow::Result<Self> {
        let bytes = STANDARD
            .decode(base64.trim())
            .map_err(|_| anyhow!("CREDENTIALS_ENCRYPTION_KEY が base64 ではありません"))?;
        let key: [u8; 32] = bytes
            .try_into()
            .map_err(|_| anyhow!("CREDENTIALS_ENCRYPTION_KEY は 32 バイトにしてください"))?;
        Ok(Self(key))
    }

    pub fn decrypt(&self, data: &[u8]) -> anyhow::Result<String> {
        if data.len() < IV_LENGTH + TAG_LENGTH {
            bail!("暗号化されたログイン情報の形式が正しくありません");
        }
        let (iv, rest) = data.split_at(IV_LENGTH);
        let (tag, body) = rest.split_at(TAG_LENGTH);
        // aes-gcm クレートは ciphertext | tag の順で受け取る
        let mut sealed = Vec::with_capacity(body.len() + TAG_LENGTH);
        sealed.extend_from_slice(body);
        sealed.extend_from_slice(tag);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.0));
        let plain = cipher
            .decrypt(Nonce::from_slice(iv), sealed.as_ref())
            .map_err(|_| {
                anyhow!("ログイン情報を復号できません（暗号化の鍵が登録時と違う可能性があります）")
            })?;
        String::from_utf8(plain).map_err(|_| anyhow!("ログイン情報が UTF-8 ではありません"))
    }

    /// テスト用: API と同じ形式で暗号化する
    #[cfg(test)]
    pub fn encrypt(&self, plaintext: &str, iv: [u8; IV_LENGTH]) -> Vec<u8> {
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.0));
        let sealed = cipher
            .encrypt(Nonce::from_slice(&iv), plaintext.as_bytes())
            .unwrap();
        let (body, tag) = sealed.split_at(sealed.len() - TAG_LENGTH);
        [&iv[..], tag, body].concat()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 鍵 0x01 × 32
    const KEY_B64: &str = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
    /// API（node:crypto、apps/api/src/lib/crypto.ts と同じ処理）で "p@ss-日本語" を暗号化した値（iv は 0x02 × 12）
    const NODE_ENCRYPTED: &str = "AgICAgICAgICAgICHJgh4vA09iJPjMM8v1dAMneWujpnsVZYNVAQIPY5";

    #[test]
    fn decrypts_what_it_encrypts() {
        let key = CredentialKey::parse(KEY_B64).unwrap();
        let data = key.encrypt("p@ss-日本語", [2; 12]);
        assert_eq!(key.decrypt(&data).unwrap(), "p@ss-日本語");
    }

    #[test]
    fn decrypts_api_format() {
        let key = CredentialKey::parse(KEY_B64).unwrap();
        let data = STANDARD.decode(NODE_ENCRYPTED).unwrap();
        assert_eq!(key.decrypt(&data).unwrap(), "p@ss-日本語");
    }

    #[test]
    fn wrong_key_or_broken_data_fail() {
        let key = CredentialKey::parse(KEY_B64).unwrap();
        let other = CredentialKey::parse(&STANDARD.encode([9u8; 32])).unwrap();
        let data = key.encrypt("secret", [2; 12]);
        assert!(other.decrypt(&data).is_err());
        assert!(key.decrypt(&data[..10]).is_err());
    }

    #[test]
    fn rejects_bad_keys() {
        assert!(CredentialKey::parse("not base64!").is_err());
        assert!(CredentialKey::parse(&STANDARD.encode([1u8; 16])).is_err());
        assert_eq!(
            format!("{:?}", CredentialKey::parse(KEY_B64).unwrap()),
            "CredentialKey(***)"
        );
    }
}
