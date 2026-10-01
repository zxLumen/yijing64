#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 SwiftUI 应用的六十四卦数据导出为 Web(TypeScript) 版可用的 JSON。

依赖：仅 Python 3 标准库（无需 pip 安装任何东西）。

数据来源（三个源）：
  A. 结构性表格  YijingCore/Sources/YijingCore/Models/HexagramData.swift
                 —— `records` 数组里的 64 条 `Record(...)` 字面量。
  B. 古典文本    scripts/hexagram_content.json
                 —— 卦辞 / 爻辞 / 用九用六。
  C. 白话译文    scripts/divination.json
                 —— 以卦序字符串("1".."64")为键的译文。

产出：
  web/src/data/hexagrams.json  结构性数据（卦序/名称/上下卦/宫/爻位掩码）
  web/src/data/contents.json   内容数据（卦辞/爻辞/白话/用九用六）

用法：
    python3 scripts/export_web_data.py

脚本可重复运行且结果确定：固定键序、UTF-8、ensure_ascii=False、2 空格缩进、
行尾换行。校验失败时打印报告并以非零状态码退出。

注意：`lines` 掩码的位定义 —— bit 3..5 为上卦，bit 0..2 为下卦，
即 lines = (upper_mask << 3) | lower_mask。`Palace.rawValue` 与
`TrigramKind.rawValue` 数值一致，都是三爻的位掩码，故三者共用同一张表。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# 路径（相对脚本位置解析，便于在任意工作目录下运行）
# --------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent

SWIFT_SOURCE = ROOT / "YijingCore" / "Sources" / "YijingCore" / "Models" / "HexagramData.swift"
CONTENT_SOURCE = ROOT / "scripts" / "hexagram_content.json"
DIVINATION_SOURCE = ROOT / "scripts" / "divination.json"

OUT_DIR = ROOT / "web" / "src" / "data"
OUT_HEXAGRAMS = OUT_DIR / "hexagrams.json"
OUT_CONTENTS = OUT_DIR / "contents.json"

# --------------------------------------------------------------------------
# 常量
# --------------------------------------------------------------------------

#: 三爻位掩码（TrigramKind.rawValue == Palace.rawValue）
MASK: dict[str, int] = {
    "qian": 0b111,  # 7 乾
    "dui": 0b011,   # 3 兑
    "li": 0b101,    # 5 离
    "zhen": 0b001,  # 1 震
    "xun": 0b110,   # 6 巽
    "kan": 0b010,   # 2 坎
    "gen": 0b100,   # 4 艮
    "kun": 0b000,   # 0 坤
}

#: 八宫展示顺序：乾 兑 离 震 巽 坎 艮 坤
PALACE_ORDER: list[tuple[str, str]] = [
    ("qian", "乾"),
    ("dui", "兑"),
    ("li", "离"),
    ("zhen", "震"),
    ("xun", "巽"),
    ("kan", "坎"),
    ("gen", "艮"),
    ("kun", "坤"),
]

#: 回退占位文本 —— 与 Swift 端
#: `HexagramData.content(forKingWenNumber:)` 的回退保持一致。
JUDGEMENT_FALLBACK = "[卦辞待补充]"
DIVINATION_FALLBACK = "[白话解读待补充]"
ALLOWED_PLACEHOLDERS = {JUDGEMENT_FALLBACK, DIVINATION_FALLBACK}

#: 未替换的占位/待办痕迹（方括号词，或「待补充」「TODO」等）
PLACEHOLDER_RE = re.compile(
    r"\[[^\[\]\n]{1,24}\]|待补充|待填|TODO|TBD|FIXME|占位|xxx|XXX"
)

#: hexagram_content.json 的单条记录
RECORD_RE = re.compile(
    r"Record\(\s*"
    r"number:\s*(?P<number>\d+)\s*,\s*"
    r"name:\s*\"(?P<name>[^\"]*)\"\s*,\s*"
    r"fullName:\s*\"(?P<full_name>[^\"]*)\"\s*,\s*"
    r"upper:\s*\.(?P<upper>\w+)\s*,\s*"
    r"lower:\s*\.(?P<lower>\w+)\s*,\s*"
    r"palace:\s*\.(?P<palace>\w+)\s*,?\s*\)"
)

RECORDS_ARRAY_RE = re.compile(r"static\s+let\s+records\s*:\s*\[Record\]\s*=\s*\[")

