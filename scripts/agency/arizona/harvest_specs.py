"""Column specs (header anchor words) for each AZGFD harvest-summary layout.

Each spec entry: (field, [header word alternatives], occurrence-index-by-x).
Layouts changed between years; specs were written by reading each year's header.
"""

SUCCESS = ["%Success", "Success"]
WOUND = ["%Wound", "Loss", "Wound"]
CI = ["C.I.", "CI"]

ELK = [
    ("hunt", ["No."], 0),
    ("auth", ["Authorized"], 0),
    ("apps", ["Applicants"], 0),
    ("issued", ["Issued"], 0),
    ("hunters", ["Hunters"], 0),
    ("days", ["Days"], 0),
    ("bull", ["Bull"], 0),
    ("spike", ["Spike"], 0),
    ("cow", ["Cow"], 0),
    ("calf", ["Calf"], 0),
    ("total", ["Total"], 0),
    ("success", SUCCESS, 0),
    ("points", ["Points"], 0),
    ("wound", WOUND, 0),
    ("ci", CI, 0),
    ("returns", ["Returns"], 0),
]
ELK_2024 = [e for e in ELK if e[0] not in ("cow", "calf")]
ELK_2024.insert(8, ("antlerless", ["Antlerless"], 0))

PRONGHORN = [
    ("hunt", ["No."], 0),
    ("auth", ["Authorized"], 0),
    ("apps", ["Applicants"], 0),
    ("issued", ["Issued"], 0),
    ("hunters", ["Hunters"], 0),
    ("days", ["Days"], 0),
    ("total", ["Harvest"], 0),
    ("success", SUCCESS, 0),
    ("wound", ["Loss", "Wound"], 0),
    ("ci", CI, 0),
    ("returns", ["Returns"], 0),
]

SHEEP = [
    ("hunt", ["No.", "Hunt"], 0),
    ("auth", ["Authorized", "Auth."], 0),
    ("apps", ["Applicants", "Apps."], 0),
    ("hunters", ["Hunters"], 0),
    ("days", ["Days"], 0),
    ("total", ["Harvest"], 0),
    ("success", SUCCESS, 0),
    ("score", ["Score"], 0),
    ("weight", ["Weight"], 0),
    ("age", ["Age"], 0),
]
SHEEP_2025 = [e for e in SHEEP if e[0] != "weight"]

DEER_2020 = [
    ("hunt", ["No."], 0),
    ("auth", ["Authorized"], 0),
    ("apps", ["Applicants"], 0),
    ("issued", ["Issued1"], 0),
    ("hunters", ["Hunters"], 0),
    ("days", ["Days"], 0),
    ("md_buck", ["Buck"], 0),
    ("md_antlerless", ["Antlerless"], 0),
    ("wt_buck", ["Buck"], 1),
    ("wt_antlerless", ["Antlerless"], 1),
    ("total", ["Total"], 0),
    ("success", ["Success"], 0),
    ("wound", ["Loss"], 0),
    ("ci", CI, 0),
    ("returns", ["Returns"], 0),
]
DEER_PCT = [
    ("md_pct_buck", ["Buck"], 2),
    ("md_pct_spike", ["Spike"], 0),
    ("wt_pct_buck", ["Buck"], 3),
    ("wt_pct_spike", ["Spike"], 1),
    ("wound", ["Wound"], 0),
    ("ci", CI, 0),
    ("returns", ["Returns"], 0),
]
DEER_2021 = [
    ("hunt", ["No."], 0),
    ("auth", ["Authorized"], 0),
    ("apps", ["Applicants"], 0),
    ("issued", ["Issued1"], 0),
    ("hunters", ["Hunters"], 0),
    ("days", ["Days"], 0),
    ("md_buck", ["Buck"], 0),
    ("md_antlerless", ["Antlerless"], 0),
    ("wt_buck", ["Buck"], 1),
    ("wt_antlerless", ["AntlerlessTotal"], 0),
    ("total", ["Harvest"], 0),
    ("success", ["Success"], 0),
] + DEER_PCT
DEER_2022 = [
    ("hunt", ["No."], 0),
    ("auth", ["Authorized"], 0),
    ("apps", ["Applicants"], 0),
    ("issued", ["Issued"], 0),
    ("hunters", ["Hunters"], 0),
    ("days", ["Days"], 0),
    ("md_buck", ["Buck"], 0),
    ("md_antlerless", ["Antlerless"], 0),
    ("wt_buck", ["Buck"], 1),
    ("wt_antlerless", ["Antlerless"], 1),
    ("total", ["Harvest"], 0),
    ("success", ["Success"], 0),
] + DEER_PCT

OTC_DEER = [
    ("hunters", ["Hunters1"], 0),
    ("days", ["Days"], 0),
    ("md_buck", ["Bucks"], 0),
    ("md_antlerless", ["Antlerless"], 0),
    ("wt_buck", ["Bucks"], 1),
    ("wt_antlerless", ["Antlerless"], 1),
    ("total", ["Harvest"], 0),
    ("success", ["Success"], 0),
    ("ci", CI, 0),
    ("returns", ["Returns"], 0),
]

