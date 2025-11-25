# Process Version & Drift Visualization

Interactive exploration tool for comparing process behavior across time windows or version clusters. It renders a directly-follows graph (DFG) and a timeline panel so you can brush one or two regions, normalize counts by window totals, and immediately see how paths and activities change.

> This project extends the ideas in [Process-Change-Exploration-Visualizations](https://github.com/yesanton/Process-Change-Exploration-Visualizations) with richer comparison modes, better brushing, and clearer percent/absolute views.

![Process Change Exploration screenshot](docs/screenshot.png)

## Features
- Dual-mode brushing: select one region to focus, or two regions to see normalized percentage deltas on nodes and edges.
- Percent vs absolute toggles: switch between raw counts and per-window normalized percentages for both activities and relations.
- Timeline modes: view by individual time windows or merged version runs; drift markers stay visible during brushing.
- Path/activity sliders: quickly filter to the most frequent paths or activities without losing brush context.
- Color-encoded diffs: green/red edges and nodes highlight increases/decreases; neutral coloring for single selections.

## Getting Started
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/Process-Version-And-Drift-Visualization.git
   cd Process-Version-And-Drift-Visualization/vis-system
   ```
2. Start a simple local server (any static server works):
   ```bash
   python3 -m http.server 8000
   ```
3. Open http://localhost:8000/ in your browser. The demo uses the provided `data/Road_Traffic_Fine_Management_Process_*` CSVs.

## Usage Guide
- **Brushing**: Drag over the bottom timeline to create a selection. Drag twice to compare two regions; selections auto-sort by time.
- **Performance toggle**: Use the `% PERFORMANCE / ABSOLUTE PERFORMANCE` buttons to switch normalization modes in the DFG.
- **Timeline mode**: Switch between `TIME WINDOW` and `TIME VERSION` to aggregate windows by version runs.
- **Sliders**: Right-hand sliders limit displayed paths/activities to the most frequent ones in the current (or compared) selection.
- **Tooltips**: Hover nodes/edges to see labels; edge colors encode direction of change when comparing two brushes.

## Data & Structure
- `vis-system/index.js` orchestrates data loading, brushing state, filtering, and redraws.
- `vis-system/dfg/main-dfg.js` renders the directly-follows graph and computes node/edge diffs.
- `vis-system/linechart/multiple-bushes.js` draws the timeline, glyphs, and handles brush interactions.
- CSV inputs live in `vis-system/data/`; swap them with your own log-derived matrices to explore different processes.

## Screenshot
Place the provided screenshot at `docs/screenshot.png` (create the `docs/` folder if it does not exist) so it appears in the README. You can export your own by taking a browser screenshot and saving it to that path.

## Live Demo (optional)
You can host the static site on GitHub Pages:
1. Push the repo to GitHub.
2. Enable Pages in repository settings with the `vis-system` folder (or root) as the source.
3. Visit the published URL to interact with the visualization without local setup.

## Relationship to Prior Work
Built as an evolution of [Process-Change-Exploration-Visualizations](https://github.com/yesanton/Process-Change-Exploration-Visualizations), adding more robust normalization, dual brushing, and UI refinements for drift/version exploration.

## How to Share
- Commit and push your changes:
  ```bash
  git add .
  git commit -m "Add docs and annotate visualization code"
  git push origin main
  ```
- If you enable GitHub Pages, update the README with the live link.

## Notes
- For custom datasets, keep the matrix/timestamp schemas aligned with the existing CSVs.
- The app is static: no build step required; any static web host will work.