HEXAGRAM_KEYS = ("number", "name", "fullName", "upper", "lower", "palace", "lines")
CONTENT_KEYS = ("number", "judgementText", "lineTexts", "divinationText", "extraLine")


class ExportError(RuntimeError):
    """源数据无法解析时抛出。"""


# --------------------------------------------------------------------------
# 解析
# --------------------------------------------------------------------------


def parse_swift_records(path: Path) -> list[dict]:
    """从 HexagramData.swift 的 `records` 数组里解析 64 条结构记录。"""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:  # pragma: no cover - 环境问题
        raise ExportError(f"读取 Swift 源文件失败：{path}（{exc}）") from exc

    start_match = RECORDS_ARRAY_RE.search(text)
    if start_match is None:
        raise ExportError(f"未在 {path} 中找到 `static let records: [Record] = [`")

    # 数组区域：从 `[` 到与之匹配的收尾 `]`（本文件中为单独一行 `    ]`）。
    body_start = text.index("[", start_match.end() - 1)
    end_match = re.search(r"^\s*\]", text[body_start:], re.MULTILINE)
    if end_match is None:
        raise ExportError(f"未在 {path} 中找到 `records` 数组的结束 `]`")
    body = text[body_start : body_start + end_match.start()]

    records: list[dict] = []
    for match in RECORD_RE.finditer(body):
        upper = match.group("upper")
        lower = match.group("lower")
        palace = match.group("palace")
        for label, value in (("upper", upper), ("lower", lower), ("palace", palace)):
            if value not in MASK:
                raise ExportError(f"未知的{mask_label(label)}值 `.{value}`（序号 {match.group('number')}）")
        records.append(
            {
                "number": int(match.group("number")),
                "name": match.group("name"),
                "fullName": match.group("full_name"),
                "upper": upper,
                "lower": lower,
                "palace": palace,
                "lines": (MASK[upper] << 3) | MASK[lower],
            }
        )

    if not records:
        raise ExportError(f"未能从 {path} 的 `records` 数组中解析出任何记录")
    return records


def mask_label(label: str) -> str:
    return {"upper": "上卦", "lower": "下卦", "palace": "宫"}[label]


def load_json(path: Path):
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except OSError as exc:  # pragma: no cover - 环境问题
        raise ExportError(f"读取 JSON 失败：{path}（{exc}）") from exc
    except json.JSONDecodeError as exc:
        raise ExportError(f"JSON 格式错误：{path}（{exc}）") from exc


def build_hexagrams(records: list[dict]) -> list[dict]:
    """构造 hexagrams.json 的条目（键序固定）。"""
    entries = []
    for record in sorted(records, key=lambda item: item["number"]):
        entries.append(
            {
                "number": record["number"],
                "name": record["name"],
                "fullName": record["fullName"],
                "upper": record["upper"],
                "lower": record["lower"],
                "palace": record["palace"],
                "lines": record["lines"],
            }
        )
    return entries


def build_contents(content_raw: list, divination_raw: dict) -> tuple[list[dict], dict]:
    """构造 contents.json 的条目，并返回回退统计。"""
    by_number = {}
    for item in content_raw:
        by_number[int(item["number"])] = item

    entries = []
    stats = {"missing_from_content": [], "judgement_fallback": [], "divination_fallback": []}

    for number in sorted(by_number):
        item = by_number[number]

        judgement = (item.get("judgementText") or "").strip()
        if not judgement:
            judgement = JUDGEMENT_FALLBACK
            stats["judgement_fallback"].append(number)

        raw_lines = item.get("lineTexts") or []
        line_texts = [("" if text is None else str(text)) for text in raw_lines[:6]]
        line_texts += [""] * (6 - len(line_texts))  # 不足 6 条补空串

        divination = (divination_raw.get(str(number)) or "").strip()
        if not divination:
            divination = DIVINATION_FALLBACK
            stats["divination_fallback"].append(number)

        extra = item.get("extraLine") or ""
        entries.append(
            {
                "number": number,
                "judgementText": judgement,
                "lineTexts": line_texts,
                "divinationText": divination,
                "extraLine": extra if extra else None,
            }
        )

    stats["missing_from_content"] = sorted(set(range(1, 65)) - set(by_number))
    return entries, stats


