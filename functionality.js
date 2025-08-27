const state = {
  allSequences: [],
  sequences: [],
  papers: [],
  tree: null,
  activePanel: null,
  filters: {},
  descriptors: [],
  descriptorInfo: {}
};

/**
 * @param {Array} arr
 * @returns {Array}
 */
const unique = arr => [...new Set(arr)];

/**
 * @param {string} str - The input string.
 * @returns {number} A numeric hash of the string.
 */
const hash = str => str ? Array.from(String(str)).reduce((h, c) => h + c.charCodeAt(0), 0) : 0;

/**
 * @param {string} newick - The Newick string.
 * @returns {object} A hierarchical object representing the tree.
 */
function parseNewick(newick) {
  let pos = 0;

  function parseNameAndLength() {
    let name = '';
    let lengthStr = '';
    let readingName = true;
    while (pos < newick.length && newick[pos] !== ',' && newick[pos] !== ')' && newick[pos] !== ';') {
      if (newick[pos] === ':') {
        readingName = false;
      } else {
        if (readingName) {
          name += newick[pos];
        } else {
          lengthStr += newick[pos];
        }
      }
      pos++;
    }
    return {
      name: name.trim() || undefined,
      length: parseFloat(lengthStr) || 0
    };
  }

  function parseSubtree() {
    if (newick[pos] === '(') {
      pos++;
      const children = [];
      while (newick[pos] !== ')') {
        children.push(parseSubtree());
        if (newick[pos] === ',') {
          pos++;
        }
      }
      pos++;
      const node = {
        branchset: children
      };
      const {
        name,
        length
      } = parseNameAndLength();
      if (name) node.name = name;
      if (length) node.length = length;
      return node;
    }
    else {
      const {
        name,
        length
      } = parseNameAndLength();
      return {
        name: name || 'internal',
        length: length
      };
    }
  }

  const trimmedNewick = newick.trim().endsWith(';') ? newick.trim().slice(0, -1) : newick.trim();
  return parseSubtree(trimmedNewick);
}

function analyzeDescriptors() {
  state.descriptors.forEach(key => {
    const values = state.allSequences
      .map(s => s.descriptors[key])
      .filter(v => v !== null && v !== undefined && String(v).trim() !== '' && String(v).toUpperCase() !== 'NA');

    if (values.length === 0) {
      state.descriptorInfo[key] = {
        type: 'categorical',
        domain: []
      };
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

function exportCSV() {
  const rows = [
    ["accession", "pmid", ...state.descriptors]
  ];
  state.sequences.forEach(s => {
    const descriptorValues = state.descriptors.map(k => s.descriptors[k]);
    rows.push([s.accession, s.pmid, ...descriptorValues]);
  });

  const csvContent = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csvContent], {
    type: "text/csv"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "filtered_sequences.csv";
  link.click();
}

function createObserver() {
  const panels = document.querySelectorAll(".panel");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        panels.forEach(p => p.classList.remove("active"));
        entry.target.classList.add("active");
        state.activePanel = entry.target.id;
      }
    });
  }, {
    threshold: 0.5
  });
  panels.forEach(panel => observer.observe(panel));
}

function populateControls() {
  const treeColourSelect = document.getElementById("treeColour");
  if (treeColourSelect) {
    treeColourSelect.innerHTML = '<option value="--none--">None</option>';
    state.descriptors.forEach(d => treeColourSelect.add(new Option(d, d)));
  }

  const chartSelects = ["chartX", "chartY", "chartColour", "chartShape"];
  chartSelects.forEach(id => {
    const selectElement = document.getElementById(id);
    state.descriptors.forEach(d => selectElement.add(new Option(d, d)));
  });
}

