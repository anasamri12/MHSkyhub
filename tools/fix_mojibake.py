from pathlib import Path
import re

TARGETS = [
    Path("passenger/index.html"),
    Path("passenger/js/app.js"),
    Path("crew/index.html"),
    Path("crew/js/app.js"),
]

TOKEN_PATTERN = re.compile(r'''[^\s<>\"']*[ÃÂâð][^\s<>\"']*''')
MARKERS = "ÃÂâðÅŸ€™œž�"
CP1252_EXTRA = {
    0x80: "€",
    0x82: "‚",
    0x83: "ƒ",
    0x84: "„",
    0x85: "…",
    0x86: "†",
    0x87: "‡",
    0x88: "ˆ",
    0x89: "‰",
    0x8A: "Š",
    0x8B: "‹",
    0x8C: "Œ",
    0x8E: "Ž",
    0x91: "‘",
    0x92: "’",
    0x93: "“",
    0x94: "”",
    0x95: "•",
    0x96: "–",
    0x97: "—",
    0x98: "˜",
    0x99: "™",
    0x9A: "š",
    0x9B: "›",
    0x9C: "œ",
    0x9E: "ž",
    0x9F: "Ÿ",
}
CP1252_REVERSE = {value: key for key, value in CP1252_EXTRA.items()}


def score(text: str) -> int:
    return sum(text.count(marker) for marker in MARKERS)


def sloppy_encode(text: str) -> bytes:
    buffer = bytearray()
    for char in text:
        codepoint = ord(char)
        if codepoint <= 0xFF:
            buffer.append(codepoint)
        elif char in CP1252_REVERSE:
            buffer.append(CP1252_REVERSE[char])
        else:
            raise UnicodeEncodeError("sloppy-windows-1252", text, 0, 1, f"cannot encode {char!r}")
    return bytes(buffer)


def decode_once(text: str) -> str:
    try:
        return sloppy_encode(text).decode("utf-8")
    except UnicodeError:
        return text


def repair_token(token: str) -> str:
    current = token
    for _ in range(6):
        improved = decode_once(current)
        if score(improved) >= score(current):
            break
        current = improved
    return current


def repair_text(text: str) -> str:
    return TOKEN_PATTERN.sub(lambda match: repair_token(match.group(0)), text)


def main() -> None:
    for path in TARGETS:
        original = path.read_text(encoding="utf-8")
        repaired = repair_text(original)
        path.write_text(repaired, encoding="utf-8", newline="")


if __name__ == "__main__":
    main()
