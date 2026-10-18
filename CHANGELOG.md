# Changelog

## Unreleased

- Fixed Python `from package.module import names` resolution so absolute imports find local modules across src-layout and flat packages

## 0.0.8

- Added Dead Code Detection — marks files with zero incoming dependencies (excluding entry points) and orphan files with no connections
- Added Circular Dependency Detection using Tarjan's SCC algorithm with visual indicator and list view
- Added Hotspot Analysis — scores every file by imports, dependents, and size; classifies as low/medium/high/critical
- Added Project Health Score — aggregated metric (0–100) based on dead files, circular groups, and critical hotspots
- Added View Mode toggle with Normal, Hotspots (color by risk level), and Dead Code (highlight unused files)
- Added Health tab in side panel with dead files list, circular dependencies, top hotspots, and health score ring
- Added warning banner for unused files
- Added hotspot score display in node detail panel

## 0.0.7

- Improved graph filtering and legend clarity with real extension-level labels like `.js`, `.ts`, and `.tsx`
- Added collaboration status and impact insight cards in the file details sidebar to surface shared, isolated, and high-impact files faster
- Removed preview manifest mode and prepared the extension metadata for a public Marketplace release

## 0.0.6

- Added a guided screenshot walkthrough in the README using real `media/preview` images
- Renamed preview assets to clean filenames so packaging and README references stay stable
- Repackaged the extension so the latest Marketplace/VS Code details page shows the updated preview content

## 0.0.5

- Added a saved `.codeatlas/project-index.json` file with per-file summaries, symbols, and dependency metadata for AI-friendly context reuse
- Improved graph readability for larger workspaces with smarter initial layouts, reduced label clutter, and clearer graph guidance in the webview
- Updated default exclude patterns to skip common generated folders like `venv`, `__pycache__`, `node_modules`, `.git`, `dist`, and `build`

## 0.0.4

- Updated default exclude patterns to skip common generated folders like `venv`, `__pycache__`, `node_modules`, `.git`, `dist`, and `build`
- Improved graph readability for larger workspaces with smarter initial layouts and reduced label clutter
- Added a clearer graph summary and guidance in the webview side panel
- Added a saved `.codeatlas/project-index.json` file with per-file summaries, symbols, and dependency metadata for AI-friendly context reuse

## 0.0.3

- Fixed the webview runtime error affecting graph opening
- Finalized packaging configuration for public release

## 0.0.2

- Updated extension branding to CodeAtlas
- Improved Marketplace metadata, README content, and packaging setup
- Polished manifest details for publishing

## 0.0.1

- Initial preview release
- Added workspace analysis for code dependency graphs
- Added interactive webview with multiple layouts and file exploration
- Added commands for opening and refreshing the project graph
