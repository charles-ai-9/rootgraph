#!/usr/bin/env python3
"""残留音标清理：
1) 机械修复：次重音逗号 , → ˌ（仅限已含 IPA 符号的音标）
2) 对仍损坏的词重查 API（原词 → 小写回退），命中则替换
3) 输出最终仍未解决的清单
"""
import importlib.util
import json
import glob
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('fp', os.path.join(HERE, 'fix-phonetics.py'))
fp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fp)

BAD_CHARS = re.compile(r'[0-9A-Z\u4e00-\u9fff₃（）→=+]')
MNEMONIC = re.compile(r'[→+].*后缀|：.*制作|名词后缀')
IPA_CHARS = re.compile(r'[æɑɒɔəɛɜɪʊʌðθŋʃʒˈˌːɚɝ]')


def is_bad(ph):
    if not ph:
        return False
    if BAD_CHARS.search(ph) or MNEMONIC.search(ph) or ph.startswith(','):
        return True
    ascii_only = all(ord(c) < 128 for c in ph)
    if ascii_only and ("'" in ph or not IPA_CHARS.search(ph)):
        return True
    return False


def main():
    # 第一轮：收集损坏词 + 机械修逗号
    targets = set()
    for path in glob.glob('data/textbook-*/*.json'):
        if path.endswith('index.json'):
            continue
        d = json.load(open(path))
        dirty = False
        for w in d.get('words', []):
            ph = (w.get('phonetic') or '').strip()
            if not ph:
                continue
            # 机械修复：已含 IPA 符号但用 , 表示次重音
            if IPA_CHARS.search(ph) and ',' in ph and not BAD_CHARS.search(ph) and "'" not in ph:
                new = ph.replace(',', 'ˌ')
                if new != ph:
                    w['phonetic'] = new
                    dirty = True
                    ph = new
            if is_bad(ph):
                targets.add(w.get('word', '').strip())
        if dirty:
            kv, se, es = fp.detect_style(path)
            content = fp.jackson_dumps(d, kv, se, es)
            assert json.loads(content) == d
            with open(path, 'w') as f:
                f.write(content)

    targets = sorted(t for t in targets if t)
    print(f'逗号已机械修复；仍需查询 {len(targets)} 个词', flush=True)

    # 第二轮：重查（原词 → 小写回退）
    found = {}
    unresolved = []
    for i, word in enumerate(targets):
        ph, status = fp.fetch_us_phonetic(word)
        if not ph and word != word.lower():
            ph, status = fp.fetch_us_phonetic(word.lower())
        if ph:
            found[word] = ph
        else:
            unresolved.append((word, status))
        if (i + 1) % 50 == 0:
            print(f'  {i + 1}/{len(targets)}', flush=True)
    print(f'查到 {len(found)} 个，仍未解决 {len(unresolved)} 个', flush=True)

    # 第三轮：应用查询结果
    changed = 0
    for path in glob.glob('data/textbook-*/*.json'):
        if path.endswith('index.json'):
            continue
        d = json.load(open(path))
        dirty = False
        for w in d.get('words', []):
            word = (w.get('word') or '').strip()
            ph = found.get(word) or found.get(word.lower())
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
    print(f'应用 {changed} 条', flush=True)

    print('\n仍未解决（建议人工或放弃）:')
    for word, status in unresolved:
        print(f'  {word:28s} [{status}]')


if __name__ == '__main__':
    main()
