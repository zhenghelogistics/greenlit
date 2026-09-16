#!/usr/bin/env python3
"""
Redact API keys from the local Claude Code transcript.

Overwrites each secret in place with the SAME number of bytes, so the file
length and inode never change -- the running session appends to this file, and
moving it would lose whatever gets written next.

A .prerredact.bak copy is made first. Run:  python3 redact-secrets.py
"""
import re, os, base64, shutil, glob

TRANSCRIPTS = os.path.expanduser(
    '~/.claude/projects/-Users-NgMax-Documents-ChatGPT-demo/*.jsonl')

total = 0
for p in glob.glob(TRANSCRIPTS):
    data = bytearray(open(p, 'rb').read())
    original_len = len(data)
    spans = []

    # Anthropic secret keys.
    for m in re.finditer(rb'sk-ant-api[A-Za-z0-9_\-]{20,}', data):
        spans.append((m.start(), m.end(), b'sk-ant-REDACTED'))

    # Supabase JWTs -- only those whose payload really is a Supabase key,
    # so unrelated base64 in the transcript is left alone.
    for m in re.finditer(
            rb'eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}', data):
        payload = m.group(0).split(b'.')[1]
        payload += b'=' * ((4 - len(payload) % 4) % 4)
        try:
            claims = base64.urlsafe_b64decode(payload)
        except Exception:
            continue
        if b'"role"' in claims and (b'service_role' in claims or b'"anon"' in claims):
            role = b'SERVICE-ROLE' if b'service_role' in claims else b'ANON'
            spans.append((m.start(), m.end(), b'eyJ-REDACTED-' + role))

    if not spans:
        continue

    shutil.copy2(p, p + '.prerredact.bak')
    for start, end, tag in spans:
        filler = tag + b'X' * (end - start - len(tag))
        data[start:end] = filler[:end - start]

    assert len(data) == original_len, 'length changed -- aborting'
    with open(p, 'r+b') as f:
        f.write(data)

    total += len(spans)
    print(f'  {len(spans):3d} redacted in {os.path.basename(p)}')

print(f'done: {total} secret occurrences overwritten')
print('NOTE: .env.local is untouched -- the app still needs its keys there.')
