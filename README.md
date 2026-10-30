# Tea Recommender

A static, single-page tea finder. Answer five quick questions and get three teas, each with a reason it was picked and how to brew it. It's plain HTML, CSS, and JavaScript with no build step, so it runs on GitHub Pages as-is.

## Files

- `index.html`: the page and the five questions
- `styles.css`: layout and styling, with light and dark themes
- `app.js`: scoring, filtering, the written explanations, and rendering
- `teas.json`: the tea catalog (40 teas)

## Running it

On GitHub Pages: in **Settings → Pages**, publish from the branch root. The page is `index.html`.

Locally, serve the folder over HTTP. Browsers block `fetch` of `teas.json` from a `file://` page.

```bash
python3 -m http.server
```

Then open http://localhost:8000.

## Editing the catalog

Every tea in `teas.json` looks like this:

```json
{
  "name": "Sencha",
  "type": "green",
  "origin": "Shizuoka, Japan",
  "flavors": ["grassy", "vegetal"],
  "intensity": 3,
  "caffeine": "medium",
  "astringency": 3,
  "brew": { "water": "75°C / 165°F", "steep": "1 minute", "leaf": "1 tsp (3 g) per cup" },
  "description": "Bright and grassy, with a savory, steamed-greens edge and a brisk, slightly bitter finish."
}
```

- `type`: `green`, `black`, `oolong`, `white`, `puerh`, or `herbal`
- `flavors`: any of `grassy`, `floral`, `malty`, `smoky`, `citrus`, `stone fruit`, `spiced`, `earthy`, `nutty`, `mineral`, `vegetal`, `creamy`
- `intensity`: 1–5, how assertive the cup is
- `caffeine`: `none`, `low`, `medium`, or `high`
- `astringency`: 1–5, how drying and tannic it is

To add a tea, copy an entry, edit it, and keep the JSON valid (watch the commas).

## How recommendations are scored

Every tea gets a score, and the top three are shown. The same answers always give the same results.

- +10 for each flavor tag shared with the picks
- −4 for each step the tea's intensity is from the target (Delicate 2, Balanced 3, Assertive 4.5)
- +5 if the tea fits the chosen mood (the mood families are defined in `MOODS` in `app.js`)
- Astringency 4–5: −30 if nothing has been eaten in a couple of hours, −8 within an hour of a full meal
- Ties go to the gentler tea: lower astringency, then lower intensity, then less caffeine

Hard filters, applied before scoring:

- Caffeine is capped by time of day: morning allows anything, afternoon up to medium, evening low or none, before bed none.
- "Something soft and quiet" never goes above low caffeine.
- A tea has to share at least one flavor and score above zero. If fewer than three teas pass, the page shows only those and explains why the list is short.

The weights and caps are constants at the top of `app.js`.
