import { useState } from 'react';
import { tryUnlock } from '../utils/unlock';

/** 密码锁屏：首次访问拦截，输入正确密码后当前设备永久解锁 */
export function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    if (!password.trim() || checking) return;
    setChecking(true);
    const ok = await tryUnlock(password);
    setChecking(false);
    if (ok) {
      onUnlock();
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="unlock-screen">
      <form
        className={`unlock-card${error ? ' unlock-error' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="unlock-title">RootGraph</div>
        <div className="unlock-sub">私人应用 · 请输入解锁密码</div>
        <input
          className="unlock-input"
          type="password"
          value={password}
          placeholder="密码"
          autoFocus
          autoComplete="off"
          onChange={(e) => {
            setPassword(e.target.value);
            setError(false);
          }}
        />
        <button className="unlock-btn" type="submit" disabled={checking || !password.trim()}>
          {checking ? '验证中…' : '解锁'}
        </button>
        {error && <div className="unlock-hint">密码不正确</div>}
      </form>
    </div>
  );
}