function drawTree() {
  const svg = d3.select("#treeSvg");
  svg.selectAll("*").remove();
  if (!state.tree) return;

  const layoutType = document.getElementById("treeLayout").value;
  const {
    width,
    height
  } = svg.node().getBoundingClientRect();

  const root = d3.hierarchy(state.tree, d => d.branchset)
    .sum(d => (d.branchset ? 0 : 1))
    .sort((a, b) => (a.value - b.value) || d3.ascending(a.data.length, b.data.length));

  const colorDesc = document.getElementById("treeColour").value;
  const colorInfo = state.descriptorInfo[colorDesc];
  const colorScale = (colorInfo && colorInfo.type === 'categorical') ?
    d3.scaleOrdinal(d3.schemeTableau10).domain(colorInfo.domain) :
    () => "#ccc";

  root.leaves().forEach(leaf => {
    const seq = state.sequences.find(s => s.accession === leaf.data.name);
    leaf.color = (seq && colorInfo) ? colorScale(seq.descriptors[colorDesc]) : "#ccc";
  });

  root.eachAfter(node => {
    if (!node.children) return;
    const firstChildColor = node.children[0].color;
    node.color = node.children.every(c => c.color === firstChildColor) ? firstChildColor : "#ccc";
  });

  if (layoutType === 'rectangular') {
    drawRectangularTree(svg, root, width, height, colorDesc, colorInfo, colorScale);
  } else {
    drawRadialTree(svg, root, width, height, colorDesc, colorInfo, colorScale);
  }
}

function drawRectangularTree(svg, root, width, height, colorDesc, colorInfo, colorScale) {
  const margin = {
    top: 20,
    right: 150,
    bottom: 20,
    left: 40
  };
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;

  const cluster = d3.cluster().size([graphHeight, graphWidth]);
  cluster(root);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .attr("fill", "none")
    .attr("stroke", "#555")
    .attr("stroke-width", 1.5)
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr("d", d => `M${d.source.y},${d.source.x} L${d.target.y},${d.target.x}`)
    .attr("stroke", d => d.target.color);

  const node = g.append("g")
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", d => `translate(${d.y},${d.x})`);

  node.append("circle")
    .attr("r", 3)
    .attr("fill", d => d.color)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1);

  g.append("g")
    .selectAll("text")
    .data(root.leaves())
    .join("text")
    .attr("transform", d => `translate(${d.y},${d.x})`)
    .attr("x", 5)
    .attr("dy", "0.32em")
    .text(d => d.data.name.replace(/_/g, " "))
    .attr("font-family", "sans-serif")
    .attr("font-size", 10)
    .attr("text-anchor", "start");

  if (colorInfo && colorInfo.type === 'categorical' && colorInfo.domain.length) {
    const legend = g.append("g").attr("class", "legend").attr("transform", `translate(20, 20)`);
    legend.append("text").text(colorDesc).attr("font-weight", "bold").attr("dy", -5);
    const legendItems = legend.selectAll(".legend-item").data(colorInfo.domain).join("g").attr("transform", (d, i) => `translate(0, ${i * 20})`);
    legendItems.append("rect").attr("width", 15).attr("height", 15).attr("fill", colorScale);
    legendItems.append("text").text(d => d).attr("x", 20).attr("y", 12.5).style("font-size", "12px");
  }
}

