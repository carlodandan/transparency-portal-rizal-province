/**
 * This portal's configuration. Generated for the Province of Rizal; edit freely.
 * What each field means: src/config.ts. Check it against the live API: `pnpm run check`.
 */
import { defineConfig } from './src/config.ts';

export default defineConfig({
  id: "rizal",
  kind: "province",
  name: "Province of Rizal",
  shortName: "Rizal",
  operator: {
    name: "BetterMorong.org"
  },
  scope: {
    offices: [
      "Rizal 1st District Engineering Office",
      "Rizal 2nd District Engineering Office"
    ],
    places: [
      {
        label: "Rizal",
        q: "Rizal",
        region: "IV-A"
      }
    ],
    districts: [
      "leg:antipolo-city:1st",
      "leg:antipolo-city:2nd",
      "leg:rizal:1st",
      "leg:rizal:2nd",
      "leg:rizal:3rd",
      "leg:rizal:4th"
    ],
    exclude: [],
    excludeTerms: [
      "Memorial",
      "Sports Complex",
      "Shrine",
      "High School",
      "Rizal Park",
      "State University"
    ]
  },
  reporting: {
    enabled: false
  }
});