def write_json(path: Path, payload) -> None:
    """确定性写出：UTF-8 / 不转义非 ASCII / 2 空格缩进 / 末尾换行。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False)
    path.write_text(text + "\n", encoding="utf-8")


# --------------------------------------------------------------------------
# 校验
# --------------------------------------------------------------------------


class Report:
    """收集校验结果。"""

    def __init__(self) -> None:
        self.checks: list[tuple[bool, str, str]] = []

    def add(self, ok: bool, title: str, detail: str = "") -> None:
        self.checks.append((bool(ok), title, detail))

    @property
    def failed(self) -> list[tuple[bool, str, str]]:
        return [check for check in self.checks if not check[0]]


def validate(
    hexagrams: list[dict],
    contents: list[dict],
    content_names: dict[int, str],
    stats: dict,
) -> Report:
    report = Report()

    # 1) 两个文件各 64 条
    report.add(
        len(hexagrams) == 64 and len(contents) == 64,
        "1. 条目数均为 64",
        f"hexagrams.json={len(hexagrams)} 条，contents.json={len(contents)} 条",
    )

    # 2) 卦序恰为 1..64，无缺漏/重复，且升序
    hex_numbers = [entry["number"] for entry in hexagrams]
    content_numbers = [entry["number"] for entry in contents]
    for label, numbers in (("hexagrams.json", hex_numbers), ("contents.json", content_numbers)):
        expected = list(range(1, 65))
        ascending = numbers == sorted(numbers)
        complete = sorted(numbers) == expected
        unique = len(set(numbers)) == len(numbers)
        detail = f"{label}: 升序={'是' if ascending else '否'}，无重复={'是' if unique else '否'}，覆盖 1..64={'是' if complete else '否'}"
        if not complete:
            missing = sorted(set(expected) - set(numbers))
            dupes = sorted({n for n in numbers if numbers.count(n) > 1})
            detail += f"；缺失={missing or '无'}，重复={dupes or '无'}"
        report.add(ascending and complete and unique, f"2. 卦序 1..64 升序无缺漏（{label}）", detail)

    # 3) 爻位掩码互不相同且恰好覆盖 0..63（应用核心不变量）
    masks = [entry["lines"] for entry in hexagrams]
    distinct = len(set(masks)) == len(masks)
    covers = sorted(masks) == list(range(64))
    detail = f"掩码 {len(set(masks))} 个不同值，min={min(masks)}，max={max(masks)}"
    if not covers:
        missing_masks = sorted(set(range(64)) - set(masks))
        detail += f"；缺失掩码={missing_masks or '无'}"
    report.add(distinct and covers and len(masks) == 64, "3. lines 掩码互异且覆盖 0..63", detail)

    # 4) hexagrams.json 的 name 与 hexagram_content.json 的 name 一致
    mismatches = [
        (entry["number"], entry["name"], content_names.get(entry["number"]))
        for entry in hexagrams
        if content_names.get(entry["number"]) != entry["name"]
    ]
    report.add(
        not mismatches and len(content_names) == 64,
        "4. name 与 hexagram_content.json 一致",
        f"比对 {len(hexagrams)} 条"
        if not mismatches
        else f"不一致 {len(mismatches)} 条：" + "、".join(f"{n}({a}!={b})" for n, a, b in mismatches[:10]),
    )

    # 5) 每卦爻辞恰好 6 条
    bad_lines = [entry["number"] for entry in contents if len(entry["lineTexts"]) != 6]
    empty_line_nums = [
        entry["number"] for entry in contents if not all(text.strip() for text in entry["lineTexts"])
    ]
    report.add(
        not bad_lines,
        "5. lineTexts 均为 6 条",
        f"全部合规" if not bad_lines else f"异常卦序={bad_lines}",
    )
    # 长度不足时按规范补空串；此处补出来的空项即代表真实数据缺失。
    report.add(
        not empty_line_nums,
        "5b. 爻辞无空项（真实数据完整）",
        "全部合规" if not empty_line_nums else f"存在空爻辞的卦序={empty_line_nums}",
    )

    # 6) extraLine 仅 1、2 两卦非 null
    non_null = sorted(entry["number"] for entry in contents if entry.get("extraLine") is not None)
    report.add(
        non_null == [1, 2],
        "6. extraLine 仅卦序 1、2 非 null",
        f"非 null 卦序={non_null}",
    )

    # 7) 除既定回退外，不得残留未替换的占位文本
    stray: list[str] = []
    for entry in contents:
        for field in ("judgementText", "divinationText"):
            for token in PLACEHOLDER_RE.findall(entry.get(field) or ""):
                if token not in ALLOWED_PLACEHOLDERS:
                    stray.append(f"{entry['number']}.{field}={token}")
    report.add(
        not stray,
        "7. 无未替换的占位文本",
        "未发现残留" if not stray else f"残留 {len(stray)} 处：" + "、".join(stray[:10]),
    )

    # 7b) 真实数据完整性：占位回退本身合法，但意味着源数据有洞，须视为失败。
    for title, key in (
        ("缺失卦辞（已回退为占位）", "judgement_fallback"),
        ("缺失白话译文（已回退为占位）", "divination_fallback"),
        ("hexagram_content.json 缺失卦序", "missing_from_content"),
    ):
        nums = stats.get(key) or []
        report.add(not nums, f"7b. {title}", "无" if not nums else f"涉及卦序：{nums}")

    return report


# --------------------------------------------------------------------------
# 报告
# --------------------------------------------------------------------------


def print_report(
    report: Report,
    hexagrams: list[dict],
    contents: list[dict],
    stats: dict,
    out_paths: list[Path],
) -> None:
    line = "─" * 60
    print(line)
    print("六十四卦数据导出报告")
    print(line)

    print("\n【校验】")
    for ok, title, detail in report.checks:
        print(f"  [{'通过' if ok else '失败'}] {title}" + (f" — {detail}" if detail else ""))

    print("\n【产出】")
    print(f"  {OUT_HEXAGRAMS.relative_to(ROOT)}：{len(hexagrams)} 条，{out_paths[0].stat().st_size} 字节")
    print(f"  {OUT_CONTENTS.relative_to(ROOT)}：{len(contents)} 条，{out_paths[1].stat().st_size} 字节")

    print("\n【八宫分布】（乾 兑 离 震 巽 坎 艮 坤）")
    counts: dict[str, list[int]] = {key: [] for key, _ in PALACE_ORDER}
    for entry in hexagrams:
        if entry["palace"] in counts:
            counts[entry["palace"]].append(entry["number"])
    for key, label in PALACE_ORDER:
        nums = sorted(counts[key])
        print(f"  {label}宫：{len(nums)} 卦（{', '.join(str(n) for n in nums)}）")

    print("\n【数据质量】")
    for title, key in (
        ("缺失卦辞（已回退为占位）", "judgement_fallback"),
        ("缺失白话译文（已回退为占位）", "divination_fallback"),
        ("hexagram_content.json 缺失卦序", "missing_from_content"),
    ):
        nums = stats[key]
        print(f"  {title}：{'无' if not nums else nums}")

    print("\n【首尾条目】")
    for path, payload in ((OUT_HEXAGRAMS, hexagrams), (OUT_CONTENTS, contents)):
        print(f"\n  {path.relative_to(ROOT)} — 首条（第 {payload[0]['number']} 卦）：")
        print(indent_block(json.dumps(payload[0], ensure_ascii=False, indent=2), "    "))
        print(f"  {path.relative_to(ROOT)} — 末条（第 {payload[-1]['number']} 卦）：")
        print(indent_block(json.dumps(payload[-1], ensure_ascii=False, indent=2), "    "))

    print("\n" + line)
    if report.failed:
        print(f"结果：{len(report.failed)} 项校验失败。")
    else:
        print("结果：全部校验通过。")
    print(line)


def indent_block(text: str, prefix: str) -> str:
    return "\n".join(prefix + row for row in text.splitlines())


# --------------------------------------------------------------------------
# 入口
# --------------------------------------------------------------------------


def main() -> int:
    try:
        records = parse_swift_records(SWIFT_SOURCE)
        content_raw = load_json(CONTENT_SOURCE)
        divination_raw = load_json(DIVINATION_SOURCE)
    except ExportError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 2

    if not isinstance(content_raw, list):
        print(f"错误：{CONTENT_SOURCE} 顶层应为数组", file=sys.stderr)
        return 2
    if not isinstance(divination_raw, dict):
        print(f"错误：{DIVINATION_SOURCE} 顶层应为对象", file=sys.stderr)
        return 2

    content_names = {int(item["number"]): item["name"] for item in content_raw}

    hexagrams = build_hexagrams(records)
    contents, stats = build_contents(content_raw, divination_raw)

    write_json(OUT_HEXAGRAMS, hexagrams)
    write_json(OUT_CONTENTS, contents)

    report = validate(hexagrams, contents, content_names, stats)
    print_report(report, hexagrams, contents, stats, [OUT_HEXAGRAMS, OUT_CONTENTS])

    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())