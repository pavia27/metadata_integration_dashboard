# Dashboard for integrating metadata and genomics

An interactive, client‑side dashboard for exploring sequence data and analyzing metadata. 

---

## Table of Contents
- [Getting Started](#getting-started)
- [Usage](#usage)
  - [1) Upload Your Data](#1-upload-your-data)
  - [2) Phylogenetic Tree Panel](#2-phylogenetic-tree-panel)
  - [3) Chart Panel](#3-chart-panel)
  - [4) Heatmap Panel](#4-heatmap-panel)
  - [5) Utilities](#5-utilities)
- [Data Formats](#data-formats)
- [Development Notes](#development-notes)
- [Troubleshooting](#troubleshooting)
- [License](#license)
  
---

## Getting Started

1. Download or clone this project.
2. Open **`dashboard.html`** in a modern browser (tested on Chrome and Safari).
3. (Optional) Serve locally for best results with file access:
   - Python: `python -m http.server 8000`
   - Node: `npx http-server -p 8000`
   - Then visit `http://localhost:8000/dashboard.html`

---

## Usage

### 1) Upload Your Data
- In the **Upload** section:
  - **Sequence Data (.csv):** choose your CSV file.
  - **Phylogenetic Tree (.tree):** choose your Newick/plain text tree file.
- Click **Load Dashboard**.

### 2) Phylogenetic Tree Panel
Controls in the panel header:
- **Layout:** `Radial` or `Rectangular`
- **Scale branch lengths:** toggle on/off
- **Colour by:** choose a metadata column

### 3) Chart Panel
Controls in the panel header:
- **Mode:** `Pyramid` or `Scatter`
- **X‑axis** / **Y‑axis**
- **Colour**
- **Shape** (scatter only)

### 4) Heatmap Panel
- **Color Scheme:** choose a palette (e.g., `Viridis`, `Inferno`)
- Displays **metadata availability by PMID**

### 5) Utilities
- **Search box (top‑left):** enter PMIDs or accessions, comma‑separated.
- **Export CSV:** download the current/filtered data to CSV.

---

## Data Formats

### CSV (`.csv`)
- Must be a standard, comma‑delimited file with a header row.
- Include any columns you want to analyze (e.g., PMIDs, accessions, dates, clades, etc.).
- The **Colour by**, **X**, **Y**, and **Shape** controls will list columns detected in your CSV.

### Tree (`.tree` / `.txt`)
- Newick format is recommended. Plain text variants are accepted if parseable.
- Node names should (ideally) correspond to identifiers present in your CSV so the views can link data to tree tips.

> Tip: Use the provided **`dummy_metadata.csv`** and **`dummy_tree.tree`** to verify your environment before using real data.
  Confirm that tip labels in the `.tree` file match IDs present in the CSV.

