/** 单词朗读：系统 TTS 优先（离线可用），未响应时自动回退在线发音（有道，国内可达） */

let speaking = false;
let audioEl: HTMLAudioElement | null = null;

/** 在线发音回退（有道 dictvoice，美音 mp3，国内直连可达） */
function speakViaAudio(word: string): void {
  try {
    if (audioEl) {
      audioEl.pause();
      audioEl = null;
    }
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
    const a = new Audio(url);
    audioEl = a;
    a.onended = () => {
      speaking = false;
      audioEl = null;
    };
    a.onerror = () => {
      speaking = false;
      audioEl = null;
    };
    a.play().catch(() => {
      speaking = false;
      audioEl = null;
    });
  } catch {
    speaking = false;
  }
}

/** 朗读单词（en-US，语速 0.9 学习友好）；连续调用会打断前一个 */
export function speakWord(word: string, rate = 0.9): void {
  const w = word.trim();
  if (!w) return;

  // 打断当前播放（TTS 与 audio 双通道）
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
  }

  const useSystemTts = typeof speechSynthesis !== 'undefined';

  if (!useSystemTts) {
    speaking = true;
    speakViaAudio(w);
    return;
  }

  try {
    speechSynthesis.cancel();
    let started = false;
    const finish = () => {
      speaking = false;
    };
    const u = new SpeechSynthesisUtterance(w);
    u.lang = 'en-US';
    u.rate = rate;
    u.onstart = () => {
      started = true;
    };
    u.onend = finish;
    u.onerror = finish;
    speaking = true;
    speechSynthesis.speak(u);

    // 系统 TTS 未响应（如小米浏览器无可用语音引擎）→ 回退在线发音
    window.setTimeout(() => {
      if (started || !speaking) return;
      speaking = false;
      try {
        speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      speakViaAudio(w);
    }, 1200);
  } catch {
    speaking = true;
    speakViaAudio(w);
  }
}

export function isSpeaking(): boolean {
  return speaking;
}
