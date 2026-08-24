#!/usr/bin/env python3
"""
最后一轮兜底：对残留英式音标做保守的英→美机械转换。
规则参考主流词典英美对照（仅替换有明确对应关系的音段，不动无法判定的部分）：
- əʊ/əʊ → oʊ        - ɒ → ɑ              - ɔː → ɔ(r) 按词尾启发
- ɜː → ɜː → ɝ/ɜr     - ɑː(非r前) → ɑ     - ɪə → ɪr / iːr 启发
- eə → er / ɛr       - ʊə → ʊr           - (r) 省略标记 → r
- 词尾 -ɪ/-i 与 -əl 等不处理（英美一致）
"""
import json
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
fp = import_module('fix-phonetics')

BRIT = re.compile(r'ɒ|ɜː|əʊ|ɪə|eə|ʊə|ɑː(?![ɹr])|ɔː(?![ɹr])')


def convert(ph):
    s = ph
    # 双音标条目（分号分隔）逐个转换
    parts = s.split(';')
    out = []
    for part in parts:
        t = part.strip()
        if not t:
            continue
        t = t.replace('əʊ', 'oʊ')
        t = t.replace('ɒ', 'ɑ')
        # ɜː(ɹ)/(r) 整体归并为美语卷舌元音 ɝ；其余 ɜː → ɝ
        t = re.sub(r'ɜː\s*\([ɹr]\)', 'ɝ', t)
        t = t.replace('ɜː', 'ɝ')
        # 英式颚化记法：tj/dj/sj → 美式的 tʃ/dʒ/s（mature、conceptual、individual 美语同样颚化）
        t = t.replace('tj', 'tʃ').replace('dj', 'dʒ').replace('sj', 's')
        # 中合双元音仅在语境明确时转换：后接 (ɹ)/(r)/r/ɹ/词尾/分号。
        # 前接元音的 aʊə/aɪə/ɔɪə（如 empower paʊə）是美式无 r 记法，不动；
        # 后接其他辅音的（如 industrial strɪəl）也不动
        ctx = r'(?=\s*(?:\([ɹr]\)|[rɹ]|;|$))'
        t = re.sub(r'eə', 'ɛr', t)  # eə 总是英式（airspace/haircut）
        # 后接可选 (ɹ)/(r) 时，美式把 r 实读出来（sincere sɪnˈsɪə(ɹ) → sɪnˈsɪr）
        t = re.sub(r'ɪə\s*\([ɹr]\)', 'ɪr', t)
        t = re.sub(r'ʊə\s*\([ɹr]\)', 'ʊr', t)
        # 后接已有 r/ɹ 时双元音短化即可（避免叠出 ɪrr），先于补 r 的分支
        t = re.sub(r'ɪə(?=\s*[rɹ])', 'ɪ', t)
        t = re.sub(r'ʊə(?=\s*[rɹ])', 'ʊ', t)
        t = re.sub('ɪə' + ctx, 'ɪr', t)
        t = re.sub('ʊə' + ctx, 'ʊr', t)
        # 词首 plʊə-（plurality）与 tʃ/dʒ + ʊə 音节（conceptual/prematurely）：美式读 ʊr
        t = re.sub(r'^plʊə', 'plʊr', t)
        t = re.sub(r'([tʃdʒ])ʊə', r'\1ʊr', t)
        # ɛːɹ → ɛr（planetarium 类长音冗余）
        t = t.replace('ɛːɹ', 'ɛr')
        # kjʊə → kju（procurement）；ʒ(ʊə) → ʒ（usually）
        t = t.replace('kjʊə', 'kju')
        t = t.replace('ʒ(ʊə)', 'ʒ').replace('ʒʊə', 'ʒu')
        # ɑː / ɔː / iː / uː 后紧跟 (r) 或 r/ɹ：保留长音并保 r；否则缩短（美式非 r 化元音不带长音）
        t = re.sub(r'ɑː(?=\s*[rɹ(])', 'ɑː', t)
        t = t.replace('ɑː', 'ɑ')
        t = re.sub(r'ɔː(?=\s*[rɹ(])', 'ɔː', t)
        t = t.replace('ɔː', 'ɔ')
        # 英式 (r) 省略标记：美式拼写发音通常写出 r
        t = t.replace('(r)', 'r')
        # 清理可能产生的 ːr 堆叠前的残余：ɔːr 保留（如 door 美式 /ɔːr/ 常见）
        out.append(t)
    return ';'.join(out) if len(out) > 1 else (out[0] if out else ph)


def main():
    dry_run = '--dry-run' in sys.argv
    applied = 0
    changed_files = 0
    samples = []
    for path in sorted(glob.glob('data/textbook-*/*.json')):
        if path.endswith('index.json'):
            continue
        d = json.load(open(path))
        changed = False
        for w in d.get('words', []):
            ph = (w.get('phonetic') or '').strip()
            if not ph or not BRIT.search(ph):
                continue
            new_ph = convert(ph)
            if new_ph != ph:
                if len(samples) < 15:
                    samples.append((w.get('word'), ph, new_ph))
                if not dry_run:
                    w['phonetic'] = new_ph
                changed = True
                applied += 1
        if changed and not dry_run:
            kv, se, es = fp.detect_style(path)
            out = fp.jackson_dumps(d, kv, se, es)
            json.loads(out)  # 回读校验
            with open(path, 'w') as f:
                f.write(out)
            changed_files += 1
    print(('预览' if dry_run else '应用'), '转换:', applied, '处，文件:', changed_files)
    for word, old, new in samples:
        print(f'  {word}: {old} → {new}')


if __name__ == '__main__':
    main()
