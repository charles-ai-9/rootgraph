#!/usr/bin/env python3
"""
全库音标重取：从 dictionaryapi.dev 获取美式音标，覆盖 data/**/*.json 的 phonetic 字段。
- 优先取带 -us.mp3 美音音频的音标；无美音时取首个文本音标
- 保持原文件格式：indent=2、" : " 分隔符、键序不变
- 结果缓存在 scripts/us-phonetics-cache.json（可断点续跑）
用法：python3 scripts/fix-phonetics.py [--workers N]
"""
import json
import glob
import os
import re
import sys
import threading
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

API = 'https://api.dictionaryapi.dev/api/v2/entries/en/{word}'
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'us-phonetics-cache.json')

# 全局限速：免费 API 并发突发会被 429，按固定间隔串行放行（约 2.5 req/s）
_throttle = threading.Lock()
_next_at = [0.0]


def throttle():
    with _throttle:
        now = time.time()
        wait = _next_at[0] - now
        if wait > 0:
            time.sleep(wait)
            now = time.time()
        _next_at[0] = now + 0.3


def load_cache():
    if not os.path.exists(CACHE):
        return {}
    # 重试：防御另一进程正在原子替换缓存的瞬时窗口，以及意外损坏（损坏时备份后重抓）
    for attempt in range(6):
        try:
            with open(CACHE) as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            print(f'缓存解析失败(第{attempt + 1}次): {e}', flush=True)
            if attempt == 5:
                backup = CACHE + '.corrupt'
                os.replace(CACHE, backup)
                print(f'缓存已备份为 {backup}，从零重抓', flush=True)
                return {}
            time.sleep(1.0)
    return {}


def save_cache(cache):
    tmp = CACHE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(cache, f, ensure_ascii=False)
    os.replace(tmp, CACHE)


def fetch_us_phonetic(word):
    """返回 (音标文本或 None, 状态)；429/502 自动退避重试"""
    url = API.format(word=urllib.request.quote(word))
    data = None
    for attempt in range(6):
        throttle()
        req = urllib.request.Request(url, headers={'User-Agent': 'rootgraph-phonetic-fixer/1.0'})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None, 'notfound'
            if e.code in (429, 502, 503):
                time.sleep(1.0 * (attempt + 1))  # 短退避，配合全局限速避免雪崩
                continue
            return None, f'http{e.code}'
        except Exception:
            time.sleep(1.5)
    if data is None:
        return None, 'ratelimited'

    us_text = None
    any_text = None
    for entry in data:
        for ph in entry.get('phonetics', []):
            text = (ph.get('text') or '').strip().strip('/')
            if not text:
                continue
            audio = ph.get('audio') or ''
            if any_text is None:
                any_text = text
            if '-us' in audio or '-en-us' in audio:
                us_text = text
                break
        if us_text:
            break
    return (us_text or any_text), ('ok' if (us_text or any_text) else 'empty')


def collect_words():
    words = set()
    for path in glob.glob('data/textbook-*/*.json'):
        if path.endswith('index.json'):
            continue
        with open(path) as f:
            d = json.load(f)
        for w in d.get('words', []):
            word = (w.get('word') or '').strip()
            if word:
                words.add(word)
    return sorted(words)


def jackson_dumps(obj, kv_sep=' : ', slash_escape=True, empty_sep='\n\n'):
    """按源文件风格序列化：可配置键值分隔符、斜杠转义、空数组形态。
    empty_sep 传 callable 时，按该空数组在原文中的实际内容逐个裁决。
    注意：json.dump(indent=2) 会忽略 item_separator，不能用来保持格式。"""
    out = []
    empty_idx = [0]

    def esc(s):
        r = json.dumps(s, ensure_ascii=False)
        return r.replace('/', '\\/') if slash_escape else r

    def emit(v, depth):
        pad = '  ' * depth
        if isinstance(v, dict):
            if not v:
                out.append('{}')
                return
            out.append('{\n')
            items = list(v.items())
            for i, (k, val) in enumerate(items):
                out.append('  ' * (depth + 1) + esc(k) + kv_sep)
                emit(val, depth + 1)
                if i < len(items) - 1:
                    out.append(',')
                out.append('\n')
            out.append(pad + '}')
        elif isinstance(v, list):
            if not v:
                # 源数据中空数组有两种形态：带换行的 [\n\n<pad>] 或紧凑 []，逐个跟随原文；
                # 捕获的原文内容已含缩进，直接原样回放，不再追加 pad
                sep = empty_sep(empty_idx[0]) if callable(empty_sep) else empty_sep
                empty_idx[0] += 1
                out.append('[' + sep + ']')
                return
            out.append('[\n')
            for i, item in enumerate(v):
                out.append('  ' * (depth + 1))
                emit(item, depth + 1)
                if i < len(v) - 1:
                    out.append(',')
                out.append('\n')
            out.append(pad + ']')
        elif isinstance(v, str):
            out.append(esc(v))
        else:
            out.append(json.dumps(v, ensure_ascii=False))

    emit(obj, 0)
    return ''.join(out)


