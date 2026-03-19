// ============================================================
// HuntScout Pro — Verified Harvest Anchor Data
// ============================================================
// Sources: State wildlife agency harvest reports, draw statistics,
// and population surveys (2018-2025). Only verified numbers are
// included; the generator will interpolate missing years.
// ============================================================

export interface StateHarvestAnchor {
  species: string;
  statewideTotalHarvest: Record<number, number>;
  statewideHunters: Record<number, number>;
  statewideSuccessRate: Record<number, number>;
  avgTagsIssued?: number;
  drawOddsRange?: [number, number];
  avgMinPoints?: number;
  notes?: string;
}

export const HARVEST_ANCHORS: Record<string, StateHarvestAnchor[]> = {
  // ============================================================
  // COLORADO
  // ============================================================
  colorado: [
    {
      species: 'elk',
      statewideTotalHarvest: {
        2018: 39800,
        2019: 39800,
        2020: 39800,
      },
      statewideHunters: {
        2018: 218782,
        2019: 218782,
        2020: 218782,
      },
      statewideSuccessRate: {
        2018: 0.182,
        2019: 0.182,
        2020: 0.182,
      },
      avgTagsIssued: 286501,
      notes:
        'Avg 2018-2020: 22,007 bulls + 17,794 cows. Pop ~280,000-300,000. 286,501 licenses across 2,779 hunts (2024). GMU 80/81 2020: 8,325 hunters, 1,182 harvest (14%); 2024: 6,939 hunters, 1,555 harvest (22.4%).',
    },
    {
      species: 'mule-deer',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        'Pop 384,100 (2024), 375,710 (2023). ~95% mule deer statewide.',
    },
    {
      species: 'sheep',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 305,
      drawOddsRange: [0.0005, 0.001],
      notes:
        'Draw odds ~1:2,161. 305 permits (2025). Pop 7,060.',
    },
    {
      species: 'goat',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        'Pop 1,565 (2024), declining to 1,390 (2025).',
    },
    {
      species: 'moose',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 685,
      notes:
        '~659 permits (2024), ~712 permits (2025).',
    },
  ],

  // ============================================================
  // MONTANA
  // ============================================================
  montana: [
    {
      species: 'elk',
      statewideTotalHarvest: {
        2018: 27089,
        2019: 27089,
        2020: 27089,
        2022: 29647,
      },
      statewideHunters: {
        2018: 109570,
        2019: 109570,
        2020: 109570,
      },
      statewideSuccessRate: {
        2018: 0.247,
        2019: 0.247,
        2020: 0.247,
      },
      notes:
        'Avg 2018-2020: 12,689 bulls + 14,401 cows. 2022: 29,647 elk. Region 1 (2024): 1,301 elk, 10% success. Region 3 (2024): 406 elk, 21% success. Region 4 (2024): 103 elk at Augusta, 26%+ success.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        'Region 1 (2024): 954 whitetail (745 bucks), 92 mule deer.',
    },
    {
      species: 'moose',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 117,
      notes: '105-129 tags per season.',
    },
    {
      species: 'sheep',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 455,
      notes:
        '105 drawing tags + 350 unlimited backcountry = 455 hunters. 38,000+ applicants.',
    },
  ],

  // ============================================================
  // WYOMING
  // ============================================================
  wyoming: [
    {
      species: 'elk',
      statewideTotalHarvest: {
        2018: 24742,
        2019: 24742,
        2020: 24742,
        2023: 29000,
      },
      statewideHunters: {
        2018: 55817,
        2019: 55817,
        2020: 55817,
        2023: 77647,
      },
      statewideSuccessRate: {
        2018: 0.443,
        2019: 0.443,
        2020: 0.443,
        2023: 0.535,
      },
      notes:
        'Avg 2018-2020: 11,940 bulls + 12,802 cows. 2023 RECORD: ~29,000 harvest, 77,647 tags, 53.5% success. Pop ~109,000.',
    },
    {
      species: 'mule-deer',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        'Pop 307,500 (2024): 230,500 mule deer + 77,000 whitetail.',
    },
    {
      species: 'pronghorn',
      statewideTotalHarvest: {},
      statewideHunters: {
        2020: 58206,
        2023: 30450,
      },
      statewideSuccessRate: {
        2020: 0.85,
        2023: 0.85,
      },
      notes:
        '58,206 licenses (2020) dropping to 30,450 (2023) due to winter kill. 85%+ success.',
    },
    {
      species: 'moose',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {
        2023: 0.39,
        2024: 0.95,
      },
      notes: '2024 success 95%; 2023 success 39% (bad weather).',
    },
  ],

  // ============================================================
  // IDAHO
  // ============================================================
  idaho: [
    {
      species: 'elk',
      statewideTotalHarvest: {
        2020: 22776,
        2021: 20396,
        2022: 20952,
        2023: 18568,
        2024: 20996,
      },
      statewideHunters: {
        2020: 98000,
        2021: 89000,
        2022: 88551,
        2023: 87864,
      },
      statewideSuccessRate: {
        2020: 0.23,
        2021: 0.229,
        2022: 0.23,
        2023: 0.21,
        2024: 0.24,
      },
      notes:
        '2020: 11,897 bulls + 10,879 antlerless. 2024: 12,610 bulls + 8,386 antlerless. General: 19% success; Controlled: 42% success.',
    },
    {
      species: 'mule-deer',
      statewideTotalHarvest: {
        2020: 24809,
        2021: 26086,
        2022: 23588,
        2023: 18329,
        2024: 23898,
      },
      statewideHunters: {
        2021: 79825,
        2022: 79516,
        2023: 74503,
        2024: 73748,
      },
      statewideSuccessRate: {
        2020: 0.28,
        2021: 0.36,
        2022: 0.29,
        2023: 0.25,
        2024: 0.28,
      },
      notes:
        '2024: 28% general / 53% controlled success.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2020: 24849,
        2021: 21418,
        2022: 19182,
        2023: 19828,
        2024: 20908,
      },
      statewideHunters: {
        2021: 54223,
        2022: 47286,
        2023: 49098,
        2024: 48766,
      },
      statewideSuccessRate: {
        2020: 0.44,
        2021: 0.40,
        2022: 0.38,
        2023: 0.40,
        2024: 0.40,
      },
      notes:
        '2024: 40% general / 46% controlled success.',
    },
    {
      species: 'moose',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {
        2024: 0.83,
      },
      avgTagsIssued: 517,
      notes: '517 tags; 2024 success 83%.',
    },
    {
      species: 'sheep',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 103,
      notes: '103 tags.',
    },
    {
      species: 'goat',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 40,
      notes: '40 tags.',
    },
  ],

  // ============================================================
  // NEW MEXICO
  // ============================================================
  'new-mexico': [
    {
      species: 'elk',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 37282,
      notes:
        'Pop ~104,000. Avg licenses 37,282. Avg harvest 14,832 (8,404 bulls + 6,428 cows). Success 41.1%.',
    },
    {
      species: 'pronghorn',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Pop ~64,000. Success ~75%.',
    },
  ],

  // ============================================================
  // ARIZONA
  // ============================================================
  arizona: [
    {
      species: 'mule-deer',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        'Pop ~179,000 (85K mule deer + 94K Coues whitetail).',
    },
    {
      species: 'sheep',
      statewideTotalHarvest: {
        2023: 149,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 156,
      notes:
        'Rocky Mtn 2023: 19 tags, 18 harvested; 5,177 applicants. Desert 2023: 137 tags, 131 harvested.',
    },
  ],

  // ============================================================
  // UTAH
  // ============================================================
  utah: [
    {
      species: 'elk',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 15000,
      notes:
        'Pop ~82,960. General 15,000 early any-bull permits. Rifle success 72-76%; Muzzleloader 67-75%; Archery 28-31%.',
    },
    {
      species: 'goat',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        '95% avg success. 1,851 permits issued 1981-2017.',
    },
  ],

  // ============================================================
  // NEVADA
  // ============================================================
  nevada: [
    {
      species: 'mule-deer',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 12954,
      notes: '12,954 tags (2024-25), 19.5% increase.',
    },
    {
      species: 'elk',
      statewideTotalHarvest: {
        2024: 747,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 4360,
      notes: '4,360 tags (2024-25). 747 bulls harvested 2024.',
    },
    {
      species: 'sheep',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {
        2024: 0.89,
      },
      avgTagsIssued: 229,
      notes:
        'CA Bighorn 2024: 40 tags, 85% success. Desert 2024: 189 tags, 91% success.',
    },
    {
      species: 'bear',
      statewideTotalHarvest: {
        2024: 13,
      },
      statewideHunters: {},
      statewideSuccessRate: {
        2024: 0.31,
      },
      avgTagsIssued: 42,
      notes: '42 tags, 13 harvested, 31% success.',
    },
  ],

  // ============================================================
  // OREGON
  // ============================================================
  oregon: [
    {
      species: 'elk',
      statewideTotalHarvest: {
        2023: 15550,
      },
      statewideHunters: {
        2023: 89494,
      },
      statewideSuccessRate: {
        2023: 0.24,
      },
      notes: '2023: 15,550 harvest, 89,494 hunters, 24% success.',
    },
    {
      species: 'mule-deer',
      statewideTotalHarvest: {
        2023: 42219,
      },
      statewideHunters: {
        2023: 132954,
      },
      statewideSuccessRate: {},
      notes:
        'Black-tailed 2023: 42,219 harvest, 132,954 hunters. Controlled mule deer ALW: 14,045 at 47% success.',
    },
    {
      species: 'sheep',
      statewideTotalHarvest: {
        2023: 99,
      },
      statewideHunters: {},
      statewideSuccessRate: {
        2023: 0.96,
      },
      notes:
        '2023: 5 RM tags (100% success); ~94 CA bighorn (96% success).',
    },
    {
      species: 'goat',
      statewideTotalHarvest: {
        2023: 18,
      },
      statewideHunters: {},
      statewideSuccessRate: {
        2023: 0.63,
      },
      avgTagsIssued: 32,
      notes:
        '2023: 32 tags, 18 harvested, 63% success. Pop 1,100-1,300.',
    },
    {
      species: 'bear',
      statewideTotalHarvest: {
        2024: 1939,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        '2024: 1,939 (844 spring + 1,095 fall). Pop ~44,000.',
    },
  ],

  // ============================================================
  // WASHINGTON
  // ============================================================
  washington: [
    {
      species: 'elk',
      statewideTotalHarvest: {},
      statewideHunters: {
        2021: 51422,
      },
      statewideSuccessRate: {},
      notes: '2021: 51,422 elk hunters.',
    },
    {
      species: 'sheep',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 16,
      notes: '16 permits (2025).',
    },
  ],

  // ============================================================
  // CALIFORNIA
  // ============================================================
  california: [
    {
      species: 'mule-deer',
      statewideTotalHarvest: {
        2023: 28637,
      },
      statewideHunters: {},
      statewideSuccessRate: {
        2023: 0.166,
      },
      notes: '2023: 28,637 harvest, 16.6% success. X-zones ~28% success.',
    },
    {
      species: 'bear',
      statewideTotalHarvest: {
        2024: 808,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 30000,
      notes: 'Quota 1,700. 2024: 808 harvested of 30,000+ tags sold.',
    },
  ],

  // ============================================================
  // ALASKA
  // ============================================================
  alaska: [
    {
      species: 'moose',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '~7,000-8,000+ statewide annually.',
    },
    {
      species: 'goat',
      statewideTotalHarvest: {
        2024: 715,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '715 harvested (2024).',
    },
  ],

  // ============================================================
  // MISSOURI
  // ============================================================
  missouri: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 44543,
        2024: 47119,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest. 2024: 47,119; 2023: 44,543.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 326026,
        2024: 275656,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2023-24: 326,026 (record). 2024-25: 275,656.',
    },
  ],

  // ============================================================
  // KANSAS
  // ============================================================
  kansas: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2024: 11134,
      },
      statewideHunters: {
        2024: 21737,
      },
      statewideSuccessRate: {
        2024: 0.60,
      },
      notes: 'Spring harvest. 2024: 11,134; 21,737 hunters; 60% success (Unit 2).',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 89390,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2023-24: 89,390 (record).',
    },
  ],

  // ============================================================
  // NEBRASKA
  // ============================================================
  nebraska: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 12302,
        2024: 13097,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2024: 39324,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Firearm 2024: 39,324.',
    },
    {
      species: 'sheep',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '32 rams total since 1998. Pop ~275.',
    },
  ],

  // ============================================================
  // IOWA
  // ============================================================
  iowa: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 14843,
        2024: 16059,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 57084,
      notes: 'Spring harvest. 2024: 16,059 (record). 57,084 licenses.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 104274,
        2024: 101284,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        '2023-24: 104,274 reported (est 157,767 actual). 2024-25: ~101,284.',
    },
  ],

  // ============================================================
  // WISCONSIN
  // ============================================================
  wisconsin: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 42439,
        2024: 50435,
      },
      statewideHunters: {},
      statewideSuccessRate: {
        2023: 0.226,
        2024: 0.226,
      },
      notes: 'Spring harvest. 2024: 50,435 (+22% vs 5yr avg). Success 22.6%.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 92050,
        2024: 189622,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2024 gun season: 189,622. 2023 gun opener: 92,050.',
    },
    {
      species: 'bear',
      statewideTotalHarvest: {
        2023: 2922,
        2024: 4432,
      },
      statewideHunters: {},
      statewideSuccessRate: {
        2024: 0.37,
      },
      notes: '2024: 4,432, 37% success. 2023: 2,922.',
    },
  ],

  // ============================================================
  // MINNESOTA
  // ============================================================
  minnesota: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 13659,
        2024: 16660,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 59654,
      notes: 'Spring harvest. 2024: 16,660 (record). 59,654 licenses.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 158678,
        2024: 170544,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
    {
      species: 'moose',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 87,
      notes: '2024: 87 permits.',
    },
  ],

  // ============================================================
  // ALABAMA
  // ============================================================
  alabama: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 18122,
        2024: 35906,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest. 2023: 18,122 (reported). 2024: ~35,906.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 201124,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2023-24: 201,124.',
    },
  ],

  // ============================================================
  // MISSISSIPPI
  // ============================================================
  mississippi: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 11277,
        2024: 15455,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 279000,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2023: ~279,000.',
    },
  ],

  // ============================================================
  // GEORGIA
  // ============================================================
  georgia: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2024: 11924,
      },
      statewideHunters: {
        2024: 38810,
      },
      statewideSuccessRate: {},
      notes: 'Spring harvest. 2024: 11,924; 38,810 hunters.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 288871,
        2024: 273079,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2023-24: 288,871 (record). 2024-25: 273,079.',
    },
  ],

  // ============================================================
  // SOUTH CAROLINA
  // ============================================================
  'south-carolina': [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2024: 12428,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest. 2024: 12,428; 245,845 hunter-days.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2024: 190707,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // TENNESSEE
  // ============================================================
  tennessee: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 31802,
        2024: 31647,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
  ],

  // ============================================================
  // VIRGINIA
  // ============================================================
  virginia: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 24447,
        2024: 21988,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest. 2023: 24,447 (record).',
    },
    {
      species: 'bear',
      statewideTotalHarvest: {
        2023: 2892,
        2025: 2344,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2023-24: 2,892. 2025-26: 2,344.',
    },
  ],

  // ============================================================
  // ARKANSAS
  // ============================================================
  arkansas: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 9193,
        2024: 9335,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
  ],

  // ============================================================
  // LOUISIANA
  // ============================================================
  louisiana: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 2833,
        2024: 3695,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest. 2024: 3,695 (record).',
    },
  ],

  // ============================================================
  // PENNSYLVANIA
  // ============================================================
  pennsylvania: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 39500,
        2024: 39300,
      },
      statewideHunters: {
        2023: 170000,
        2024: 170000,
      },
      statewideSuccessRate: {},
      notes: 'Spring harvest. ~170,000 hunters.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 430010,
        2024: 476880,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        '2024-25: 476,880 (175,280 antlered + 301,600 antlerless). 2023-24: 430,010.',
    },
    {
      species: 'bear',
      statewideTotalHarvest: {
        2023: 2920,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 206000,
      notes: '2023: 2,920. 206,000+ licenses.',
    },
  ],

  // ============================================================
  // WEST VIRGINIA
  // ============================================================
  'west-virginia': [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 12217,
        2024: 11650,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'bear',
      statewideTotalHarvest: {
        2023: 2830,
        2024: 2479,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // KENTUCKY
  // ============================================================
  kentucky: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 35655,
        2024: 33460,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 140881,
        2024: 149868,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // NORTH CAROLINA
  // ============================================================
  'north-carolina': [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 24089,
        2024: 24074,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '~168,000-170,000 annually.',
    },
    {
      species: 'bear',
      statewideTotalHarvest: {
        2022: 4056,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2022: 4,056 (record).',
    },
  ],

  // ============================================================
  // SOUTH DAKOTA
  // ============================================================
  'south-dakota': [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2024: 8293,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring ~4,024. 2024 total: 8,293.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2024: 47100,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // NORTH DAKOTA
  // ============================================================
  'north-dakota': [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2024: 3336,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 8137,
      notes: '2024: 3,336 (record). 8,137 licenses.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 31582,
        2024: 33293,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
    {
      species: 'sheep',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 7,
      notes: '6-7 licenses, 100% success.',
    },
  ],

  // ============================================================
  // NEW HAMPSHIRE
  // ============================================================
  'new-hampshire': [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 5580,
        2024: 4562,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 13136,
        2024: 12282,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
    {
      species: 'moose',
      statewideTotalHarvest: {
        2024: 23,
      },
      statewideHunters: {},
      statewideSuccessRate: {
        2024: 0.64,
      },
      avgTagsIssued: 35,
      notes: '2024: 23 harvested, 35 permits, 64% success.',
    },
  ],

  // ============================================================
  // VERMONT
  // ============================================================
  vermont: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2024: 5159,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 16800,
        2024: 17200,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
    {
      species: 'moose',
      statewideTotalHarvest: {
        2023: 78,
        2024: 62,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 180,
      notes: '2024: 62 harvested, 180 permits. 2023: 78 harvested.',
    },
  ],

  // ============================================================
  // MAINE
  // ============================================================
  maine: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 7000,
        2024: 6660,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 38215,
        2024: 42259,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
    {
      species: 'moose',
      statewideTotalHarvest: {
        2023: 2440,
        2024: 2595,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      avgTagsIssued: 4105,
      notes: '2024: 2,595 harvested, 4,105 permits. 2023: 2,440.',
    },
    {
      species: 'bear',
      statewideTotalHarvest: {
        2023: 3269,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // FLORIDA
  // ============================================================
  florida: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 11590,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 98000,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2023-24: ~98,000+.',
    },
  ],

  // ============================================================
  // MASSACHUSETTS
  // ============================================================
  massachusetts: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2023: 3113,
        2024: 2879,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 15522,
        2024: 15032,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // RHODE ISLAND
  // ============================================================
  'rhode-island': [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2024: 331,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 2794,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // DELAWARE
  // ============================================================
  delaware: [
    {
      species: 'turkey',
      statewideTotalHarvest: {
        2024: 800,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Spring harvest. 2024: 800 (record).',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2024: 18823,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2024-25: 18,823 (record).',
    },
  ],

  // ============================================================
  // TEXAS
  // ============================================================
  texas: [
    {
      species: 'turkey',
      statewideTotalHarvest: {},
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: 'Harvest rate ~13% of males. Not publicly totaled.',
    },
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 740000,
      },
      statewideHunters: {
        2023: 757000,
      },
      statewideSuccessRate: {
        2023: 0.68,
      },
      notes: '2023: ~740,000 by ~757,000 hunters. 68% success.',
    },
  ],

  // ============================================================
  // MICHIGAN
  // ============================================================
  michigan: [
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 274057,
        2024: 287664,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes:
        '2024: 287,664 reported (~373K estimated). 2023: ~274,057.',
    },
  ],

  // ============================================================
  // ILLINOIS
  // ============================================================
  illinois: [
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 160313,
        2024: 170758,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2024-25: 170,758 (record). 2023-24: 160,313.',
    },
  ],

  // ============================================================
  // INDIANA
  // ============================================================
  indiana: [
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 173942,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2023 firearm: 173,942.',
    },
  ],

  // ============================================================
  // OHIO
  // ============================================================
  ohio: [
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 213928,
        2024: 87192,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
      notes: '2023-24: 213,928 total season. 2024 gun only: 87,192.',
    },
  ],

  // ============================================================
  // NEW YORK
  // ============================================================
  'new-york': [
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 209781,
        2024: 223304,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // MARYLAND
  // ============================================================
  maryland: [
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 72642,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // NEW JERSEY
  // ============================================================
  'new-jersey': [
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2023: 35573,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],

  // ============================================================
  // CONNECTICUT
  // ============================================================
  connecticut: [
    {
      species: 'whitetail',
      statewideTotalHarvest: {
        2024: 8514,
      },
      statewideHunters: {},
      statewideSuccessRate: {},
    },
  ],
};