function drawRadialTree(svg, root, width, height, colorDesc, colorInfo, colorScale) {
  const outerRadius = Math.min(width, height) / 2 - 100;
  const innerRadius = outerRadius - 120;

  const cluster = d3.cluster()
    .size([360, innerRadius > 0 ? innerRadius : outerRadius / 1.5])
    .separation(() => 1);
  cluster(root);

  let maxLen = 0;
  root.each(d => {
    if (d.data.length > maxLen) maxLen = d.data.length;
  });

  function setRadius(d, y0, k) {
    d.radius = y0 + d.data.length * k;
    if (d.children) {
      d.children.forEach(child => setRadius(child, d.radius, k));
    }
  }
  setRadius(root, 0, (innerRadius > 0 ? innerRadius : outerRadius / 1.5) / maxLen);

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`)
    .attr("font-family", "sans-serif")
    .attr("font-size", 10);

  const linkConstant = d3.linkRadial().angle(d => d.x * Math.PI / 180).radius(d => d.y);
  const linkVariable = d3.linkRadial().angle(d => d.x * Math.PI / 180).radius(d => d.radius);

  const link = g.append("g")
    .attr("fill", "none")
    .attr("stroke", "#000")
    .selectAll("path")
    .data(root.links())
    .join("path")
    .each(function(d) {
      d.target.linkNode = this;
    })
    .attr("d", linkConstant)
    .attr("stroke", d => d.target.color);

  g.selectAll("text")
    .data(root.leaves())
    .join("text")
    .attr("dy", ".31em")
    .attr("transform", d => `rotate(${d.x - 90}) translate(${(innerRadius > 0 ? innerRadius : outerRadius / 1.5) + 8},0)${d.x > 180 ? " rotate(180)" : ""}`)
    .attr("text-anchor", d => d.x > 180 ? "end" : "start")
    .text(d => d.data.name.replace(/_/g, " "))
    .on("mouseover", mouseovered(true))
    .on("mouseout", mouseovered(false));

  function mouseovered(active) {
    return function(event, d) {
      d3.select(this).classed("label--active", active);
      let current = d;
      while (current.parent) {
        if (current.linkNode) {
          d3.select(current.linkNode).classed("link--active", active).raise();
        }
        current = current.parent;
      }
    };
  }

  function update(checked) {
    const t = d3.transition().duration(750);
    link.transition(t).attr("d", checked ? linkVariable : linkConstant);
  }
  svg.node().update = update;

  const isChecked = document.getElementById("treeBranchLengthToggle").checked;
  update(isChecked);

  if (colorInfo && colorInfo.type === 'categorical' && colorInfo.domain.length) {
    const legend = g.append("g").attr("class", "legend").attr("transform", `translate(${-width / 2 + 20}, ${-height / 2 + 20})`);
    legend.append("text").text(colorDesc).attr("font-weight", "bold").attr("dy", -5);
    const legendItems = legend.selectAll(".legend-item").data(colorInfo.domain).join("g").attr("transform", (d, i) => `translate(0, ${i * 20})`);
    legendItems.append("rect").attr("width", 15).attr("height", 15).attr("fill", colorScale);
    legendItems.append("text").text(d => d).attr("x", 20).attr("y", 12.5).style("font-size", "12px");
  }
}

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
  const {
    width,
    height
  } = svg.node().getBoundingClientRect();
  const margin = {
    top: 40,
    right: 200,
    bottom: 50,
    left: 60
  };
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = xInfo.type === 'numerical' ?
    d3.scaleLinear().domain(xInfo.domain).nice().range([0, graphWidth]) :
    d3.scalePoint().domain(xInfo.domain).range([0, graphWidth]).padding(0.5);

  const yScale = yInfo.type === 'numerical' ?
    d3.scaleLinear().domain(yInfo.domain).nice().range([graphHeight, 0]) :
    d3.scalePoint().domain(yInfo.domain).range([graphHeight, 0]).padding(0.5);

  const shapeScale = d3.scaleOrdinal(d3.symbols).domain(shapeInfo.domain);
  const symbolGenerator = d3.symbol().size(180);

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

  g.selectAll(".point")
    .data(plotData)
    .enter()
    .append("path")
    .attr("class", "point")
    .attr("transform", d => `translate(${xScale(d.descriptors[xDesc])},${yScale(d.descriptors[yDesc])})`)
    .attr("d", d => symbolGenerator.type(shapeScale(d.descriptors[shapeDesc]))())
    .attr("fill", d => d3.schemeTableau10[hash(d.descriptors[colourDesc]) % 10])
    .attr("opacity", 0.8)
    .append("title")
    .text(d => `${d.accession}\n${xDesc}: ${d.descriptors[xDesc]}\n${yDesc}: ${d.descriptors[yDesc]}\n${shapeDesc}: ${d.descriptors[shapeDesc]}`);

  const colorDomain = state.descriptorInfo[colourDesc].domain;
  const colorLegend = g.append("g").attr("transform", `translate(${graphWidth + 30}, 0)`);
  colorLegend.append("text").text(colourDesc).attr("font-weight", "bold");
  const colorItems = colorLegend.selectAll(".color-item").data(colorDomain).enter().append("g").attr("transform", (d, i) => `translate(0, ${25 * (i + 1)})`);
  colorItems.append("rect").attr("width", 15).attr("height", 15).attr("fill", d => d3.schemeTableau10[hash(d) % 10]);
  colorItems.append("text").text(d => d).attr("x", 20).attr("y", 12.5);

  const shapeDomain = shapeInfo.domain;
  const shapeLegendY = 25 * (colorDomain.length + 2);
  const shapeLegend = g.append("g").attr("transform", `translate(${graphWidth + 30}, ${shapeLegendY})`);
  shapeLegend.append("text").text(shapeDesc).attr("font-weight", "bold");
  const shapeItems = shapeLegend.selectAll(".shape-item").data(shapeDomain).enter().append("g").attr("transform", (d, i) => `translate(10, ${25 * (i + 1)})`);
  shapeItems.append("path").attr("d", d => d3.symbol(shapeScale(d), 120)()).attr("fill", "#555");
  shapeItems.append("text").text(d => d).attr("x", 20).attr("y", 5);
}

function drawPyramidChart(svg, xDesc, yDesc, xInfo, yInfo) {
  if (xInfo.type !== 'categorical' || yInfo.type !== 'categorical') {
    svg.append("text")
      .attr("x", "50%")
      .attr("y", "50%")
      .attr("text-anchor", "middle")
      .text("Pyramid plot requires categorical data for both X and Y axes.");
    return;
  }

  const {
    width,
    height
  } = svg.node().getBoundingClientRect();
  const margin = {
    top: 40,
    right: 20,
    bottom: 40,
    left: 20
  };
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
    .data(yCategories).enter()
    .append("rect")
    .attr("class", "bar-left")
    .attr("x", d => xScale(-(counts.get(xCat1)?.get(d) || 0)))
    .attr("y", d => yScale(d))
    .attr("width", d => xScale(0) - xScale(-(counts.get(xCat1)?.get(d) || 0)))
    .attr("height", yScale.bandwidth())
    .attr("fill", "#4c78a8");

  g.selectAll(".bar-right")
    .data(yCategories).enter()
    .append("rect")
    .attr("class", "bar-right")
    .attr("x", xScale(0))
    .attr("y", d => yScale(d))
    .attr("width", d => xScale(counts.get(xCat2)?.get(d) || 0) - xScale(0))
    .attr("height", yScale.bandwidth())
    .attr("fill", "#69b3a2");

  g.append("g")
    .call(d3.axisLeft(yScale).tickSize(0))
    .attr("transform", `translate(${xScale(0)}, 0)`)
    .select(".domain").remove();

  g.selectAll(".tick text")
    .attr("x", 0)
    .attr("text-anchor", "middle");

  g.append("text").attr("x", xScale(-maxCount / 2)).attr("y", -10).text(xCat1).attr("text-anchor", "middle");
  g.append("text").attr("x", xScale(maxCount / 2)).attr("y", -10).text(xCat2).attr("text-anchor", "middle");
}

function drawHeat() {
  const svg = d3.select("#heatSvg");
  svg.selectAll("*").remove();

  const {
    width,
    height
  } = svg.node().getBoundingClientRect();
  const margin = {
    top: 40,
    right: 20,
    bottom: 180,
    left: 150
  };
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;

  const y_elements = state.descriptors;
  const x_elements = unique(state.sequences.map(s => s.pmid));

  if (!y_elements.length || !x_elements.length) return;

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(x_elements).range([0, graphWidth]).padding(0.05);
  const y = d3.scaleBand().domain(y_elements).range([0, graphHeight]).padding(0.05);
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
      const seqsInPaper = state.sequences.filter(s => s.pmid === pmid);
      const isPresent = seqsInPaper.some(s => {
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
        .on("mouseover", function() {
          d3.select(this).attr("stroke", "#000");
        })
        .on("mouseout", function() {
          d3.select(this).attr("stroke", null);
        })
        .append("title")
        .text(`${pmid} – ${descriptor}: ${value ? "present" : "absent"}`);
    });
  });

  const legend = g.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(0, ${graphHeight + 120})`);

  const legendData = [{
    value: 1,
    label: "Present (Data Available)"
  }, {
    value: 0,
    label: "Absent (NA or Missing)"
  }, ];

  const legendItems = legend.selectAll(".legend-item")
    .data(legendData).enter()
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

