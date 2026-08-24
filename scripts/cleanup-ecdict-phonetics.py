#!/usr/bin/env python3
"""残留音标第二轮清理：从 ECDICT-ultimate 离线词典补音标。
- 只接受含标准 IPA 符号的音标（跳过词典内的 ASCII 简化式）
- 英式 → 美式保守转换（ɒ→ɑ、əʊ→oʊ、ɜː→ɜr、ɪə→ɪr、eə→er、ʊə→ʊr、ɑː→æ 仅限字母 a 类常见词不做，保持 ɑː）
- 预览模式仅打印；加 --apply 才写数据
"""
import csv
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

CSV = '/tmp/ecdict/ultimate.csv'
BAD_CHARS = re.compile(r'[0-9A-Z\u4e00-\u9fff₃（）→=+]')
MNEMONIC = re.compile(r'[→+].*后缀|：.*制作|名词后缀')
IPA_CHARS = re.compile(r'[æɑɒɔəɛɜɪʊʌðθŋʃʒˈˌːɚɝ]')


def is_bad(ph):
    if not ph:
        return False
    if BAD_CHARS.search(ph) or MNEMONIC.search(ph) or ph.startswith(','):
        return True
    if all(ord(c) < 128 for c in ph) and ("'" in ph or not IPA_CHARS.search(ph)):
        return True
    return False


def is_proper_ipa(ph):
    """词典内的音标是否含标准 IPA 符号（允许用 ASCII ' 表重音，后续归一化）"""
    return bool(ph) and bool(IPA_CHARS.search(ph))


def to_us(ph):
    """英式 IPA → 美式 IPA 保守转换"""
    r = ph
    r = r.replace("'", 'ˈ')      # ASCII 单引号重音归一化（, 次重音同理）
    r = r.replace(',', 'ˌ')
    r = r.replace(':', 'ː')       # ASCII 冒号归一为长音符号（先于下方依赖 ː 的替换）
    r = r.replace('(r)', 'r')     # 美式 r 化音节始终发音
    r = r.replace('əʊ', 'oʊ')
    r = r.replace('ɒ', 'ɑ')
    r = r.replace('ɜː', 'ɜr')
    r = r.replace('ɪə', 'ɪr')
    r = r.replace('eə', 'er')
    r = r.replace('ʊə', 'ʊr')
    r = re.sub(r'iːə', 'iə', r)
    return r


def load_ecdict(words):
    """一次遍历 CSV，提取目标词的合规音标"""
    tset = set(words)
    result = {}
    with open(CSV, newline='', encoding='utf-8', errors='ignore') as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            if len(row) < 2 or not row[0]:
                continue
            w = row[0].lower()
            if w in tset and w not in result and is_proper_ipa(row[1]):
                result[w] = row[1].strip()
            if len(result) == len(tset):
                break
    return result


def main():
    apply_mode = '--apply' in sys.argv

    # 收集仍损坏的词
    targets = set()
    for path in glob.glob('data/textbook-*/*.json'):
        if path.endswith('index.json'):
            continue
        for w in json.load(open(path)).get('words', []):
            ph = (w.get('phonetic') or '').strip()
            if is_bad(ph):
                word = (w.get('word') or '').strip()
                if word:
                    targets.add(word)
    print(f'残留损坏词: {len(targets)}', flush=True)

    lookups = set()
    for t in targets:
        lookups.add(t.lower())
        lookups.add(t.replace('-', ''))          # 连字符去除
        lookups.add(t.replace('-', '').lower())
    ec = load_ecdict(lookups)
    print(f'ECDICT 命中: {len(ec)}', flush=True)

    plan = {}
    for t in sorted(targets):
        src = None
        for cand in (t.lower(), t.replace('-', '').lower(), t.replace('-', '')):
            if cand in ec:
                src = cand
                break
        if src:
            plan[t] = to_us(ec[src])
        else:
            plan[t] = None

    for t in sorted(plan):
        mark = 'OK ' if plan[t] else 'MISS'
        print(f'{mark} {t:28s} -> {plan[t]!r}')

    misses = [t for t, v in plan.items() if not v]
    if not apply_mode:
        print(f'\n预览模式：可修 {len(plan) - len(misses)}，仍缺 {len(misses)}: {misses}')
        return

    # 应用
    changed = 0
    for path in glob.glob('data/textbook-*/*.json'):
        if path.endswith('index.json'):
            continue
        d = json.load(open(path))
        dirty = False
        for w in d.get('words', []):
            word = (w.get('word') or '').strip()
            ph = plan.get(word)
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
    print(f'已应用 {changed} 条，仍缺: {misses}')


if __name__ == '__main__':
    main()
