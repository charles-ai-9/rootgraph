/** localStorage 安全写入：配额满 / 隐私模式等异常静默降级，避免整个应用崩溃 */
export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private-mode errors */
  }
}
