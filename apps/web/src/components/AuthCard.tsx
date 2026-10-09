import type { ReactNode } from "react";

/** ログイン・初回セットアップ・招待の受け入れの画面の枠 */
export function AuthCard({
  eyebrow,
  title,
  lead,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth">
      <section className="panel auth-card" aria-labelledby="auth-title">
        <div className="auth-head">
          <p className="auth-mark" aria-hidden="true">
            +00:00.000
          </p>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="auth-title">{title}</h1>
          {lead ? <p className="muted">{lead}</p> : null}
        </div>
        {children}
      </section>
      {footer ? <p className="auth-foot">{footer}</p> : null}
    </div>
  );
}
