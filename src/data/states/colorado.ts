// Real Colorado harvest data from CPW official reports
// Sources: https://spl.cde.state.co.us/artemis/nrserials/nr1445internet/ (elk)
// https://spl.cde.state.co.us/artemis/nrserials/nr1444internet/ (deer)
// https://spl.cde.state.co.us/artemis/nrserials/nr1438internet/ (pronghorn)

export interface RealGMUData {
  gmu: string;
  species: string;
  year: number;
  totalHarvest: number;
  totalHunters: number;
  successRate: number; // as percentage (0-100)
  bulls?: number;  // or bucks
  cows?: number;   // or does
  calves?: number; // or fawns
  recDays?: number;
}

// ---------------------------------------------------------------------------
// ELK 2024 — All Manners of Take, per-GMU
// Statewide: 22,721 Bulls | 12,593 Cows | 993 Calves | 36,307 Total
//            178,014 Hunters | 20% Success
// ---------------------------------------------------------------------------

const ELK_2024: RealGMUData[] = [
  { gmu: "001", species: "elk", year: 2024, bulls: 6, cows: 23, calves: 1, totalHarvest: 30, totalHunters: 82, successRate: 37, recDays: 350 },
  { gmu: "002", species: "elk", year: 2024, bulls: 39, cows: 57, calves: 11, totalHarvest: 107, totalHunters: 168, successRate: 64, recDays: 752 },
  { gmu: "201", species: "elk", year: 2024, bulls: 37, cows: 61, calves: 10, totalHarvest: 108, totalHunters: 205, successRate: 53, recDays: 900 },
  { gmu: "003", species: "elk", year: 2024, bulls: 100, cows: 60, calves: 2, totalHarvest: 162, totalHunters: 1038, successRate: 16, recDays: 4809 },
  { gmu: "301", species: "elk", year: 2024, bulls: 28, cows: 27, calves: 0, totalHarvest: 55, totalHunters: 406, successRate: 14, recDays: 1662 },
  { gmu: "004", species: "elk", year: 2024, bulls: 247, cows: 117, calves: 15, totalHarvest: 379, totalHunters: 1541, successRate: 25, recDays: 7276 },
  { gmu: "441", species: "elk", year: 2024, bulls: 168, cows: 102, calves: 0, totalHarvest: 270, totalHunters: 740, successRate: 37, recDays: 3108 },
  { gmu: "005", species: "elk", year: 2024, bulls: 230, cows: 84, calves: 3, totalHarvest: 316, totalHunters: 874, successRate: 36, recDays: 3613 },
  { gmu: "006", species: "elk", year: 2024, bulls: 144, cows: 148, calves: 29, totalHarvest: 321, totalHunters: 3161, successRate: 10, recDays: 14852 },
  { gmu: "007", species: "elk", year: 2024, bulls: 91, cows: 54, calves: 4, totalHarvest: 149, totalHunters: 1630, successRate: 9, recDays: 8376 },
  { gmu: "008", species: "elk", year: 2024, bulls: 125, cows: 79, calves: 4, totalHarvest: 208, totalHunters: 2219, successRate: 9, recDays: 10883 },
  { gmu: "009", species: "elk", year: 2024, bulls: 36, cows: 33, calves: 9, totalHarvest: 77, totalHunters: 197, successRate: 39, recDays: 1133 },
  { gmu: "010", species: "elk", year: 2024, bulls: 43, cows: 111, calves: 4, totalHarvest: 158, totalHunters: 274, successRate: 58, recDays: 1462 },
  { gmu: "011", species: "elk", year: 2024, bulls: 492, cows: 110, calves: 22, totalHarvest: 623, totalHunters: 2467, successRate: 25, recDays: 10946 },
  { gmu: "211", species: "elk", year: 2024, bulls: 333, cows: 105, calves: 21, totalHarvest: 460, totalHunters: 1821, successRate: 25, recDays: 8375 },
  { gmu: "012", species: "elk", year: 2024, bulls: 577, cows: 148, calves: 30, totalHarvest: 755, totalHunters: 2634, successRate: 29, recDays: 11907 },
  { gmu: "013", species: "elk", year: 2024, bulls: 307, cows: 163, calves: 26, totalHarvest: 496, totalHunters: 1219, successRate: 41, recDays: 5276 },
  { gmu: "131", species: "elk", year: 2024, bulls: 96, cows: 97, calves: 4, totalHarvest: 198, totalHunters: 872, successRate: 23, recDays: 4449 },
  { gmu: "231", species: "elk", year: 2024, bulls: 112, cows: 95, calves: 4, totalHarvest: 211, totalHunters: 1497, successRate: 14, recDays: 8118 },
  { gmu: "014", species: "elk", year: 2024, bulls: 126, cows: 25, calves: 0, totalHarvest: 151, totalHunters: 1293, successRate: 12, recDays: 8087 },
  { gmu: "214", species: "elk", year: 2024, bulls: 166, cows: 96, calves: 2, totalHarvest: 265, totalHunters: 1016, successRate: 26, recDays: 5182 },
  { gmu: "015", species: "elk", year: 2024, bulls: 194, cows: 198, calves: 15, totalHarvest: 407, totalHunters: 3738, successRate: 11, recDays: 20026 },
  { gmu: "016", species: "elk", year: 2024, bulls: 73, cows: 199, calves: 12, totalHarvest: 284, totalHunters: 1839, successRate: 15, recDays: 8914 },
  { gmu: "161", species: "elk", year: 2024, bulls: 114, cows: 179, calves: 26, totalHarvest: 318, totalHunters: 2888, successRate: 11, recDays: 15319 },
  { gmu: "017", species: "elk", year: 2024, bulls: 161, cows: 159, calves: 0, totalHarvest: 319, totalHunters: 1994, successRate: 16, recDays: 8621 },
  { gmu: "171", species: "elk", year: 2024, bulls: 74, cows: 77, calves: 1, totalHarvest: 152, totalHunters: 1818, successRate: 8, recDays: 8548 },
  { gmu: "018", species: "elk", year: 2024, bulls: 370, cows: 269, calves: 23, totalHarvest: 662, totalHunters: 4997, successRate: 13, recDays: 24655 },
  { gmu: "181", species: "elk", year: 2024, bulls: 68, cows: 124, calves: 13, totalHarvest: 205, totalHunters: 1462, successRate: 14, recDays: 6061 },
  { gmu: "019", species: "elk", year: 2024, bulls: 85, cows: 24, calves: 11, totalHarvest: 119, totalHunters: 1140, successRate: 10, recDays: 6811 },
  { gmu: "191", species: "elk", year: 2024, bulls: 18, cows: 4, calves: 0, totalHarvest: 22, totalHunters: 601, successRate: 4, recDays: 2980 },
  { gmu: "020", species: "elk", year: 2024, bulls: 152, cows: 198, calves: 5, totalHarvest: 355, totalHunters: 875, successRate: 41, recDays: 8492 },
  { gmu: "021", species: "elk", year: 2024, bulls: 249, cows: 64, calves: 10, totalHarvest: 324, totalHunters: 1992, successRate: 16, recDays: 10287 },
  { gmu: "022", species: "elk", year: 2024, bulls: 502, cows: 229, calves: 39, totalHarvest: 770, totalHunters: 2668, successRate: 29, recDays: 14265 },
  { gmu: "023", species: "elk", year: 2024, bulls: 246, cows: 159, calves: 18, totalHarvest: 423, totalHunters: 1870, successRate: 23, recDays: 8655 },
  { gmu: "024", species: "elk", year: 2024, bulls: 231, cows: 34, calves: 0, totalHarvest: 265, totalHunters: 1879, successRate: 14, recDays: 9019 },
  { gmu: "025", species: "elk", year: 2024, bulls: 111, cows: 111, calves: 5, totalHarvest: 227, totalHunters: 1721, successRate: 13, recDays: 9603 },
  { gmu: "026", species: "elk", year: 2024, bulls: 111, cows: 31, calves: 0, totalHarvest: 142, totalHunters: 1174, successRate: 12, recDays: 6279 },
  { gmu: "027", species: "elk", year: 2024, bulls: 47, cows: 59, calves: 8, totalHarvest: 113, totalHunters: 1523, successRate: 7, recDays: 7378 },
  { gmu: "028", species: "elk", year: 2024, bulls: 101, cows: 66, calves: 10, totalHarvest: 177, totalHunters: 2871, successRate: 6, recDays: 14571 },
  { gmu: "029", species: "elk", year: 2024, bulls: 28, cows: 40, calves: 2, totalHarvest: 70, totalHunters: 249, successRate: 28, recDays: 1848 },
  { gmu: "030", species: "elk", year: 2024, bulls: 142, cows: 96, calves: 11, totalHarvest: 250, totalHunters: 994, successRate: 25, recDays: 4398 },
  { gmu: "031", species: "elk", year: 2024, bulls: 298, cows: 147, calves: 8, totalHarvest: 453, totalHunters: 1597, successRate: 28, recDays: 8572 },
  { gmu: "032", species: "elk", year: 2024, bulls: 130, cows: 31, calves: 3, totalHarvest: 165, totalHunters: 823, successRate: 20, recDays: 4375 },
  { gmu: "033", species: "elk", year: 2024, bulls: 175, cows: 121, calves: 15, totalHarvest: 311, totalHunters: 2161, successRate: 14, recDays: 11387 },
  { gmu: "034", species: "elk", year: 2024, bulls: 85, cows: 17, calves: 0, totalHarvest: 102, totalHunters: 1002, successRate: 10, recDays: 5112 },
  { gmu: "035", species: "elk", year: 2024, bulls: 115, cows: 53, calves: 0, totalHarvest: 168, totalHunters: 1008, successRate: 17, recDays: 4734 },
  { gmu: "036", species: "elk", year: 2024, bulls: 123, cows: 59, calves: 3, totalHarvest: 185, totalHunters: 1196, successRate: 15, recDays: 5845 },
  { gmu: "361", species: "elk", year: 2024, bulls: 26, cows: 28, calves: 3, totalHarvest: 57, totalHunters: 440, successRate: 13, recDays: 2134 },
  { gmu: "037", species: "elk", year: 2024, bulls: 102, cows: 91, calves: 7, totalHarvest: 200, totalHunters: 1955, successRate: 10, recDays: 9608 },
  { gmu: "371", species: "elk", year: 2024, bulls: 67, cows: 46, calves: 0, totalHarvest: 113, totalHunters: 1031, successRate: 11, recDays: 4588 },
  { gmu: "038", species: "elk", year: 2024, bulls: 48, cows: 39, calves: 0, totalHarvest: 88, totalHunters: 1096, successRate: 8, recDays: 7725 },
  { gmu: "039", species: "elk", year: 2024, bulls: 106, cows: 35, calves: 2, totalHarvest: 143, totalHunters: 459, successRate: 31, recDays: 3198 },
  { gmu: "391", species: "elk", year: 2024, bulls: 35, cows: 31, calves: 0, totalHarvest: 66, totalHunters: 181, successRate: 37, recDays: 2668 },
  { gmu: "040", species: "elk", year: 2024, bulls: 152, cows: 156, calves: 0, totalHarvest: 308, totalHunters: 518, successRate: 60, recDays: 2645 },
  { gmu: "041", species: "elk", year: 2024, bulls: 154, cows: 175, calves: 18, totalHarvest: 348, totalHunters: 1702, successRate: 20, recDays: 10707 },
  { gmu: "411", species: "elk", year: 2024, bulls: 90, cows: 37, calves: 6, totalHarvest: 133, totalHunters: 745, successRate: 18, recDays: 3818 },
  { gmu: "042", species: "elk", year: 2024, bulls: 312, cows: 311, calves: 36, totalHarvest: 659, totalHunters: 3093, successRate: 21, recDays: 16326 },
  { gmu: "421", species: "elk", year: 2024, bulls: 327, cows: 300, calves: 30, totalHarvest: 657, totalHunters: 3432, successRate: 19, recDays: 21049 },
  { gmu: "043", species: "elk", year: 2024, bulls: 246, cows: 228, calves: 3, totalHarvest: 477, totalHunters: 2693, successRate: 18, recDays: 14893 },
  { gmu: "431", species: "elk", year: 2024, bulls: 23, cows: 24, calves: 0, totalHarvest: 47, totalHunters: 244, successRate: 19, recDays: 1005 },
  { gmu: "044", species: "elk", year: 2024, bulls: 107, cows: 56, calves: 0, totalHarvest: 163, totalHunters: 1203, successRate: 14, recDays: 5918 },
  { gmu: "444", species: "elk", year: 2024, bulls: 166, cows: 81, calves: 7, totalHarvest: 254, totalHunters: 1199, successRate: 21, recDays: 6458 },
  { gmu: "045", species: "elk", year: 2024, bulls: 95, cows: 39, calves: 0, totalHarvest: 134, totalHunters: 867, successRate: 15, recDays: 4145 },
  { gmu: "046", species: "elk", year: 2024, bulls: 41, cows: 13, calves: 0, totalHarvest: 54, totalHunters: 241, successRate: 22, recDays: 1968 },
  { gmu: "461", species: "elk", year: 2024, bulls: 14, cows: 11, calves: 0, totalHarvest: 26, totalHunters: 132, successRate: 20, recDays: 794 },
  { gmu: "047", species: "elk", year: 2024, bulls: 65, cows: 13, calves: 0, totalHarvest: 78, totalHunters: 543, successRate: 14, recDays: 2710 },
  { gmu: "471", species: "elk", year: 2024, bulls: 25, cows: 4, calves: 0, totalHarvest: 30, totalHunters: 280, successRate: 11, recDays: 1576 },
  { gmu: "048", species: "elk", year: 2024, bulls: 58, cows: 32, calves: 3, totalHarvest: 93, totalHunters: 339, successRate: 27, recDays: 1887 },
  { gmu: "481", species: "elk", year: 2024, bulls: 112, cows: 59, calves: 8, totalHarvest: 179, totalHunters: 494, successRate: 36, recDays: 3019 },
  { gmu: "049", species: "elk", year: 2024, bulls: 200, cows: 161, calves: 16, totalHarvest: 378, totalHunters: 971, successRate: 39, recDays: 5082 },
  { gmu: "050", species: "elk", year: 2024, bulls: 117, cows: 136, calves: 20, totalHarvest: 273, totalHunters: 850, successRate: 32, recDays: 4202 },
  { gmu: "500", species: "elk", year: 2024, bulls: 128, cows: 106, calves: 0, totalHarvest: 234, totalHunters: 777, successRate: 30, recDays: 4361 },
  { gmu: "501", species: "elk", year: 2024, bulls: 83, cows: 36, calves: 6, totalHarvest: 125, totalHunters: 378, successRate: 33, recDays: 2260 },
  { gmu: "051", species: "elk", year: 2024, bulls: 90, cows: 88, calves: 10, totalHarvest: 188, totalHunters: 623, successRate: 30, recDays: 4868 },
  { gmu: "511", species: "elk", year: 2024, bulls: 53, cows: 41, calves: 2, totalHarvest: 95, totalHunters: 1425, successRate: 7, recDays: 7971 },
  { gmu: "052", species: "elk", year: 2024, bulls: 147, cows: 96, calves: 8, totalHarvest: 252, totalHunters: 1423, successRate: 18, recDays: 7826 },
  { gmu: "521", species: "elk", year: 2024, bulls: 303, cows: 88, calves: 16, totalHarvest: 407, totalHunters: 2197, successRate: 19, recDays: 13050 },
  { gmu: "053", species: "elk", year: 2024, bulls: 218, cows: 99, calves: 9, totalHarvest: 326, totalHunters: 2033, successRate: 16, recDays: 11987 },
  { gmu: "054", species: "elk", year: 2024, bulls: 393, cows: 103, calves: 2, totalHarvest: 498, totalHunters: 2242, successRate: 22, recDays: 11597 },
  { gmu: "055", species: "elk", year: 2024, bulls: 269, cows: 123, calves: 5, totalHarvest: 397, totalHunters: 2755, successRate: 14, recDays: 14160 },
  { gmu: "551", species: "elk", year: 2024, bulls: 167, cows: 88, calves: 5, totalHarvest: 260, totalHunters: 1574, successRate: 16, recDays: 8094 },
  { gmu: "056", species: "elk", year: 2024, bulls: 57, cows: 41, calves: 1, totalHarvest: 99, totalHunters: 421, successRate: 24, recDays: 2229 },
  { gmu: "561", species: "elk", year: 2024, bulls: 22, cows: 22, calves: 2, totalHarvest: 45, totalHunters: 283, successRate: 16, recDays: 1760 },
  { gmu: "057", species: "elk", year: 2024, bulls: 71, cows: 86, calves: 6, totalHarvest: 163, totalHunters: 483, successRate: 34, recDays: 2478 },
  { gmu: "058", species: "elk", year: 2024, bulls: 150, cows: 132, calves: 5, totalHarvest: 288, totalHunters: 906, successRate: 32, recDays: 5153 },
  { gmu: "581", species: "elk", year: 2024, bulls: 115, cows: 81, calves: 0, totalHarvest: 196, totalHunters: 1521, successRate: 13, recDays: 11076 },
  { gmu: "059", species: "elk", year: 2024, bulls: 79, cows: 56, calves: 0, totalHarvest: 135, totalHunters: 704, successRate: 19, recDays: 3841 },
  { gmu: "591", species: "elk", year: 2024, bulls: 27, cows: 20, calves: 3, totalHarvest: 49, totalHunters: 364, successRate: 14, recDays: 2203 },
  { gmu: "060", species: "elk", year: 2024, bulls: 65, cows: 73, calves: 2, totalHarvest: 140, totalHunters: 564, successRate: 25, recDays: 3542 },
  { gmu: "061", species: "elk", year: 2024, bulls: 299, cows: 398, calves: 30, totalHarvest: 727, totalHunters: 1296, successRate: 56, recDays: 6541 },
  { gmu: "062", species: "elk", year: 2024, bulls: 653, cows: 342, calves: 28, totalHarvest: 1024, totalHunters: 5669, successRate: 18, recDays: 33819 },
  { gmu: "063", species: "elk", year: 2024, bulls: 165, cows: 120, calves: 7, totalHarvest: 292, totalHunters: 1480, successRate: 20, recDays: 8786 },
  { gmu: "064", species: "elk", year: 2024, bulls: 94, cows: 92, calves: 2, totalHarvest: 189, totalHunters: 877, successRate: 22, recDays: 3518 },
  { gmu: "065", species: "elk", year: 2024, bulls: 432, cows: 290, calves: 32, totalHarvest: 755, totalHunters: 3000, successRate: 25, recDays: 14974 },
  { gmu: "066", species: "elk", year: 2024, bulls: 314, cows: 184, calves: 5, totalHarvest: 503, totalHunters: 1196, successRate: 42, recDays: 5490 },
  { gmu: "067", species: "elk", year: 2024, bulls: 175, cows: 163, calves: 7, totalHarvest: 345, totalHunters: 1061, successRate: 33, recDays: 5460 },
  { gmu: "068", species: "elk", year: 2024, bulls: 262, cows: 56, calves: 6, totalHarvest: 323, totalHunters: 2283, successRate: 14, recDays: 12738 },
  { gmu: "681", species: "elk", year: 2024, bulls: 141, cows: 9, calves: 2, totalHarvest: 153, totalHunters: 1519, successRate: 10, recDays: 8603 },
  { gmu: "069", species: "elk", year: 2024, bulls: 56, cows: 21, calves: 0, totalHarvest: 77, totalHunters: 293, successRate: 26, recDays: 1541 },
  { gmu: "691", species: "elk", year: 2024, bulls: 13, cows: 14, calves: 0, totalHarvest: 27, totalHunters: 167, successRate: 16, recDays: 955 },
  { gmu: "070", species: "elk", year: 2024, bulls: 950, cows: 320, calves: 5, totalHarvest: 1275, totalHunters: 3448, successRate: 37, recDays: 18574 },
  { gmu: "071", species: "elk", year: 2024, bulls: 426, cows: 38, calves: 3, totalHarvest: 467, totalHunters: 2529, successRate: 18, recDays: 13267 },
  { gmu: "711", species: "elk", year: 2024, bulls: 302, cows: 65, calves: 0, totalHarvest: 366, totalHunters: 1764, successRate: 21, recDays: 8907 },
  { gmu: "072", species: "elk", year: 2024, bulls: 76, cows: 7, calves: 0, totalHarvest: 83, totalHunters: 467, successRate: 18, recDays: 2425 },
  { gmu: "073", species: "elk", year: 2024, bulls: 95, cows: 7, calves: 3, totalHarvest: 105, totalHunters: 639, successRate: 16, recDays: 3421 },
  { gmu: "074", species: "elk", year: 2024, bulls: 313, cows: 16, calves: 0, totalHarvest: 329, totalHunters: 1537, successRate: 21, recDays: 8908 },
  { gmu: "741", species: "elk", year: 2024, bulls: 70, cows: 24, calves: 1, totalHarvest: 96, totalHunters: 317, successRate: 30, recDays: 1814 },
  { gmu: "075", species: "elk", year: 2024, bulls: 238, cows: 70, calves: 0, totalHarvest: 308, totalHunters: 1337, successRate: 23, recDays: 6718 },
  { gmu: "751", species: "elk", year: 2024, bulls: 190, cows: 43, calves: 1, totalHarvest: 234, totalHunters: 1165, successRate: 20, recDays: 5490 },
  { gmu: "076", species: "elk", year: 2024, bulls: 262, cows: 227, calves: 29, totalHarvest: 518, totalHunters: 1138, successRate: 46, recDays: 5821 },
  { gmu: "077", species: "elk", year: 2024, bulls: 647, cows: 37, calves: 0, totalHarvest: 683, totalHunters: 3299, successRate: 21, recDays: 17662 },
  { gmu: "771", species: "elk", year: 2024, bulls: 79, cows: 14, calves: 1, totalHarvest: 93, totalHunters: 570, successRate: 16, recDays: 2286 },
  { gmu: "078", species: "elk", year: 2024, bulls: 691, cows: 35, calves: 5, totalHarvest: 731, totalHunters: 2754, successRate: 27, recDays: 14466 },
  { gmu: "079", species: "elk", year: 2024, bulls: 83, cows: 76, calves: 3, totalHarvest: 163, totalHunters: 1034, successRate: 16, recDays: 5551 },
  { gmu: "791", species: "elk", year: 2024, bulls: 40, cows: 15, calves: 2, totalHarvest: 57, totalHunters: 163, successRate: 35, recDays: 292 },
  { gmu: "080", species: "elk", year: 2024, bulls: 465, cows: 183, calves: 25, totalHarvest: 673, totalHunters: 3213, successRate: 21, recDays: 18497 },
  { gmu: "081", species: "elk", year: 2024, bulls: 580, cows: 276, calves: 26, totalHarvest: 882, totalHunters: 3726, successRate: 24, recDays: 20920 },
  { gmu: "082", species: "elk", year: 2024, bulls: 325, cows: 171, calves: 25, totalHarvest: 521, totalHunters: 2297, successRate: 23, recDays: 10047 },
  { gmu: "083", species: "elk", year: 2024, bulls: 181, cows: 178, calves: 7, totalHarvest: 367, totalHunters: 884, successRate: 41, recDays: 4071 },
  { gmu: "084", species: "elk", year: 2024, bulls: 118, cows: 147, calves: 8, totalHarvest: 272, totalHunters: 722, successRate: 38, recDays: 4307 },
  { gmu: "085", species: "elk", year: 2024, bulls: 398, cows: 207, calves: 9, totalHarvest: 614, totalHunters: 2875, successRate: 21, recDays: 17556 },
  { gmu: "851", species: "elk", year: 2024, bulls: 111, cows: 63, calves: 0, totalHarvest: 175, totalHunters: 579, successRate: 30, recDays: 3110 },
  { gmu: "086", species: "elk", year: 2024, bulls: 127, cows: 163, calves: 3, totalHarvest: 292, totalHunters: 1934, successRate: 15, recDays: 12283 },
  { gmu: "861", species: "elk", year: 2024, bulls: 94, cows: 39, calves: 0, totalHarvest: 133, totalHunters: 608, successRate: 22, recDays: 3370 },
  { gmu: "104", species: "elk", year: 2024, bulls: 63, cows: 162, calves: 5, totalHarvest: 230, totalHunters: 432, successRate: 53, recDays: 2204 },
  { gmu: "105", species: "elk", year: 2024, bulls: 74, cows: 61, calves: 3, totalHarvest: 138, totalHunters: 338, successRate: 41, recDays: 2879 },
];