function bindEvents() {
  document.getElementById("exportCSV").addEventListener("click", exportCSV);

  const treeLayoutSelect = document.getElementById("treeLayout");
  const branchLengthToggle = document.getElementById("treeBranchLengthToggle");

  treeLayoutSelect.addEventListener("change", () => {
    branchLengthToggle.disabled = treeLayoutSelect.value === 'rectangular';
    drawTree();
  });

  branchLengthToggle.addEventListener("change", (e) => {
    const svgNode = document.getElementById("treeSvg");
    if (svgNode && svgNode.update && treeLayoutSelect.value !== 'rectangular') {
      svgNode.update(e.target.checked);
    }
  });

  document.getElementById("treeColour").addEventListener("change", drawTree);

  ["chartX", "chartY", "chartColour", "chartShape"].forEach(id => {
    document.getElementById(id).addEventListener("change", drawChart);
  });
  document.querySelectorAll("input[name='chartMode']").forEach(r => {
    r.addEventListener("change", drawChart);
  });

  document.getElementById("heatColour").addEventListener("change", drawHeat);

  document.getElementById("searchBox").addEventListener("input", e => {
    const tokens = e.target.value.split(",")
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);

    if (tokens.length === 0) {
      state.sequences = [...state.allSequences];
    } else {
      state.sequences = state.allSequences.filter(s =>
        tokens.some(token =>
          s.accession.toUpperCase().includes(token) || (s.pmid && s.pmid.toUpperCase().includes(token))
        )
      );
    }
    drawTree();
    drawChart();
    drawHeat();
  });
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * @param {string} newickString
 * @param {string} csvString 
 */
