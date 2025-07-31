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
  allSequences: [],
  sequences: [],
  papers: [],
  tree: dummyTree,
  activePanel: null,
  filters: {},
  descriptors: [],
  descriptorInfo: {}
};

/* ─── Utility Helpers ──────────────────────────────────────────────────── */
const unique = arr => [...new Set(arr)];
const hash = str => str ? Array.from(String(str)).reduce((h, c) => h + c.charCodeAt(0), 0) : 0;

/**
 * Analyzes each data column to determine if it's numerical or categorical.
 */
function analyzeDescriptors() {
  state.descriptors.forEach(key => {
    const values = state.allSequences
      .map(s => s.descriptors[key])
      .filter(v => v !== null && v !== undefined && String(v).trim() !== '' && String(v).toUpperCase() !== 'NA');

    if (values.length === 0) {
      state.descriptorInfo[key] = { type: 'categorical', domain: [] };
      return;
    }

    let numericCount = 0;
    values.forEach(v => {
      if (!isNaN(parseFloat(v)) && isFinite(v)) {
        numericCount++;
      }
    });

    const uniqueValues = unique(values);
    const isNumerical = (numericCount / values.length > 0.8) && uniqueValues.length > 6;
    const type = isNumerical ? 'numerical' : 'categorical';

    state.descriptorInfo[key] = {
      type,
      domain: type === 'numerical' ? d3.extent(values.map(v => +v)) : uniqueValues.sort()
    };
  });
}

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
  // Global filter
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

/* ─── Chart Panel ─────────────────────────────────────────── */

function drawChart() {
  const svg = d3.select("#chartSvg");
  svg.selectAll("*").remove();
  
  const mode = document.querySelector("input[name='chartMode']:checked").value;
  const xDesc = document.getElementById("chartX").value;
  const yDesc = document.getElementById("chartY").value;
  const colourDesc = document.getElementById("chartColour").value;
  const shapeDesc = document.getElementById("chartShape").value;

  const xInfo = state.descriptorInfo[xDesc];
  const yInfo = state.descriptorInfo[yDesc];
  const shapeInfo = state.descriptorInfo[shapeDesc];

  if (!xInfo || !yInfo || !shapeInfo) return;

  if (mode === 'pyramid') {
    drawPyramidChart(svg, xDesc, yDesc, xInfo, yInfo);
  } else {
    drawScatterPlot(svg, xDesc, yDesc, xInfo, yInfo, colourDesc, shapeDesc, shapeInfo);
  }
}

function drawScatterPlot(svg, xDesc, yDesc, xInfo, yInfo, colourDesc, shapeDesc, shapeInfo) {
  const { width, height } = svg.node().getBoundingClientRect();
  // Increase right margin to make space for legends
  const margin = { top: 40, right: 200, bottom: 50, left: 60 };
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;
  
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = xInfo.type === 'numerical'
    ? d3.scaleLinear().domain(xInfo.domain).nice().range([0, graphWidth])
    : d3.scalePoint().domain(xInfo.domain).range([0, graphWidth]).padding(0.5);

  const yScale = yInfo.type === 'numerical'
    ? d3.scaleLinear().domain(yInfo.domain).nice().range([graphHeight, 0])
    : d3.scalePoint().domain(yInfo.domain).range([graphHeight, 0]).padding(0.5);
  
  // Create scales for shape and a symbol generator
  const shapeScale = d3.scaleOrdinal(d3.symbols).domain(shapeInfo.domain);
  const symbolGenerator = d3.symbol().size(180); // Increased point size

  g.append("g").attr("transform", `translate(0,${graphHeight})`).call(d3.axisBottom(xScale));
  g.append("g").call(d3.axisLeft(yScale));

  const plotData = state.sequences.filter(d => {
    const xVal = d.descriptors[xDesc];
    const yVal = d.descriptors[yDesc];
    const shapeVal = d.descriptors[shapeDesc];
    return xVal !== null && xVal !== undefined && String(xVal).toUpperCase() !== 'NA' &&
           yVal !== null && yVal !== undefined && String(yVal).toUpperCase() !== 'NA' &&
           shapeVal !== null && shapeVal !== undefined && String(shapeVal).toUpperCase() !== 'NA';
  });

  // Draw points using paths for shapes
  g.selectAll(".point")
    .data(plotData)
    .enter().append("path")
      .attr("class", "point")
      .attr("transform", d => `translate(${xScale(d.descriptors[xDesc])},${yScale(d.descriptors[yDesc])})`)
      .attr("d", d => symbolGenerator.type(shapeScale(d.descriptors[shapeDesc]))())
      .attr("fill", d => d3.schemeTableau10[hash(d.descriptors[colourDesc]) % 10])
      .attr("opacity", 0.8)
      .append("title").text(d => `${d.accession}\n${xDesc}: ${d.descriptors[xDesc]}\n${yDesc}: ${d.descriptors[yDesc]}\n${shapeDesc}: ${d.descriptors[shapeDesc]}`);

  // --- Add Legends ---
  
  // Color Legend
  const colorDomain = state.descriptorInfo[colourDesc].domain;
  const colorLegend = g.append("g")
    .attr("transform", `translate(${graphWidth + 30}, 0)`);
  
  colorLegend.append("text").text(colourDesc).attr("font-weight", "bold");
  
  const colorItems = colorLegend.selectAll(".color-item")
    .data(colorDomain)
    .enter().append("g")
    .attr("transform", (d, i) => `translate(0, ${25 * (i + 1)})`);

  colorItems.append("rect")
    .attr("width", 15).attr("height", 15)
    .attr("fill", d => d3.schemeTableau10[hash(d) % 10]);
  
  colorItems.append("text").text(d => d).attr("x", 20).attr("y", 12.5);

  // Shape Legend
  const shapeDomain = shapeInfo.domain;
  const shapeLegendY = 25 * (colorDomain.length + 2); // Position below color legend
  const shapeLegend = g.append("g")
    .attr("transform", `translate(${graphWidth + 30}, ${shapeLegendY})`);
    
  shapeLegend.append("text").text(shapeDesc).attr("font-weight", "bold");

  const shapeItems = shapeLegend.selectAll(".shape-item")
    .data(shapeDomain)
    .enter().append("g")
    .attr("transform", (d, i) => `translate(10, ${25 * (i + 1)})`);

  shapeItems.append("path")
    .attr("d", d => d3.symbol(shapeScale(d), 120)())
    .attr("fill", "#555");

  shapeItems.append("text").text(d => d).attr("x", 20).attr("y", 5);
}

