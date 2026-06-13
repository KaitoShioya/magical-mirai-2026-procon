#!/usr/bin/env python3
"""
dump-session.py — セッション生ログの忠実ダンプツール。

目的: Fable5セッションの会話ログ・サブエージェント思考履歴を、解釈/要約/推測を一切加えず
docs/session_dump/ に忠実コピーする。唯一の改変は「機密リテラルのバイト単位マスク」のみで、
その事実は MANIFEST/REDACTIONS に完全開示する（透明性のための最小限の改変）。

- 改変は SECRETS に列挙したバイト列の置換のみ。それ以外は1バイトも変えない。
- 各ファイルの original/redacted の sha256 を記録し、改変有無を機械的に検証可能にする。
- MANIFEST は機械的事実（パス/バイト数/行数/JSONLのtype分布）のみ記載。内容の解釈はしない。
"""
import hashlib, json, os, glob, shutil

HOME = os.path.expanduser("~")
PROJ = os.path.join(HOME, ".claude", "projects",
                    "C--Users-mrsal-OneDrive--------magical-mirai-2026-procon")
TASKS = os.path.join(HOME, "AppData", "Local", "Temp", "claude",
                     "C--Users-mrsal-OneDrive--------magical-mirai-2026-procon")
DEST = os.path.join(os.path.dirname(__file__), "..", "docs", "session_dump")
DEST = os.path.abspath(DEST)

# 機密リテラル → プレースホルダ。
# 機密値はスクリプトにハードコードせず、実行時に .env から読み込む（スクリプト自体に機密を残さない）。
# .env の各行 KEY=VALUE のうち、マスク対象キーの VALUE を置換対象とする。
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
MASK_KEYS = {
    "TEXT_ALIVE_API_TOKEN": b"[REDACTED_TEXT_ALIVE_API_TOKEN]",
    "GEMINI_API_KEY": b"[REDACTED_GEMINI_API_KEY]",
}

PREFIX_LEN = 12  # フル値に加え、断片化した先頭プレフィックスも保険でマスクする長さ（高エントロピーで誤爆しない）

def load_secrets():
    secrets = []
    if not os.path.exists(ENV_PATH):
        return secrets
    for line in open(ENV_PATH, "r", encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key in MASK_KEYS and val:
            vb = val.encode("utf-8")
            secrets.append((vb, MASK_KEYS[key], key))                       # フル値
            if len(vb) > PREFIX_LEN:
                ph = MASK_KEYS[key][:-1] + b"_PREFIX]"                       # 例: [REDACTED_GEMINI_API_KEY_PREFIX]
                secrets.append((vb[:PREFIX_LEN], ph, key + "(prefix)"))      # 断片の保険
    # 長いリテラルから先に置換（フル→プレフィックスの順）
    secrets.sort(key=lambda t: -len(t[0]))
    return secrets

SECRETS = load_secrets()  # [(secret_bytes, placeholder_bytes, key_name), ...]

def sha256(b): return hashlib.sha256(b).hexdigest()

def type_hist(b):
    """各行を個別に解析し 'type' 値の出現数を返す。JSON解析不能行は (unparseable) として計上。
    1行も解析できなければ None（=非JSONL）。"""
    h = {}
    parsed = 0
    for line in b.split(b"\n"):
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line.decode("utf-8", "replace"))
            t = o.get("type", "(no type key)") if isinstance(o, dict) else "(non-object)"
            parsed += 1
        except Exception:
            t = "(unparseable)"
        h[t] = h.get(t, 0) + 1
    return h if parsed else None

def process(src, dest_sub, dest_name):
    raw = open(src, "rb").read()
    red = raw
    counts = []
    for lit, ph, key in SECRETS:
        c = red.count(lit)
        if c:
            red = red.replace(lit, ph)
        counts.append((ph.decode(), c))   # プレースホルダ文字列で集計（機密を残さない・正確）
    dest_dir = os.path.join(DEST, dest_sub)
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, dest_name)
    open(dest_path, "wb").write(red)
    return {
        "src": src,
        "dest": os.path.relpath(dest_path, DEST).replace("\\", "/"),
        "bytes_original": len(raw),
        "bytes_dumped": len(red),
        "lines": raw.count(b"\n") + (1 if raw and not raw.endswith(b"\n") else 0),
        "sha256_original": sha256(raw),
        "sha256_dumped": sha256(red),
        "modified": raw != red,
        "redactions": {k: v for k, v in counts if v},
        "type_hist": type_hist(raw),
    }

def main():
    os.makedirs(DEST, exist_ok=True)
    records = []
    for f in sorted(glob.glob(os.path.join(PROJ, "*.jsonl"))):
        records.append(process(f, "sessions", os.path.basename(f)))
    for f in sorted(glob.glob(os.path.join(TASKS, "*", "tasks", "*.output"))):
        records.append(process(f, "agent_transcripts", os.path.basename(f)))

    # MANIFEST（機械的事実のみ）
    lines = ["# session_dump MANIFEST（機械生成・無解釈）", ""]
    lines.append("生成: scripts/dump-session.py。改変は機密リテラルのマスクのみ（REDACTIONS参照）。")
    lines.append("各ファイルは original と sha256 を併記し、改変有無を検証可能。`modified=false` は元バイト列と完全一致。")
    lines.append("")
    lines.append("| dumped path | bytes(orig→dump) | lines | modified | sha256(original) |")
    lines.append("|---|---|---|---|---|")
    for r in records:
        b = f"{r['bytes_original']}" + (f"→{r['bytes_dumped']}" if r['modified'] else "")
        lines.append(f"| {r['dest']} | {b} | {r['lines']} | {r['modified']} | `{r['sha256_original']}` |")
    lines.append("")
    lines.append("## JSONL type 分布（各ファイル・機械集計）")
    for r in records:
        if r["type_hist"] is not None:
            hh = ", ".join(f"{k}:{v}" for k, v in sorted(r["type_hist"].items()))
            lines.append(f"- `{r['dest']}`: {hh}")
        else:
            lines.append(f"- `{r['dest']}`: (非JSONL/プレーンテキスト)")
    open(os.path.join(DEST, "MANIFEST.md"), "w", encoding="utf-8").write("\n".join(lines))

    # REDACTIONS（改変の完全開示）
    rl = ["# REDACTIONS（マスクの完全開示・無解釈）", ""]
    rl.append("透明性のための唯一の改変＝機密リテラルのバイト単位置換。対象と件数を以下に開示する。")
    rl.append("値そのものは `.env`（gitignore済）にあり本ダンプには残さない。")
    rl.append("")
    rl.append("| placeholder | 置換件数(ファイル別) |")
    rl.append("|---|---|")
    agg = {}
    for r in records:
        for ph, v in r["redactions"].items():
            agg.setdefault(ph, []).append(f"{os.path.basename(r['dest'])}={v}")
    for ph, files in sorted(agg.items()):
        rl.append(f"| `{ph}` | {', '.join(files)} |")
    if not agg:
        rl.append("| (なし) | 改変なし |")
    open(os.path.join(DEST, "REDACTIONS.md"), "w", encoding="utf-8").write("\n".join(rl))

    print(f"dumped {len(records)} files to {DEST}")
    print("modified files:", [r["dest"] for r in records if r["modified"]])

if __name__ == "__main__":
    main()
