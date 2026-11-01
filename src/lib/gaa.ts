/**
 * The enacted budgets (GAA FY2020–2026) for the portal's area.
 *
 * The GAA lists money by department, agency and program, activity or project
 * (P/A/P); it has no place or office filter. So, as for the 2027 lines, a
 * program is here because its name names one of the scope's places: every
 * department is searched with each place's `q`, and every matching program
 * "family" (one name in one agency, across the years) is kept, all pages.
 *
 * - Amounts are the API's: integer pesos per year, as enacted. They are the
 *   authority to spend, not spending.
 * - A year counts only where the amount is above zero. The API's per-year
 *   `count` carries a project's lines into later years at ₱0, so a count
 *   alone does not mean the year's GAA funds it.
 * - A family is one name; a renamed project is a different row.
 * - Names are matched, not places surveyed, and the GAA carries no region, so
 *   a place's `region` cannot narrow these; `q` has to.
 * - DPWH money by office per year is not here: it comes with each office from
 *   the district pages (see OfficeHistory on the page).
 */
import type { Exclusion, PortalConfig } from '../config';
import type { Client } from '../api/client';
import type { GaaDepartment, GaaProgram } from '../api/types';
import { GAA_YEARS } from '../api/types';
import psgc from '../data/psgc.json';

interface PsgcProvince {
  name: string;
  code: string;
  region_key: string;
  cities: string[];
  municipalities: string[];
  lgus: string[];
}

interface PsgcData {
  provinces: Record<string, PsgcProvince>;
  namesakeTowns: Record<string, string[]>;
}

const psgcTyped = psgc as PsgcData;

const NCR_CITIES = [
  'manila', 'taguig', 'pasig', 'makati', 'quezon city', 'caloocan', 'valenzuela',
  'marikina', 'las piñas', 'muntinlupa', 'parañaque', 'pasay', 'mandaluyong',
  'navotas', 'malabon', 'pateros'
];

