/* app.js (CSV‑driven) */
/* eslint-env browser */
/* global d3 */

/* ─── Dummy Tree (keep for now) ───────────────────────────────────────── */
const dummyTree = {
  name: "root",
  children: [
    { name: "ACC001" },
    { name: "ACC002" },
    {
      name: "clade-X",
      children: [
        { name: "ACC003" },
        { name: "ACC004" }
      ]
    }
  ]
};

/* ─── Global State ─────────────────────────────────────────────────────── */
const state = {
  allSequences: [],   // Master list of all sequences, does not change after load
  sequences: [],      // Populated from CSV, can be filtered by user actions
  papers: [],         // Derived from sequences
  tree: dummyTree,
  activePanel: null,
  filters: {},
  descriptors: []     // Populated from CSV header
};

/* ─── Utility Helpers ──────────────────────────────────────────────────── */
const unique = arr => [...new Set(arr)];
const hash = str => str ? Array.from(String(str)).reduce((h, c) => h + c.charCodeAt(0), 0) : 0;

/* CSV export of filtered sequences */
function exportCSV () {
  const rows = [["accession", "pmid", ...state.descriptors]];
  state.sequences.forEach(s => {
    const d = state.descriptors.map(k => s.descriptors[k]);
    rows.push([s.accession, s.pmid, ...d]);
  });
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "filtered_sequences.csv";
  a.click();
}

/* ─── Intersection Observer for Scroll‑activation ─────────────────────── */
function createObserver () {
  const panels = document.querySelectorAll(".panel");
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        panels.forEach(p => p.classList.remove("active"));
        e.target.classList.add("active");
        state.activePanel = e.target.id;
      }
    });
  }, { threshold: 0.5 });
  panels.forEach(p => obs.observe(p));
}

/* ─── Controls Population ─────────────────────────────────────────────── */
function populateControls () {
  // Global filter ‑ just list descriptor keys for now
  const gf = document.getElementById("globalFilter");
  state.descriptors.forEach(d => gf.add(new Option(d, d)));

  // Tree controls
  ["treeColour", "treeSize", "treeShape"].forEach(id => {
    const sel = document.getElementById(id);
    state.descriptors.forEach(d => sel.add(new Option(d, d)));
  });

  // Chart controls
  ["chartX", "chartY", "chartColour", "chartShape"].forEach(id => {
    const sel = document.getElementById(id);
    state.descriptors.forEach(d => sel.add(new Option(d, d)));
  });
}

/* ─── Tree Rendering ──────────────────────────────────────────────────── */
function drawTree () {
  const svg = d3.select("#treeSvg");
  svg.selectAll("*").remove();
  const { width, height } = svg.node().getBoundingClientRect();
  const layoutType = document.getElementById("treeLayout").value;

  const root = d3.hierarchy(state.tree);
  let treeLayout = d3.cluster().size([height - 40, width - 160]);
  if (layoutType === "radial" || layoutType === "unrooted") {
    treeLayout = d3.cluster().size([2 * Math.PI, height / 2 - 40]);
  }
  treeLayout(root);

  const g = svg.append("g")
    .attr("transform", layoutType === "rectangular" ?
      `translate(80,20)` :
      `translate(${width / 2},${height / 2})`);

  // links
  const link = d3.linkHorizontal()
    .x(d => layoutType === "rectangular" ? d.y : Math.cos(d.x) * d.y)
    .y(d => layoutType === "rectangular" ? d.x : Math.sin(d.x) * d.y);

  g.selectAll(".link")
    .data(root.links())
    .enter().append("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", "#999")
      .attr("d", link);

  // nodes
  const nodes = g.selectAll(".node")
    .data(root.descendants())
    .enter().append("g")
      .attr("class", "node")
      .attr("transform", d => layoutType === "rectangular" ?
        `translate(${d.y},${d.x})` :
        `translate(${Math.cos(d.x) * d.y},${Math.sin(d.x) * d.y})`);

  const colourDesc = document.getElementById("treeColour").value;
  const sizeDesc = document.getElementById("treeSize").value;

  const numericVals = state.sequences.map(s => +s.descriptors[sizeDesc]).filter(v => !isNaN(v));
  const sizeScale = d3.scaleLinear()
    .domain(numericVals.length ? d3.extent(numericVals) : [1, 10])
    .range([3, 8]);

  nodes.append("circle")
    .attr("r", d => {
      const seq = state.sequences.find(s => s.accession === d.data.name);
      const val = seq ? +seq.descriptors[sizeDesc] : 1;
      return sizeScale(isNaN(val) ? 1 : val);
    })
    .attr("fill", d => {
      const seq = state.sequences.find(s => s.accession === d.data.name);
      const key = seq ? seq.descriptors[colourDesc] : null;
      return key ? d3.schemeTableau10[hash(key) % 10] : "#555";
    })
    .append("title")
      .text(d => d.data.name);
}