function loadDashboard(newickString, csvString) {
  try {
    const raw = d3.csvParse(csvString);

    if (!raw.length) throw new Error("CSV data is empty");
    if (!newickString) throw new Error("Tree data is empty");

    state.descriptors = raw.columns.filter(k => !["pmid", "accession"].includes(k));
    state.allSequences = raw.map(d => ({
      accession: d.accession,
      pmid: d.pmid,
      descriptors: Object.fromEntries(Object.entries(d)
        .filter(([k]) => !["pmid", "accession"].includes(k))
        .map(([k, v]) => {
          const num = +v;
          return [k, isNaN(num) || v === '' ? v : num];
        }))
    }));
    state.sequences = [...state.allSequences];
    state.papers = unique(raw.map(d => d.pmid)).map(pmid => ({
      pmid
    }));

    state.tree = parseNewick(newickString);

    analyzeDescriptors();
    populateControls();
    createObserver();
    bindEvents();

    document.querySelector('main').classList.add('loaded');
    document.getElementById("treeBranchLengthToggle").disabled = document.getElementById("treeLayout").value === 'rectangular';
    drawTree();
    drawChart();
    drawHeat();

  } catch (err) {
    console.error("Failed to load data:", err);
    alert(`Failed to load data: ${err.message}. Please check file format and console for details.`);
    document.querySelector('main').classList.remove('loaded');
  }
}

function initializeFileUpload() {
  const csvFileInput = document.getElementById('csvFileInput');
  const treeFileInput = document.getElementById('treeFileInput');
  const loadButton = document.getElementById('loadButton');

  loadButton.addEventListener('click', () => {
    const csvFile = csvFileInput.files[0];
    const treeFile = treeFileInput.files[0];

    if (!csvFile || !treeFile) {
      alert("Please select both a CSV and a Tree file.");
      return;
    }

    const filePromises = [
      readFileAsText(csvFile),
      readFileAsText(treeFile)
    ];

    Promise.all(filePromises)
      .then(([csvContent, treeContent]) => {
        loadDashboard(treeContent, csvContent);
      })
      .catch(error => {
        console.error("Error reading files:", error);
        alert(`Error reading files: ${error.message}`);
      });
  });
}

window.addEventListener("DOMContentLoaded", initializeFileUpload);