def scan_bracket_pairs(raw):
    r"""JSON 感知地扫描所有方括号对（含嵌套，跳过字符串内部，正确处理转义），
    按开括号顺序返回每个括号对内内容，与解析后的数组遍历顺序一致"""
    pairs = []
    stack = []
    in_str = False
    esc_flag = False
    for i, ch in enumerate(raw):
        if in_str:
            if esc_flag:
                esc_flag = False
            elif ch == '\\':
                esc_flag = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == '[':
            stack.append(i)
        elif ch == ']' and stack:
            start = stack.pop()
            pairs.append(raw[start + 1:i])
    return pairs


def detect_style(path):
    """探测源文件格式风格：键值分隔符、斜杠是否转义；空数组按原文逐个返回其括号内内容"""
    raw = open(path).read()
    kv_sep = ' : ' if re.search(r'"[^"]*" : ', raw) else ': '
    slash_escape = '\\/' in raw
    empties = [c for c in scan_bracket_pairs(raw) if not c.strip()]
    return kv_sep, slash_escape, (lambda idx: empties[idx] if idx < len(empties) else '\n\n')


def apply_to_files(cache):
    changed_entries = 0
    changed_files = 0
    for path in glob.glob('data/textbook-*/*.json'):
        if path.endswith('index.json'):
            continue
        with open(path) as f:
            d = json.load(f)
        dirty = False
        for w in d.get('words', []):
            word = (w.get('word') or '').strip()
            if not word:
                continue
            rec = cache.get(word)
            if not rec:
                continue
            ph = rec.get('us') if isinstance(rec, dict) else rec
            if not ph:
                continue
            if w.get('phonetic') != ph:
                w['phonetic'] = ph
                dirty = True
                changed_entries += 1
        if dirty:
            kv_sep, slash_escape, empty_sep = detect_style(path)
            content = jackson_dumps(d, kv_sep, slash_escape, empty_sep)
            # 安全校验：回读必须与原数据等价，否则不写入（防止格式器 bug 污染数据）
            if json.loads(content) != d:
                raise SystemExit(f'格式校验失败，中止: {path}')
            with open(path, 'w') as f:
                f.write(content)
            changed_files += 1
    return changed_entries, changed_files


def main():
    workers = 3
    if '--workers' in sys.argv:
        workers = int(sys.argv[sys.argv.index('--workers') + 1])

    cache = load_cache()
    # 失败记录（限流/网关错误）不视为终态，重跑时重试；仅 ok/empty/notfound 是终态
    FINAL = ('ok', 'empty', 'notfound')
    cache = {w: r for w, r in cache.items() if isinstance(r, dict) and r.get('status') in FINAL}
    words = collect_words()
    todo = [w for w in words if w not in cache]
    print(f'总单词 {len(words)}，待抓取 {len(todo)}，缓存命中 {len(words) - len(todo)}', flush=True)

    done = 0
    start = time.time()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(fetch_us_phonetic, w): w for w in todo}
        for fut in as_completed(futs):
            w = futs[fut]
            ph, status = fut.result()
            cache[w] = {'us': ph, 'status': status}
            done += 1
            if done % 100 == 0:
                save_cache(cache)
                rate = done / (time.time() - start)
                eta = (len(todo) - done) / rate if rate else 0
                print(f'  {done}/{len(todo)} ({rate:.1f}/s, ETA {eta:.0f}s)', flush=True)
    save_cache(cache)

    stats = {}
    for rec in cache.values():
        st = rec['status'] if isinstance(rec, dict) else 'ok'
        stats[st] = stats.get(st, 0) + 1
    print('抓取状态统计:', stats, flush=True)

    notfound = sorted(w for w, r in cache.items() if isinstance(r, dict) and not r.get('us'))
    print(f'无音标可用 {len(notfound)} 个（保留原值）:', notfound[:80], flush=True)

    entries, files = apply_to_files(cache)
    print(f'完成：更新 {entries} 条音标，涉及 {files} 个文件', flush=True)


if __name__ == '__main__':
    main()
