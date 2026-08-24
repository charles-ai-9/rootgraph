#!/usr/bin/env python3
"""
英式残留音标重抓：对仍带英式特征的音标，从 dictionaryapi.dev 重取并按美式特征打分择优。
- 打分规则：美式特征加分（ɝ ɚ ɹ(非英式语境) oʊ ɑʊ æ ʌ），英式特征减分（ɒ ɜː ɔː(非r) əʊ ɪə eə ʊə ɑː(非r)）
- 带 -us 音频的条目直接满分优先
- 复用 fix-phonetics 的序列化器保持原文件格式
用法：python3 scripts/fetch-us-round2.py [--dry-run]
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
fp = import_module('fix-phonetics')

API = 'https://api.dictionaryapi.dev/api/v2/entries/en/{word}'
CACHE2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'us-phonetics-cache-round2.json')

BRIT = re.compile(r'ɒ|ɜː|ɔː(?!ɹ)|əʊ|ɪə|eə|ʊə|ɑː(?![ɹr])')
US_MARK = re.compile(r'ɝ|ɚ|oʊ|æ')

_throttle = threading.Lock()
_next_at = [0.0]


def throttle():
    with _throttle:
        now = time.time()
        wait = _next_at[0] - now
        if wait > 0:
            time.sleep(wait)
        _next_at[0] = time.time() + 0.35


def score_us(text):
    """美式可信度打分；英式特征越多越负"""
    s = 0
    s += len(US_MARK.findall(text)) * 2
    s -= len(BRIT.findall(text)) * 3
    return s


def is_british(ph):
    return bool(BRIT.search(ph))


def collect_british_words():
    """收集所有音标带英式特征的单词"""
    words = set()
    for path in glob.glob('data/textbook-*/*.json'):
        if path.endswith('index.json'):
            continue
        d = json.load(open(path))
        for w in d.get('words', []):
            ph = (w.get('phonetic') or '').strip()
            word = (w.get('word') or '').strip()
            if word and ph and is_british(ph):
                words.add(word)
    return sorted(words)


def fetch_best_us(word):
    """返回 (最佳美式音标或 None, 状态)"""
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
                time.sleep(1.0 * (attempt + 1))
                continue
            return None, f'http{e.code}'
        except Exception:
            time.sleep(1.5)
    if data is None:
        return None, 'ratelimited'

    best = None
    best_score = -999
    for entry in data:
        for ph in entry.get('phonetics', []):
            text = (ph.get('text') or '').strip().strip('/')
            if not text:
                continue
            audio = ph.get('audio') or ''
            if '-us' in audio or '-en-us' in audio:
                return text, 'ok'  # 美音音频直接胜出
            s = score_us(text)
            if s > best_score:
                best_score = s
                best = text
    if best is None:
        return None, 'empty'
    if best_score < 0:
        return best, 'still_british'  # 没有更好的，标记保留原值
    return best, 'ok'


def main():
    dry_run = '--dry-run' in sys.argv
    words = collect_british_words()
    print(f'英式残留单词: {len(words)}')

    cache = {}
    if os.path.exists(CACHE2):
        cache = json.load(open(CACHE2))
        print(f'已有缓存: {len(cache)}')

    todo = [w for w in words if w not in cache]
    print(f'待抓取: {len(todo)}')

    for i, w in enumerate(todo):
        ph, status = fetch_best_us(w)
        cache[w] = {'phonetic': ph, 'status': status}
        if (i + 1) % 100 == 0 or i == len(todo) - 1:
            tmp = CACHE2 + '.tmp'
            with open(tmp, 'w') as f:
                json.dump(cache, f, ensure_ascii=False)
            os.replace(tmp, CACHE2)
            print(f'进度 {i + 1}/{len(todo)}', flush=True)

    if dry_run:
        stats = {}
        for r in cache.values():
            stats[r['status']] = stats.get(r['status'], 0) + 1
        print('状态分布:', stats)
        return

    # 应用：仅当抓到更优美式音标时替换
    applied = skipped = 0
    for path in sorted(glob.glob('data/textbook-*/*.json')):
        if path.endswith('index.json'):
            continue
        d = json.load(open(path))
        changed = False
        for w in d.get('words', []):
            word = (w.get('word') or '').strip()
            r = cache.get(word)
            if not r or not r.get('phonetic') or r['status'] not in ('ok',):
                continue
            new_ph = r['phonetic']
            if w.get('phonetic') and new_ph != w['phonetic'] and not is_british(new_ph):
                w['phonetic'] = new_ph
                changed = True
                applied += 1
        if changed:
            raw = open(path).read()
            kv, se, es = fp.detect_style(path)
            out = fp.jackson_dumps(d, kv, se, es)
            json.loads(out)  # 回读校验
            with open(path, 'w') as f:
                f.write(out)
    print(f'应用替换: {applied} 处（跳过仍英式的 {skipped}）')


if __name__ == '__main__':
    main()
