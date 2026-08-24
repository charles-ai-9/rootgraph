#!/usr/bin/env python3
"""残留音标第三轮清理（含 IPA+ASCII 引号混合型损坏）：
数据源优先级：dictionaryapi.dev（美式，原词→小写）→ ECDICT-ultimate（英→美保守转换）
"""
import glob
import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('fp', os.path.join(HERE, 'fix-phonetics.py'))
fp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fp)
spec2 = importlib.util.spec_from_file_location('ec', os.path.join(HERE, 'cleanup-ecdict-phonetics.py'))
ec = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(ec)

BAD_CHARS = re.compile(r'[0-9A-Z\u4e00-\u9fff₃（）→=+]')
MNEMONIC = re.compile(r'[→+].*后缀|：.*制作|名词后缀')


def is_bad(ph):
    if not ph:
        return False
    if "'" in ph or '"' in ph:
        return True
    return bool(BAD_CHARS.search(ph)) or bool(MNEMONIC.search(ph)) or ph.startswith(',')


def main():
    targets = set()
    for path in glob.glob('data/textbook-*/*.json'):
        if path.endswith('index.json'):
            continue
        for w in json.load(open(path)).get('words', []):
            ph = (w.get('phonetic') or '').strip()
            if is_bad(ph) and w.get('word'):
                targets.add(w['word'].strip())
    targets = sorted(targets)
    print(f'待修: {len(targets)}', flush=True)

    fixed = {}
    need_ec = set()
    for i, word in enumerate(targets):
        ph, _ = fp.fetch_us_phonetic(word)
        if not ph and word != word.lower():
            ph, _ = fp.fetch_us_phonetic(word.lower())
        if ph:
            fixed[word] = ph
        else:
            need_ec.add(word)
        if (i + 1) % 50 == 0:
            print(f'  API {i + 1}/{len(targets)}，命中 {len(fixed)}', flush=True)
    print(f'API 命中 {len(fixed)}，走 ECDICT: {len(need_ec)}', flush=True)

    if need_ec:
        lookups = set()
        for t in need_ec:
            lookups.add(t.lower())
            lookups.add(t.replace('-', '').lower())
        ecmap = ec.load_ecdict(lookups)
        missed = []
        for t in need_ec:
            src = next((c for c in (t.lower(), t.replace('-', '').lower()) if c in ecmap), None)
            if src:
                fixed[t] = ec.to_us(ecmap[src])
            else:
                missed.append(t)
        print(f'ECDICT 补齐 {len(need_ec) - len(missed)}，仍缺: {missed}', flush=True)

    changed = 0
    for path in glob.glob('data/textbook-*/*.json'):
        if path.endswith('index.json'):
            continue
        d = json.load(open(path))
        dirty = False
        for w in d.get('words', []):
            word = (w.get('word') or '').strip()
            ph = fixed.get(word)
            if ph and w.get('phonetic') != ph:
                w['phonetic'] = ph
                dirty = True
                changed += 1
        if dirty:
            kv, se, es = fp.detect_style(path)
            content = fp.jackson_dumps(d, kv, se, es)
            assert json.loads(content) == d
            with open(path, 'w') as f:
                f.write(content)
    print(f'已应用 {changed} 条', flush=True)


if __name__ == '__main__':
    main()