BEAR_2020 = [
    ("hunter", ["Hunter"], 0),
    ("depredation", ["Depredation"], 0),
    ("other", ["Other"], 0),
    ("dogs", ["Dogs"], 0),
    ("male", ["Male"], 0),
    ("female", ["Female"], 0),
    ("unknown", ["Unknown"], 0),
    ("median_female_age", ["Median"], 0),
    ("m_spring", ["Spring"], 0),
    ("m_aug", ["Aug."], 0),
    ("m_sep", ["Sept."], 0),
    ("m_oct", ["Oct."], 0),
    ("m_nov", ["Nov."], 0),
    ("m_dec", ["Dec."], 0),
]
BEAR_2020_UNK = BEAR_2020 + [("m_unknown", ["Unknown"], 1)]
BEAR_2022 = [
    ("hunter", ["Hunter"], 0),
    ("other", ["Other"], 0),
    ("dogs", ["Dogs"], 0),
    ("depredation", ["Depredation"], 0),
    ("male", ["Males"], 0),
    ("female", ["Females"], 0),
    ("unknown", ["Unknown"], 0),
    ("median_female_age", ["Age1"], 0),
    ("m_spring", ["Spring"], 0),
    ("m_aug", ["August"], 0),
    ("m_sep", ["September"], 0),
    ("m_oct", ["October"], 0),
    ("m_nov", ["November"], 0),
    ("m_dec", ["December"], 0),
]
BEAR_2024 = [
    ("hunter", ["dogsinparens)", "parens)"], 0),
    ("other", ["Other"], 0),
    ("depredation", ["Depredation"], 0),
    ("male", ["Males"], 0),
    ("female", ["Females"], 0),
    ("unknown", ["Unknown"], 0),
    ("m_spring", ["Spring"], 0),
    ("m_aug", ["Aug"], 0),
    ("m_sep", ["Sep"], 0),
    ("m_oct", ["Oct"], 0),
    ("m_nov", ["Nov"], 0),
    ("m_dec", ["Dec"], 0),
]

LION_2020 = [
    ("hunter", ["Hunter"], 0),
    ("depredation", ["Depredation"], 0),
    ("other", ["Other"], 0),
    ("dogs", ["Dogs"], 0),
    ("male", ["Male"], 0),
    ("female", ["Female"], 0),
    ("unknown", ["Unknown"], 0),
    ("adult_females", ["years**", "years"], 0),
    ("m1", ["March"], 0),
    ("m2", ["June"], 0),
    ("m3", ["Sept."], 0),
    ("m4", ["Dec."], 0),
]
LION_2022 = [
    ("hunter", ["Hunter"], 0),
    ("other", ["Other1"], 0),
    ("dogs", ["Dogs"], 0),
    ("depredation", ["Depredation"], 0),
    ("male", ["Males"], 0),
    ("female", ["Females"], 0),
    ("unknown", ["Unknown"], 0),
    ("adult_females", ["Females2,3", "Females2"], 0),
    ("m1", ["March"], 0),
    ("m2", ["May"], 0),
    ("m3", ["September"], 0),
    ("m4", ["December"], 0),
]
LION_2024 = [
    ("hunter", ["dogsinparens)1", "parens)1"], 0),
    ("other", ["Other2"], 0),
    ("depredation", ["Depredation"], 0),
    ("male", ["Males"], 0),
    ("female", ["Females"], 0),
    ("unknown", ["Unknown"], 0),
    ("m1", ["toMar", "Mar"], 0),
    ("m2", ["toMay", "May"], 0),
    ("m3", ["toSep", "Sep"], 0),
    ("m4", ["toDec", "Dec"], 0),
]

TURKEY = [
    ("hunt", ["No.", "Hunt"], 0),
    ("auth", ["Authorized"], 0),
    ("apps", ["Applicants"], 0),
    ("issued", ["Issued"], 0),
    ("hunters", ["Hunters"], 0),
    ("days", ["Days"], 0),
    ("total", ["Harvest"], 0),
    ("success", SUCCESS, 0),
    ("wound", WOUND, 0),
    ("ci", CI, 0),
    ("returns", ["Returns"], 0),
]


def spec_for(group, year):
    if group == "elk":
        return ELK_2024 if year == 2024 else ELK
    if group == "pronghorn":
        return PRONGHORN
    if group == "sheep":
        return SHEEP_2025 if year == 2025 else SHEEP
    if group == "deer":
        return {2020: DEER_2020, 2021: DEER_2021}.get(year, DEER_2022)
    if group == "otcdeer":
        return OTC_DEER
    if group == "bear":
        if year == 2020:
            return BEAR_2020_UNK
        if year == 2021:
            return BEAR_2020
        if year in (2022, 2023):
            return BEAR_2022
        return BEAR_2024
    if group == "lion":
        if year in (2020, 2021):
            return LION_2020
        if year in (2022, 2023):
            return LION_2022
        return LION_2024
    if group.startswith("turkey"):
        return TURKEY
    raise KeyError(group)