// ---------------------------------------------------------------------------
// ELK 2023 — All Manners of Take, per-GMU (key GMUs)
// Statewide: 18,562 Bulls | 10,302 Cows | 930 Calves | 29,793 Total
//            186,028 Hunters | 16% Success
// ---------------------------------------------------------------------------

const ELK_2023: RealGMUData[] = [
  { gmu: "001", species: "elk", year: 2023, bulls: 9, cows: 31, calves: 0, totalHarvest: 40, totalHunters: 106, successRate: 38 },
  { gmu: "002", species: "elk", year: 2023, bulls: 41, cows: 54, calves: 5, totalHarvest: 100, totalHunters: 170, successRate: 59 },
  { gmu: "201", species: "elk", year: 2023, bulls: 43, cows: 46, calves: 7, totalHarvest: 96, totalHunters: 187, successRate: 51 },
  { gmu: "003", species: "elk", year: 2023, bulls: 93, cows: 51, calves: 8, totalHarvest: 152, totalHunters: 1629, successRate: 9 },
  { gmu: "004", species: "elk", year: 2023, bulls: 297, cows: 160, calves: 16, totalHarvest: 473, totalHunters: 2235, successRate: 21 },
  { gmu: "005", species: "elk", year: 2023, bulls: 240, cows: 73, calves: 12, totalHarvest: 326, totalHunters: 1014, successRate: 32 },
  { gmu: "006", species: "elk", year: 2023, bulls: 132, cows: 149, calves: 19, totalHarvest: 299, totalHunters: 3169, successRate: 9 },
  { gmu: "011", species: "elk", year: 2023, bulls: 305, cows: 105, calves: 8, totalHarvest: 419, totalHunters: 2698, successRate: 16 },
  { gmu: "012", species: "elk", year: 2023, bulls: 494, cows: 139, calves: 17, totalHarvest: 650, totalHunters: 3017, successRate: 22 },
  { gmu: "013", species: "elk", year: 2023, bulls: 190, cows: 123, calves: 27, totalHarvest: 340, totalHunters: 1262, successRate: 27 },
  { gmu: "015", species: "elk", year: 2023, bulls: 153, cows: 202, calves: 23, totalHarvest: 378, totalHunters: 4336, successRate: 9 },
  { gmu: "018", species: "elk", year: 2023, bulls: 366, cows: 184, calves: 23, totalHarvest: 572, totalHunters: 5500, successRate: 10 },
  { gmu: "020", species: "elk", year: 2023, bulls: 171, cows: 210, calves: 24, totalHarvest: 405, totalHunters: 822, successRate: 49 },
  { gmu: "021", species: "elk", year: 2023, bulls: 271, cows: 92, calves: 6, totalHarvest: 369, totalHunters: 1906, successRate: 19 },
  { gmu: "022", species: "elk", year: 2023, bulls: 265, cows: 233, calves: 10, totalHarvest: 508, totalHunters: 2761, successRate: 18 },
  { gmu: "023", species: "elk", year: 2023, bulls: 290, cows: 139, calves: 5, totalHarvest: 433, totalHunters: 2436, successRate: 18 },
  { gmu: "024", species: "elk", year: 2023, bulls: 197, cows: 37, calves: 0, totalHarvest: 235, totalHunters: 2193, successRate: 11 },
  { gmu: "025", species: "elk", year: 2023, bulls: 145, cows: 68, calves: 25, totalHarvest: 239, totalHunters: 1954, successRate: 12 },
  { gmu: "028", species: "elk", year: 2023, bulls: 141, cows: 50, calves: 12, totalHarvest: 203, totalHunters: 3871, successRate: 5 },
  { gmu: "031", species: "elk", year: 2023, bulls: 210, cows: 147, calves: 19, totalHarvest: 375, totalHunters: 1566, successRate: 24 },
  { gmu: "033", species: "elk", year: 2023, bulls: 131, cows: 91, calves: 27, totalHarvest: 249, totalHunters: 2351, successRate: 11 },
  { gmu: "040", species: "elk", year: 2023, bulls: 165, cows: 132, calves: 8, totalHarvest: 305, totalHunters: 507, successRate: 60 },
  { gmu: "042", species: "elk", year: 2023, bulls: 357, cows: 271, calves: 23, totalHarvest: 651, totalHunters: 3179, successRate: 20 },
  { gmu: "421", species: "elk", year: 2023, bulls: 311, cows: 214, calves: 15, totalHarvest: 540, totalHunters: 3165, successRate: 17 },
  { gmu: "049", species: "elk", year: 2023, bulls: 162, cows: 146, calves: 38, totalHarvest: 346, totalHunters: 961, successRate: 36 },
  { gmu: "054", species: "elk", year: 2023, bulls: 338, cows: 81, calves: 6, totalHarvest: 425, totalHunters: 2299, successRate: 18 },
  { gmu: "061", species: "elk", year: 2023, bulls: 267, cows: 288, calves: 33, totalHarvest: 588, totalHunters: 1114, successRate: 53 },
  { gmu: "062", species: "elk", year: 2023, bulls: 584, cows: 270, calves: 26, totalHarvest: 879, totalHunters: 5072, successRate: 17 },
  { gmu: "065", species: "elk", year: 2023, bulls: 324, cows: 261, calves: 22, totalHarvest: 607, totalHunters: 3410, successRate: 18 },
  { gmu: "066", species: "elk", year: 2023, bulls: 289, cows: 91, calves: 8, totalHarvest: 389, totalHunters: 1151, successRate: 34 },
  { gmu: "070", species: "elk", year: 2023, bulls: 559, cows: 262, calves: 8, totalHarvest: 829, totalHunters: 3346, successRate: 25 },
  { gmu: "071", species: "elk", year: 2023, bulls: 379, cows: 29, calves: 0, totalHarvest: 407, totalHunters: 2439, successRate: 17 },
  { gmu: "074", species: "elk", year: 2023, bulls: 263, cows: 13, calves: 0, totalHarvest: 276, totalHunters: 1635, successRate: 17 },
  { gmu: "076", species: "elk", year: 2023, bulls: 240, cows: 104, calves: 10, totalHarvest: 353, totalHunters: 1118, successRate: 32 },
  { gmu: "077", species: "elk", year: 2023, bulls: 384, cows: 23, calves: 1, totalHarvest: 409, totalHunters: 3437, successRate: 12 },
  { gmu: "078", species: "elk", year: 2023, bulls: 351, cows: 44, calves: 8, totalHarvest: 402, totalHunters: 2879, successRate: 14 },
  { gmu: "080", species: "elk", year: 2023, bulls: 260, cows: 149, calves: 13, totalHarvest: 421, totalHunters: 3200, successRate: 13 },
  { gmu: "081", species: "elk", year: 2023, bulls: 435, cows: 216, calves: 18, totalHarvest: 669, totalHunters: 3780, successRate: 18 },
  { gmu: "082", species: "elk", year: 2023, bulls: 258, cows: 306, calves: 3, totalHarvest: 567, totalHunters: 2588, successRate: 22 },
  { gmu: "085", species: "elk", year: 2023, bulls: 340, cows: 169, calves: 19, totalHarvest: 528, totalHunters: 2931, successRate: 18 },
];

// ---------------------------------------------------------------------------
// DEER DATA — placeholder for future CPW deer report encoding
// ---------------------------------------------------------------------------

export const COLORADO_DEER_DATA: RealGMUData[] = [];

// ---------------------------------------------------------------------------
// PRONGHORN DATA — placeholder for future CPW pronghorn report encoding
// ---------------------------------------------------------------------------

export const COLORADO_PRONGHORN_DATA: RealGMUData[] = [];

// ---------------------------------------------------------------------------
// Combined elk exports
// ---------------------------------------------------------------------------

export const COLORADO_ELK_DATA: RealGMUData[] = [...ELK_2024, ...ELK_2023];
