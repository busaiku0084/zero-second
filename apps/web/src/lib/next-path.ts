/** ログイン後の移動先。同じサイトの中のパスだけを許し、外部のサイトへは飛ばさない */
export function safeNextPath(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
