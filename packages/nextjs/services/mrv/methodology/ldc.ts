/**
 * UN list of Least Developed Countries (ISO 3166-1 alpha-2), for VMR0017 v1.0 Table 1: hydroelectric project
 * activities are eligible "in LDC countries only". Source: UN-OHRLLS / UNCTAD list, 44 countries as of
 * September 2026. Update it when the General Assembly adds or graduates a country.
 *
 * Scheduled graduations take effect on the date given. Where only the year is known (Solomon Islands 2027,
 * Cambodia and Senegal 2029) the first day of that year is used, so a country stops counting as an LDC no later
 * than it actually graduates: the conservative side.
 */
export const LDC_LIST_AS_OF = "2026-09-25";

const GRADUATES_ON: Record<string, string | null> = {
  // Africa (32)
  AO: null,
  BJ: null,
  BF: null,
  BI: null,
  CF: null,
  TD: null,
  KM: null,
  CD: null,
  DJ: null,
  ER: null,
  ET: null,
  GM: null,
  GN: null,
  GW: null,
  LS: null,
  LR: null,
  MG: null,
  MW: null,
  ML: null,
  MR: null,
  MZ: null,
  NE: null,
  RW: null,
  SN: "2029-01-01",
  SL: null,
  SO: null,
  SS: null,
  SD: null,
  TZ: null,
  TG: null,
  UG: null,
  ZM: null,
  // Asia (8): Bangladesh, Lao PDR and Nepal graduate on 24 November 2026 (A/RES/76/8)
  AF: null,
  BD: "2026-11-24",
  KH: "2029-01-01",
  LA: "2026-11-24",
  MM: null,
  NP: "2026-11-24",
  TL: null,
  YE: null,
  // Caribbean and Pacific (4)
  HT: null,
  KI: null,
  SB: "2027-01-01",
  TV: null,
};

/** Whether the country is on the LDC list at the given unix time (seconds). */
export function isLeastDevelopedCountry(countryCode: string, atUnix: number): boolean {
  const code = countryCode.toUpperCase();
  if (!(code in GRADUATES_ON)) return false;
  const graduation = GRADUATES_ON[code];
  return graduation === null || atUnix < Date.parse(`${graduation}T00:00:00Z`) / 1_000;
}

export const LDC_COUNT = Object.keys(GRADUATES_ON).length;
