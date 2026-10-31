"""Legal animal per deer draw hunt number, read from AZGFD's Arizona Hunting Regulations.

AZGFD's deer harvest summary splits harvest into mule deer and white-tailed deer
but reports one hunter count per hunt. To know which species a hunt's hunters
could legally take, we read the "Legal Animal" column of the same season's deer
hunt tables (e.g. "1008 Oct 31 - Nov 6, 2025  6A  Antlered mule deer  450").

Usage (module): legal_animals(txt_path) -> {hunt_number: legal_animal_text}
"""
import re

REGS = {
    # season year -> (published title, url, local file stem)
    2020: ("2020-21 Arizona Hunting Regulations (amended 10/06/2020)",
           "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/archive/2020-21-Arizona-Hunting-Regulations_amended-201006.pdf",
           "2020-21"),
    2021: ("2021-22 Arizona Hunting Regulations (10/12/2021 revision)",
           "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/archive/2021-22-Arizona-Hunting-Regulations_211012.pdf",
           "2021-22"),
    2022: ("2022-23 Arizona Hunting Regulations (02/06/2023 revision)",
           "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/archive/2022-Arizona-Hunting-Regulations_230206.pdf",
           "2022-23"),
    2023: ("2023-24 Arizona Hunting Regulations (10/23/2023 revision)",
           "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2023/10/24104400/2023-24-Arizona-Hunting-Regulations_231023.pdf",
           "2023-24"),
    2024: ("2024-25 Arizona Hunting Regulations (12/09/2024 revision)",
           "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2024/12/09112338/2024-25-Arizona-Hunting-Regulations_241209.pdf",
           "2024-25"),
    2025: ("2025-26 Arizona Hunting Regulations (12/23/2025 revision)",
           "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/2025/12/23103956/2025-26-Arizona-Hunting-Regulations_251223.pdf",
           "2025-26"),
}
# The 2023-24 booklet is no longer in AZGFD's bucket; the copy used is the Internet
# Archive capture of that exact AZGFD URL (20240104162335).
WAYBACK_2023 = "https://web.archive.org/web/20240104162335id_/" + REGS[2023][1]

LEGAL = ["Any antlered deer", "Antlered mule deer", "Antlered whitetail deer", "Antlerless deer", "Any deer"]
LINE_RE = re.compile(r"^\s*(1\d{3})\s+(.*)$")


def legal_animals(txt_path):
    out = {}
    with open(txt_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = LINE_RE.match(line)
            if not m:
                continue
            rest = m.group(2)
            found = [p for p in LEGAL if p in rest]
            if not found:
                continue
            # "Any antlered deer" contains no other phrase; "Any deer" is distinct
            legal = max(found, key=len)
            hunt = m.group(1)
            if hunt in out and out[hunt] != legal:
                out[hunt] = out[hunt] + " | " + legal
            else:
                out[hunt] = legal
    return out


def species_for(legal):
    """Which species files a hunt's hunters belong to."""
    if legal is None:
        return None
    if "|" in legal:
        return None
    if legal == "Antlered mule deer":
        return {"mule-deer"}
    if legal == "Antlered whitetail deer":
        return {"whitetail"}
    return {"mule-deer", "whitetail"}


def sex_for(legal):
    if legal in ("Any antlered deer", "Antlered mule deer", "Antlered whitetail deer"):
        return "male"
    if legal == "Antlerless deer":
        return "female"
    if legal == "Any deer":
        return "either"
    return None
