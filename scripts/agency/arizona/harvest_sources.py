"""AZGFD harvest-summary documents used for src/data/agency/arizona/harvest/.

Each entry: (sourceId, species-group, year, url, title). Where AZGFD posted
several revisions of a report, the most recently uploaded revision is used
(upload dates from the public S3 bucket listing, see harvest_list_s3.py).
"""
B = "https://azgfd-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com/wp-content/uploads/"

SOURCES = [
    # elk
    ("h-elk-2020", "elk", 2020, B + "archive/2020-AZ-Elk-Harvest-Summary_2.pdf"),
    ("h-elk-2021", "elk", 2021, B + "archive/2021-AZ-Elk-Harvest-Summary.pdf"),
    ("h-elk-2022", "elk", 2022, B + "2023/04/28090707/2022-AZ-Elk-Harvest-Summary.pdf"),
    ("h-elk-2023", "elk", 2023, B + "2024/05/09100641/2023-AZ-Elk-Harvest-Summary.pdf"),
    ("h-elk-2024", "elk", 2024, B + "2025/05/08163736/2024-AZ-Elk-Harvest-Summary.pdf"),
    ("h-elk-2025", "elk", 2025, B + "2026/01/23102434/2025-AZ-Elk-Harvest-Summary.pdf"),
    # pronghorn
    ("h-pronghorn-2020", "pronghorn", 2020, B + "archive/2020-AZ-Pronghorn-Harvest-Summary.pdf"),
    ("h-pronghorn-2021", "pronghorn", 2021, B + "archive/2021-AZ-Pronghorn-Harvest-Summary.pdf"),
    ("h-pronghorn-2022", "pronghorn", 2022, B + "2023/04/28090721/2022-AZ-Pronghorn-Harvest-Summary.pdf"),
    ("h-pronghorn-2023", "pronghorn", 2023, B + "2024/04/24090926/2023-AZ-Pronghorn-Harvest-Summary.pdf"),
    ("h-pronghorn-2024", "pronghorn", 2024, B + "2025/07/03111807/2024-AZ-Pronghorn-Harvest-Summary.pdf"),
    ("h-pronghorn-2025", "pronghorn", 2025, B + "2026/01/23144004/2025-AZ-Pronghorn-Harvest-Summary-1.pdf"),
    # deer draw hunts
    ("h-deer-2020", "deer", 2020, B + "archive/2020-AZ-Draw-Deer-Harvest-Summary.pdf"),
    ("h-deer-2021", "deer", 2021, B + "archive/2021-AZ-Deer-Harvest-Summary.pdf"),
    ("h-deer-2022", "deer", 2022, B + "2023/09/22155134/2022-AZ-Deer-Harvest-Summary_092223.pdf"),
    ("h-deer-2023", "deer", 2023, B + "2024/05/09100638/2023-AZ-Deer-Harvest-Summary.pdf"),
    ("h-deer-2024", "deer", 2024, B + "2025/04/10154252/2024-AZ-Deer-Harvest-Summary-1.pdf"),
    ("h-deer-2025", "deer", 2025, B + "2026/03/09102113/2025-AZ-Deer-Harvest-Summary.pdf"),
    # deer OTC archery
    ("h-otcdeer-2020", "otcdeer", 2020, B + "archive/2020-AZ-OTC-Archery-Deer-Harvest-Summary.pdf"),
    ("h-otcdeer-2021", "otcdeer", 2021, B + "archive/2021-AZ-OTC-Archery-Deer-Harvest-Summary.pdf"),
    ("h-otcdeer-2022", "otcdeer", 2022, B + "2023/04/28090717/2022-AZ-OTC-Archery-Deer-Harvest-Summary.pdf"),
    ("h-otcdeer-2023", "otcdeer", 2023, B + "2024/04/24093338/2023-AZ-OTC-Archery-Deer-Harvest-Summary.pdf"),
    ("h-otcdeer-2024", "otcdeer", 2024, B + "2025/04/21101505/2024-AZ-OTC-Archery-Deer-Harvest-Summary-2.pdf"),
    ("h-otcdeer-2025", "otcdeer", 2025, B + "2026/05/07154756/2025-AZ-OTC-Archery-Deer-Harvest-Summary.pdf"),
    # bighorn sheep
    ("h-sheep-2020", "sheep", 2020, B + "archive/2020-AZ-Bighorn-Sheep-Harvest-Summary.pdf"),
    ("h-sheep-2021", "sheep", 2021, B + "archive/2021-AZ-Bighorn-Sheep-Harvest-Summary_2.pdf"),
    ("h-sheep-2022", "sheep", 2022, B + "2023/04/28090656/2022-AZ-Bighorn-Sheep-Harvest-Summary.pdf"),
    ("h-sheep-2023", "sheep", 2023, B + "2024/04/24090919/2023-AZ-Bighorn-Sheep-Harvest-Summary.pdf"),
    ("h-sheep-2024", "sheep", 2024, B + "2025/05/20105831/2024-AZ-Bighorn-Sheep-Harvest-Summary-2.pdf"),
    ("h-sheep-2025", "sheep", 2025, B + "2026/01/21131544/2025-AZ-Bighorn-Sheep-Harvest-Summary-2.pdf"),
    # black bear
    ("h-bear-2020", "bear", 2020, B + "archive/2020-AZ-Black-Bear-Harvest-Summary-1.pdf"),
    ("h-bear-2021", "bear", 2021, B + "2022/08/17142419/2021-AZ-Bear-Harvest-Summary.pdf"),
    ("h-bear-2022", "bear", 2022, B + "2023/07/14134603/2022-AZ-Black-Bear-Harvest-Summary.pdf"),
    ("h-bear-2023", "bear", 2023, B + "2024/09/04134323/2023-AZ-Black-Bear-Harvest-Summary.pdf"),
    ("h-bear-2024", "bear", 2024, B + "2025/05/16092732/bear-harvest-summary-2024-20250515225425.pdf"),
    ("h-bear-2025", "bear", 2025, B + "2026/02/20095944/2025-AZ-Black-Bear-Harvest-Summary.pdf"),
    # mountain lion
    ("h-lion-2020", "lion", 2020, B + "archive/2020-AZ-Mountain-Lion-Harvest-Summary-1.pdf"),
    ("h-lion-2021", "lion", 2021, B + "2022/08/17142416/2021-AZ-Mountain-Lion-Harvest-Summary.pdf"),
    ("h-lion-2022", "lion", 2022, B + "2023/07/14134559/2022-AZ-Mountain-Lion-Harvest-Summary.pdf"),
    ("h-lion-2023", "lion", 2023, B + "2024/09/04134326/2023-AZ-Mountain-Lion-Harvest-Summary.pdf"),
    ("h-lion-2024", "lion", 2024, B + "2025/06/10152202/2024-AZ-Mountain-Lion-Harvest-Summary.pdf"),
    ("h-lion-2025", "lion", 2025, B + "2026/02/02142230/2025-AZ-Mountain-Lion-Harvest-Summary.pdf"),
    # turkey spring
    ("h-turkey-spring-2020", "turkey-spring", 2020, B + "archive/2020-AZ-Spring-Turkey-Harvest-Summary.pdf"),
    ("h-turkey-spring-2021", "turkey-spring", 2021, B + "archive/2021-AZ-Spring-Turkey-Harvest-Summary.pdf"),
    ("h-turkey-spring-2022", "turkey-spring", 2022, B + "2023/04/28090728/2022-AZ-Spring-Turkey-Harvest-Summary.pdf"),
    ("h-turkey-spring-2023", "turkey-spring", 2023, B + "2023/10/05095348/2023-AZ-Spring-Turkey-Harvest-Summary_oct5.pdf"),
    ("h-turkey-spring-2024", "turkey-spring", 2024, B + "2025/05/23150651/2024-AZ-Spring-Turkey-Harvest-Summary.pdf"),
    ("h-turkey-spring-2025", "turkey-spring", 2025, B + "2026/07/20090641/2025-AZ-Spring-Turkey-Harvest-Summary.pdf"),
    # turkey fall
    ("h-turkey-fall-2020", "turkey-fall", 2020, B + "archive/2020-AZ-Fall-Turkey-Harvest-Summary.pdf"),
    ("h-turkey-fall-2021", "turkey-fall", 2021, B + "archive/2021-AZ-Fall-Turkey-Harvest-Summary.pdf"),
    ("h-turkey-fall-2022", "turkey-fall", 2022, B + "2023/04/28090714/2022-AZ-Fall-Turkey-Harvest-Summary.pdf"),
    ("h-turkey-fall-2023", "turkey-fall", 2023, B + "2024/04/24090515/2023-AZ-Fall-Turkey-Harvest-Summary.pdf"),
    ("h-turkey-fall-2024", "turkey-fall", 2024, B + "2025/05/23150647/2024-AZ-Fall-Turkey-Harvest-Summary.pdf"),
    ("h-turkey-fall-2025", "turkey-fall", 2025, B + "2026/04/07134547/2025-AZ-Fall-Turkey-Harvest-Summary.pdf"),
]