export function resolveParentProvince(placeLabel: string, config: PortalConfig): string | null {
  const p = config.scope.places?.find((pl) => pl.label.toLowerCase() === placeLabel.toLowerCase());
  if (p?.province) return p.province;
  if (config.scope.province) return config.scope.province;

  // Check if portal is a province
  const provKey = Object.keys(psgcTyped.provinces).find(
    (k) =>
      k.toLowerCase() === config.name.toLowerCase() ||
      k.toLowerCase() === config.shortName?.toLowerCase() ||
      k.toLowerCase() === placeLabel.toLowerCase() ||
      `province of ${k.toLowerCase()}` === config.name.toLowerCase()
  );
  if (provKey) return provKey;

  // For a city / municipality, find candidate provinces that contain this LGU in PSGC
  const candidates = Object.keys(psgcTyped.provinces).filter((provName) => {
    return psgcTyped.provinces[provName].lgus.some((l) => l.toLowerCase() === placeLabel.toLowerCase());
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Disambiguate using region, offices, or legislative districts
  const region = p?.region;
  const officeStr = (config.scope.offices || []).join(' ').toLowerCase();
  const districtStr = (config.scope.districts || []).join(' ').toLowerCase();

  const matched = candidates.find((provName) => {
    const provInfo = psgcTyped.provinces[provName];
    if (region && provInfo.region_key.toLowerCase() === region.toLowerCase()) return true;
    if (officeStr.includes(provName.toLowerCase())) return true;
    if (districtStr.includes(provName.toLowerCase())) return true;
    return false;
  });

  return matched || candidates[0];
}

export function isGaaProgramForScope(title: string, config: PortalConfig, placeLabel: string): boolean {
  const lower = title.toLowerCase();
  const placeLower = placeLabel.toLowerCase();

  // 1. Exclude terms (e.g. "memorial", "sports complex", "shrine", "high school", "rizal park")
  const excludeTerms = (config.scope.excludeTerms ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);
  if (excludeTerms.some((t) => lower.includes(t))) {
    return false;
  }

  // 2. Must contain the place as a distinct word
  const wordRegex = new RegExp(`\\b${placeLower}\\b`, 'i');
  if (!wordRegex.test(lower)) {
    return false;
  }

  // 3. Province scope:
  // Check if portal is a province, or if the placeLabel matches a known province
  const pKey = Object.keys(psgcTyped.provinces).find(
    (k) =>
      k.toLowerCase() === config.name.toLowerCase() ||
      k.toLowerCase() === config.shortName?.toLowerCase() ||
      k.toLowerCase() === placeLabel.toLowerCase() ||
      `province of ${k.toLowerCase()}` === config.name.toLowerCase()
  );

  if (pKey) {
    const prov = psgcTyped.provinces[pKey];
    const provNameLower = pKey.toLowerCase();
    const provLgus = new Set<string>();
    if (prov) {
      for (const l of prov.lgus) {
        provLgus.add(l.toLowerCase());
        if (l.toLowerCase() === 'rodriguez') provLgus.add('montalban');
        if (l.toLowerCase() === 'jala-jala') provLgus.add('jalajala');
        if (l.toLowerCase() === 'jalajala') provLgus.add('jala-jala');
      }
    }

    const otherProvinces = Object.keys(psgcTyped.provinces)
      .filter((k) => k.toLowerCase() !== provNameLower)
      .map((k) => k.toLowerCase());

    const isForeignWord = (word: string) => {
      if (word === provNameLower) return false;
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(lower);
    };

    const foreignProv = otherProvinces.find(isForeignWord);
    const foreignNcr = provNameLower !== 'metro manila' ? NCR_CITIES.find(isForeignWord) : null;
    const foreignPlace = foreignProv || foreignNcr;

    const hasProvLgu = [...provLgus].some((lgu) => new RegExp(`\\b${lgu}\\b`, 'i').test(lower));
    const provRegex = new RegExp(`(,\\s*${provNameLower}|\\bprovince of ${provNameLower}\\b|\\b${provNameLower} province\\b|\\bdeo.*${provNameLower}\\b)`, 'i');
    const hasProvSuffix = provRegex.test(lower);

    if (foreignPlace) {
      if (!hasProvLgu || !hasProvSuffix) {
        return false;
      }
      if (foreignProv && new RegExp(`(,\\s*${foreignProv}|\\bprovince of ${foreignProv}\\b)`, 'i').test(lower)) {
        return false;
      }
    }

    // Must not be just a street, avenue, or barangay named after the province/hero in another town
    const isJustStreetOrBrgy =
      new RegExp(`\\b(brgy|barangay|st|street|ave|avenue|dr|road|rd)\\.?\\s+${provNameLower}\\b`, 'i').test(lower) &&
      !hasProvSuffix &&
      !hasProvLgu;

    if (isJustStreetOrBrgy) {
      return false;
    }

    return hasProvLgu || hasProvSuffix;
  }

  // 4. Municipality / City scope:
  const parent = resolveParentProvince(placeLabel, config);
  if (parent) {
    const parentLower = parent.toLowerCase();

    // A. Namesakes in other province
    const namesakes = psgcTyped.namesakeTowns[placeLower];
    if (namesakes && namesakes.length > 1) {
      const otherNamesakeProvs = namesakes
        .filter((p) => p.toLowerCase() !== parentLower)
        .map((p) => p.toLowerCase());

      const hasOtherProv = otherNamesakeProvs.some((op) => new RegExp(`\\b${op}\\b`, 'i').test(lower));
      const hasOurProv = new RegExp(`\\b${parentLower}\\b`, 'i').test(lower);

      if (hasOtherProv && !hasOurProv) {
        return false;
      }
    }

    // B. Foreign provinces or NCR cities
    const otherProvinces = Object.keys(psgcTyped.provinces)
      .filter((k) => k.toLowerCase() !== parentLower)
      .map((k) => k.toLowerCase());

    const isForeignWord = (word: string) => {
      if (word === parentLower) return false;
      return new RegExp(`\\b${word}\\b`, 'i').test(lower);
    };

    const foreignProv = otherProvinces.find(isForeignWord);
    const foreignNcr = NCR_CITIES.find(isForeignWord);
    const foreign = foreignProv || foreignNcr;

    if (foreign) {
      const hasOurProv = new RegExp(`(,\\s*${parentLower}|\\bprovince of ${parentLower}\\b|\\b${parentLower} province\\b)`, 'i').test(lower);
      if (!hasOurProv) {
        return false;
      }
    }

    // C. Not just a street or barangay in another municipality
    const isJustStreetOrBrgy =
      new RegExp(`\\b(brgy|barangay|st|street|ave|avenue|dr|road|rd)\\.?\\s+${placeLower}\\b`, 'i').test(lower) &&
      !new RegExp(`(,\\s*${placeLower}|\\bmunicipality of ${placeLower}\\b|\\bcity of ${placeLower}\\b)`, 'i').test(lower);

    if (isJustStreetOrBrgy) {
      return false;
    }
  }

  return true;
}

export interface GaaRow extends GaaProgram {
  /** `gaa:<fam_key>`, the key exclusions use. */
  key: string;
  department: string;
  /** The place labels whose search found it. */
  reasons: string[];
}

export interface GaaQuery {
  place: string;
  q: string;
  department_id: string;
  department: string;
  /** Families the API matched (all years). */
  matched: number;
  /** Families fetched (less than matched only when cut at the limit). */
  fetched: number;
  truncated: boolean;
  api: string;
}

export interface GaaResult {
  rows: GaaRow[];
  /** One per place and department with a match. */
  queries: GaaQuery[];
  /** Departments searched per place. */
  searched: number;
  departments: GaaDepartment[];
  excluded: { exclusion: Exclusion; row: GaaRow | null }[];
}

export const gaaKey = (famKey: string) => `gaa:${famKey}`;

/** "Department of Public Works and Highways (DPWH)" → "DPWH"; otherwise the name. */
export function departmentShort(description: string): string {
  return /\(([^)]+)\)\s*$/.exec(description)?.[1] ?? description;
}

const cache = new Map<string, Promise<GaaResult>>();

/** Memoised per API host and places, so leaving and reopening the page does not search again. */
export function loadGaa(client: Client, config: PortalConfig, onProgress?: (done: number, total: number) => void): Promise<GaaResult> {
  const key = JSON.stringify([client.base, config.scope.places ?? [], config.scope.exclude ?? [], config.scope.excludeTerms ?? []]);
  let hit = cache.get(key);
  if (!hit) {
    hit = resolveGaa(client, config, onProgress);
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}

export async function resolveGaa(client: Client, config: PortalConfig, onProgress?: (done: number, total: number) => void): Promise<GaaResult> {
  // Only search GAA for places where gaa is not explicitly false
  const places = (config.scope.places ?? []).filter((p) => p.gaa !== false);
  const departments = (await client.gaaDepartments()).data;
  const jobs = places.flatMap((p) => departments.map((d) => ({ place: p.label, q: p.q ?? p.label, department: d })));

  let done = 0;
  onProgress?.(0, jobs.length);
  const results: Awaited<ReturnType<Client['gaaPrograms']>>[] = [];
  // A few departments at a time; each department's pages come one after another.
  for (let i = 0; i < jobs.length; i += 8) {
    const batch = await Promise.all(
      jobs.slice(i, i + 8).map(async (j) => {
        const r = await client.gaaPrograms(j.department.id, j.q);
        onProgress?.(++done, jobs.length);
        return r;
      }),
    );
    results.push(...batch);
  }

  const byKey = new Map<string, GaaRow>();
  const queries: GaaQuery[] = [];
  jobs.forEach((j, i) => {
    const { first, rows, truncated } = results[i];
    const filteredRows = rows.filter((r) => isGaaProgramForScope(r.name || r.fam_key || '', config, j.place));

    const matched = first.meta.matched ?? rows.length;
    if (!matched) return;
    queries.push({
      place: j.place,
      q: j.q,
      department_id: j.department.id,
      department: j.department.description,
      matched,
      fetched: filteredRows.length,
      truncated,
      api: client.href(`/api/v1/gaa/departments/${j.department.id}/programs`, { q: j.q }),
    });
    for (const r of filteredRows) {
      const key = gaaKey(r.fam_key);
      const seen = byKey.get(key);
      if (!seen) byKey.set(key, { ...r, key, department: j.department.description, reasons: [j.place] });
      else if (!seen.reasons.includes(j.place)) seen.reasons.push(j.place);
    }
  });

  const exclusions = (config.scope.exclude ?? []).filter((e) => e.key.startsWith('gaa:'));
  const excludedKeys = new Set(exclusions.map((e) => e.key));
  const latest = String(GAA_YEARS[GAA_YEARS.length - 1]);
  const rows = [...byKey.values()]
    .filter((r) => !excludedKeys.has(r.key))
    .sort((a, b) => (b.years[latest]?.amount ?? 0) - (a.years[latest]?.amount ?? 0) || lastYear(b) - lastYear(a) || a.name.localeCompare(b.name));

  return {
    rows,
    queries: queries.sort((a, b) => b.matched - a.matched),
    searched: departments.length,
    departments,
    excluded: exclusions.map((exclusion) => ({ exclusion, row: byKey.get(exclusion.key) ?? null })),
  };
}

/** The last year a family has an appropriation (0 when none). */
function lastYear(r: GaaProgram): number {
  for (let i = GAA_YEARS.length - 1; i >= 0; i--) if ((r.years[String(GAA_YEARS[i])]?.amount ?? 0) > 0) return GAA_YEARS[i];
  return 0;
}

export interface GaaYearTotal { year: number; programs: number; amount: number }

/** An appropriation in that year: an amount above zero (a count alone can be a line carried forward at ₱0). */
export function hasYear(r: GaaProgram, year: number | string): boolean {
  return (r.years[String(year)]?.amount ?? 0) > 0;
}

/** Per year: how many of the rows carry an appropriation, and the sum. One year's figures, never added across years here. */
export function gaaYearTotals(rows: readonly GaaProgram[]): GaaYearTotal[] {
  return GAA_YEARS.map((year) => {
    let programs = 0;
    let amount = 0;
    for (const r of rows) {
      if (hasYear(r, year)) {
        programs++;
        amount += r.years[String(year)].amount;
      }
    }
    return { year, programs, amount };
  });
}

/** Every GAA row as one CSV: a column per year, exact pesos. */
export function gaaCsv(rows: readonly GaaRow[]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['department', 'agency_id', 'name', ...GAA_YEARS.map((y) => `gaa_${y}_php`), 'names', 'family_key'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push(
      [
        departmentShort(r.department),
        r.agency_id,
        r.name,
        ...GAA_YEARS.map((y) => (hasYear(r, y) ? r.years[String(y)].amount : '')),
        r.reasons.join('; '),
        r.fam_key,
      ].map(cell).join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
