/* 应用解锁：输入正确密码后在当前设备永久解锁（仅存标记，不存密码） */

// 解锁密码的 SHA-256 哈希；源码中不保存明文密码
const PASSWORD_HASH = 'f2c932b8a8c80e01a757cb93e5a0da5eee79b7912fbb27107592cb4c9c3f5968';
const UNLOCK_KEY = 'rootgraph-unlock-v1';

export function isUnlocked(): boolean {
  try {
    return window.localStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return crypto.subtle.digest('SHA-256', bytes).then((buf) => {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  });
}

/** 校验密码；正确则写入永久解锁标记并返回 true */
export async function tryUnlock(password: string): Promise<boolean> {
  try {
    const hash = await sha256Hex(password);
    if (hash === PASSWORD_HASH) {
      window.localStorage.setItem(UNLOCK_KEY, '1');
      return true;
    }
  } catch {
    /* crypto.subtle 不可用时（非安全上下文）校验失败，保持锁定 */
  }
  return false;
}