function drawPyramidChart(svg, xDesc, yDesc, xInfo, yInfo) {
  if (xInfo.type !== 'categorical' || yInfo.type !== 'categorical') {
    svg.append("text").attr("x", "50%").attr("y", "50%").attr("text-anchor", "middle")
      .text("Pyramid plot requires categorical data for both X and Y axes.");
    return;
  }
  
  const { width, height } = svg.node().getBoundingClientRect();
  const margin = { top: 40, right: 20, bottom: 40, left: 20 };
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;

  const counts = d3.rollup(state.sequences, v => v.length, d => d.descriptors[xDesc], d => d.descriptors[yDesc]);
  
  const xCategories = xInfo.domain;
  const yCategories = yInfo.domain;
  
  const [xCat1, xCat2] = xCategories;

  let maxCount = 0;
  yCategories.forEach(yCat => {
    const count1 = counts.get(xCat1)?.get(yCat) || 0;
    const count2 = counts.get(xCat2)?.get(yCat) || 0;
    maxCount = Math.max(maxCount, count1, count2);
  });
  
  const xScale = d3.scaleLinear().domain([-maxCount, maxCount]).range([0, graphWidth]);
  const yScale = d3.scaleBand().domain(yCategories).range([0, graphHeight]).padding(0.2);

  const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

  g.selectAll(".bar-left")
    .data(yCategories)
    .enter().append("rect")
      .attr("class", "bar-left")
      .attr("x", d => xScale(-(counts.get(xCat1)?.get(d) || 0)))
      .attr("y", d => yScale(d))
      .attr("width", d => xScale(0) - xScale(-(counts.get(xCat1)?.get(d) || 0)))
      .attr("height", yScale.bandwidth())
      .attr("fill", "#4c78a8");

  g.selectAll(".bar-right")
    .data(yCategories)
    .enter().append("rect")
      .attr("class", "bar-right")
      .attr("x", xScale(0))
      .attr("y", d => yScale(d))
      .attr("width", d => xScale(counts.get(xCat2)?.get(d) || 0) - xScale(0))
      .attr("height", yScale.bandwidth())
      .attr("fill", "#69b3a2");

  const centerLineX = xScale(0);
  g.append("g").call(d3.axisLeft(yScale).tickSize(0))
    .attr("transform", `translate(${centerLineX}, 0)`)
    .select(".domain").remove();
  
  g.selectAll(".tick text").attr("x", 0).attr("text-anchor", "middle");
  
  g.append("text").attr("x", xScale(-maxCount / 2)).attr("y", -10).text(xCat1).attr("text-anchor", "middle");
  g.append("text").attr("x", xScale(maxCount / 2)).attr("y", -10).text(xCat2).attr("text-anchor", "middle");
}

/* ─── Heat Map Panel ──────────────────────────────────────────────────── */
function drawHeat () {
  const svg = d3.select("#heatSvg");
  svg.selectAll("*").remove();
  const { width, height } = svg.node().getBoundingClientRect();
  
  const margin = { top: 40, right: 20, bottom: 180, left: 150 }; 
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;

  const y_elements = state.descriptors;
  const x_elements = unique(state.sequences.map(s => s.pmid));

  if (!y_elements.length || !x_elements.length) return;
  
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(x_elements)
    .range([0, graphWidth])
    .padding(0.05);

  const y = d3.scaleBand()
    .domain(y_elements)
    .range([0, graphHeight])
    .padding(0.05);

  const colourScheme = document.getElementById("heatColour").value;
  const colour = d3.scaleSequential(d3[colourScheme]).domain([0, 1]);

  g.append("g")
    .attr("transform", `translate(0,${graphHeight})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
      .attr("transform", "translate(-10,0)rotate(-45)")
      .style("text-anchor", "end")
      .style("font-size", "14px");

  g.append("g")
    .call(d3.axisLeft(y))
    .selectAll("text")
      .style("font-size", "14px");

  x_elements.forEach(pmid => {
    y_elements.forEach(descriptor => {
      const seqs = state.sequences.filter(s => s.pmid === pmid);
      
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

  const legend = g.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(0, ${graphHeight + 120})`);

  const legendData = [
    { value: 1, label: "Present (Data Available)" },
    { value: 0, label: "Absent (NA or Missing)" }
  ];

  const legendItems = legend.selectAll(".legend-item")
    .data(legendData)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(${i * 250}, 0)`);

  legendItems.append("rect")
    .attr("width", 18)
    .attr("height", 18)
    .attr("fill", d => colour(d.value));

  legendItems.append("text")
    .attr("x", 24)
    .attr("y", 9)
    .text(d => d.label)
    .style("font-size", "16px")
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
      state.sequences = [...state.allSequences];
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

    state.sequences = [...state.allSequences];
    state.papers = unique(raw.map(d => d.pmid)).map(pmid => ({ pmid }));

    analyzeDescriptors();
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