/* ─── Chart Panel ─────────────────────────────────────────────────────── */
function drawChart () {
  const svg = d3.select("#chartSvg");
  svg.selectAll("*").remove();
  const { width, height } = svg.node().getBoundingClientRect();
  const mode = document.querySelector("input[name='chartMode']:checked").value;
  const xDesc = document.getElementById("chartX").value;
  const yDesc = document.getElementById("chartY").value;
  const colourDesc = document.getElementById("chartColour").value;

  if (mode === "pyramid") {
    /* ── Histogram Pyramid ─ */
    const vals = state.sequences.map(s => +s.descriptors[xDesc]).filter(v => !isNaN(v));
    const bins = d3.bin().thresholds(10)(vals);

    const y = d3.scaleBand()
      .domain(bins.map(b => b.x0))
      .range([0, height])
      .padding(0.1);
    const x = d3.scaleLinear()
      .domain([0, d3.max(bins, b => b.length)])
      .range([0, width / 2 - 40]);

    const g = svg.append("g").attr("transform", `translate(${width / 2},0)`);

    // right side
    g.selectAll(".barR")
      .data(bins)
      .enter().append("rect")
        .attr("x", 0)
        .attr("y", b => y(b.x0))
        .attr("width", b => x(b.length))
        .attr("height", y.bandwidth())
        .attr("fill", "#69b3a2");

    // left side (mirror)
    g.selectAll(".barL")
      .data(bins)
      .enter().append("rect")
        .attr("x", b => -x(b.length))
        .attr("y", b => y(b.x0))
        .attr("width", b => x(b.length))
        .attr("height", y.bandwidth())
        .attr("fill", "#4c78a8");
  } else {
    /* ── Scatter Plot ─ */
    const xVals = state.sequences.map(s => +s.descriptors[xDesc]).filter(v => !isNaN(v));
    const yVals = state.sequences.map(s => +s.descriptors[yDesc]).filter(v => !isNaN(v));
    if (!xVals.length || !yVals.length) return;

    const x = d3.scaleLinear()
      .domain(d3.extent(xVals)).nice()
      .range([40, width - 20]);
    const y = d3.scaleLinear()
      .domain(d3.extent(yVals)).nice()
      .range([height - 30, 20]);

    svg.append("g")
      .attr("transform", `translate(0,${height - 30})`)
      .call(d3.axisBottom(x));
    svg.append("g")
      .attr("transform", `translate(40,0)`)
      .call(d3.axisLeft(y));

    svg.selectAll("circle")
      .data(state.sequences)
      .enter().append("circle")
        .attr("cx", d => x(+d.descriptors[xDesc]))
        .attr("cy", d => y(+d.descriptors[yDesc]))
        .attr("r", 5)
        .attr("fill", d => d3.schemeTableau10[hash(d.descriptors[colourDesc]) % 10])
        .append("title").text(d => d.accession);
  }
}

