/** 单词朗读（Web Speech API TTS，零依赖零成本） */

let speaking = false;

/** 朗读单词（en-US，语速 0.9 学习友好）；连续调用会打断前一个 */
export function speakWord(word: string, rate = 0.9): void {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    if (!word.trim()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word.trim());
    u.lang = 'en-US';
    u.rate = rate;
    u.onend = () => { speaking = false; };
    u.onerror = () => { speaking = false; };
    speaking = true;
    speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function isSpeaking(): boolean {
  return speaking;
}
