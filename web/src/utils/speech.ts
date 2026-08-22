/** 单词朗读（Web Speech API TTS，零依赖零成本） */

let speaking = false;

/** 预热语音引擎（iOS 首次调用需要先加载 voices） */
function warmVoices(): void {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.getVoices();
  } catch {
    /* ignore */
  }
}

function buildUtterance(word: string, rate: number): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = rate;
  return u;
}

/** 朗读单词（en-US，语速 0.9 学习友好）；连续调用会打断前一个。
 *  iOS Safari 首次 speak 可能静默失败：1 秒内未触发 onstart 则自动重试一次。 */
export function speakWord(word: string, rate = 0.9): void {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    const w = word.trim();
    if (!w) return;
    warmVoices();
    speechSynthesis.cancel();

    let started = false;
    const finish = () => { speaking = false; };
    const u = buildUtterance(w, rate);
    u.onstart = () => { started = true; };
    u.onend = finish;
    u.onerror = finish;
    speaking = true;
    speechSynthesis.speak(u);

    window.setTimeout(() => {
      if (started || !speaking) return;
      try {
        speechSynthesis.cancel();
        const u2 = buildUtterance(w, rate);
        u2.onend = finish;
        u2.onerror = finish;
        speechSynthesis.speak(u2);
      } catch {
        speaking = false;
      }
    }, 1000);
  } catch {
    /* ignore */
  }
}

export function isSpeaking(): boolean {
  return speaking;
}