/* ─── Heat Map Panel (UPDATED with Legend) ────────────────────────────── */
function drawHeat () {
  const svg = d3.select("#heatSvg");
  svg.selectAll("*").remove();
  const { width, height } = svg.node().getBoundingClientRect();
  const margin = { top: 20, right: 20, bottom: 160, left: 120 }; // Increased bottom margin for legend
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;

  // Y-axis: all descriptor columns. X-axis: unique paper PMIDs.
  const y_elements = state.descriptors;
  const x_elements = unique(state.sequences.map(s => s.pmid));

  if (!y_elements.length || !x_elements.length) return;
  
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // X Scale (PMIDs)
  const x = d3.scaleBand()
    .domain(x_elements)
    .range([0, graphWidth])
    .padding(0.05);

  // Y Scale (Descriptors)
  const y = d3.scaleBand()
    .domain(y_elements)
    .range([0, graphHeight])
    .padding(0.05);

  // Colour Scale from selector
  const colourScheme = document.getElementById("heatColour").value;
  const colour = d3.scaleSequential(d3[colourScheme]).domain([0, 1]);

  // X Axis
  g.append("g")
    .attr("transform", `translate(0,${graphHeight})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
      .attr("transform", "translate(-10,0)rotate(-45)")
      .style("text-anchor", "end");

  // Y Axis
  g.append("g").call(d3.axisLeft(y));

  // Draw heatmap rectangles
  x_elements.forEach(pmid => {
    y_elements.forEach(descriptor => {
      // Get all sequences associated with the current pmid
      const seqs = state.sequences.filter(s => s.pmid === pmid);
      
      // Presence/Absence: "present" if at least one sequence has a non-'NA' value.
      const isPresent = seqs.some(s => {
        const val = s.descriptors[descriptor];
        if (val === null || val === undefined) return false;
        const stringVal = String(val).trim();
        return stringVal !== '' && stringVal.toUpperCase() !== 'NA';
      });
      
      const value = isPresent ? 1 : 0;

      g.append("rect")
        .attr("x", x(pmid))
        .attr("y", y(descriptor))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("fill", colour(value))
        .on("mouseover", function () { d3.select(this).attr("stroke", "#000"); })
        .on("mouseout", function () { d3.select(this).attr("stroke", null); })
        .append("title")
          .text(`${pmid} – ${descriptor}: ${value ? "present" : "absent"}`);
    });
  });

  // Add Legend at the bottom
  const legend = g.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(0, ${graphHeight + 100})`); // Position below x-axis

  const legendData = [
    { value: 1, label: "Present (Data Available)" },
    { value: 0, label: "Absent (NA or Missing)" }
  ];

  const legendItems = legend.selectAll(".legend-item")
    .data(legendData)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(${i * 220}, 0)`); // Space out legend items

  legendItems.append("rect")
    .attr("width", 18)
    .attr("height", 18)
    .attr("fill", d => colour(d.value));

  legendItems.append("text")
    .attr("x", 24)
    .attr("y", 14)
    .text(d => d.label)
    .style("font-size", "14px")
    .attr("alignment-baseline", "middle");
}

/* ─── Event Binding ───────────────────────────────────────────────────── */
function bindEvents () {
  document.getElementById("exportCSV").addEventListener("click", exportCSV);

  // Tree controls
  ["treeColour", "treeSize", "treeShape", "treeLayout"].forEach(id => {
    document.getElementById(id).addEventListener("change", drawTree);
  });

  // Chart controls
  ["chartX", "chartY", "chartColour", "chartShape"].forEach(id => {
    document.getElementById(id).addEventListener("change", drawChart);
  });
  document.querySelectorAll("input[name='chartMode']").forEach(r => r.addEventListener("change", drawChart));

  // Heatmap controls
  document.getElementById("heatColour").addEventListener("change", drawHeat);

  // Search
  document.getElementById("searchBox").addEventListener("input", e => {
    const tokens = e.target.value.split(",").map(t => t.trim().toUpperCase()).filter(Boolean);
    
    if (tokens.length === 0) {
      state.sequences = [...state.allSequences]; // Reset to all sequences if search is empty
    } else {
      state.sequences = state.allSequences.filter(s => 
        tokens.includes(s.accession.toUpperCase()) || 
        (s.pmid && tokens.includes(s.pmid.toUpperCase()))
      );
    }
    
    drawTree();
    drawChart();
    drawHeat();
  });
}

/* ─── Data Loading & Bootstrapping ────────────────────────────────────── */
function loadData () {
  /* Provide a CSV named "sequences.csv" in /data or root folder.
     Expected columns: accession,pmid,<descriptor1>,<descriptor2>,...
  */
  d3.csv("sequences.csv").then(raw => {
    if (!raw.length) throw new Error("CSV empty or not found");

    state.descriptors = Object.keys(raw[0]).filter(k => !["pmid","accession"].includes(k));

    state.allSequences = raw.map(d => ({
      accession: d.accession,
      pmid: d.pmid, 
      descriptors: Object.fromEntries(Object.entries(d)
        .filter(([k]) => !["pmid","accession"].includes(k))
        .map(([k, v]) => {
          const num = +v;
          return [k, isNaN(num) ? v : num];
        }))
    }));

    // Initially, the filtered list is the same as the master list
    state.sequences = [...state.allSequences];
    
    state.papers = unique(raw.map(d => d.pmid)).map(pmid => ({ pmid }));

    populateControls();
    createObserver();
    bindEvents();
    drawTree();
    drawChart();
    drawHeat();
  }).catch(err => {
    console.error(err);
    alert("Failed to load sequences.csv. Check console for details.");
  });
}

window.addEventListener("DOMContentLoaded", loadData);