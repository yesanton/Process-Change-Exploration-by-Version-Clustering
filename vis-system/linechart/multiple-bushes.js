const timelineModeOptions = ["timewindow", "timeversion"];
let timelineDisplayMode = "timewindow";
let lastLineplotData = null;
let currentLineplotData = null;

function setTimelineDisplayMode(mode) {
  if (!timelineModeOptions.includes(mode)) return;
  timelineDisplayMode = mode;
  updateTimelineModeMenuActive();
  if (currentLineplotData) {
    drawLineplot(currentLineplotData, true);
  }
}

function updateTimelineModeMenuActive() {
  const menu = document.getElementById("timeline-mode-menu");
  if (!menu) return;
  menu.querySelectorAll("button").forEach(btn => {
    const isActive = btn.dataset.mode === timelineDisplayMode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function initTimelineModeMenu() {
  const menu = document.getElementById("timeline-mode-menu");
  if (!menu || menu.dataset.bound === "true") return;
  menu.dataset.bound = "true";
  menu.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => setTimelineDisplayMode(btn.dataset.mode));
  });
  updateTimelineModeMenuActive();
}

function configTimeline() {
  const margin = { top: 4, right: 20, bottom: 34, left: 20 };
  const divSizes = document.getElementById('LineChart').getBoundingClientRect();
  const width = Math.max(200, divSizes.width - margin.left - margin.right);
  const height = Math.max(32, divSizes.height - margin.top - margin.bottom);

  const container = d3.select("#LineChart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const svg = container.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  svg.append("rect")
    .attr("class", "timeline-background")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#f5f5f5")
    .attr("stroke", "#d0d0d0");

  return { svg, width, height, margin, container };
}

function drawLineplot(data, skipStore = false) {
  if (!skipStore) {
    lastLineplotData = data;
  }
  currentLineplotData = data;
  initTimelineModeMenu();
  d3.select("#LineChart").selectAll("*").remove();
  const config = configTimeline();

  const glyphAreaPadding = 10;
  const glyphAreaHeight = Math.max(22, config.height - glyphAreaPadding * 2);
  const minGlyphWidth = Math.max(12, Math.min(26, config.width / (data.timestamps.length * 2.6)));
  const glyphAreaTop = glyphAreaPadding;

  const selectionBandHeight = glyphAreaHeight + 16;
  const selectionOffsetY = Math.max(0, glyphAreaTop - 6);

  const x = d3.scaleTime()
    .domain(d3.extent(data.timestamps))
    .range([0, config.width]);

  const axis = d3.axisBottom(x)
    .ticks(Math.min(14, data.timestamps.length))
    .tickFormat((d, i, nodes) => {
      const formatterFull = d3.timeFormat("%b %Y");
      const formatterEdge = d3.timeFormat("%Y");
      if (i === 0 || i === nodes.length - 1) {
        return formatterEdge(d);
      }
      return formatterFull(d);
    })
    .tickPadding(6);

  config.svg.append("g")
    .attr("transform", "translate(0," + (config.height + 1) + ")")
    .call(axis)
    .selectAll("text")
    .style("font-size", "11px")
    .style("fill", "#4b5563");

  const gapDurations = [];
  for (let i = 0; i < data.timestamps.length - 1; i += 1) {
    gapDurations.push(data.timestamps[i + 1] - data.timestamps[i]);
  }
  const fallbackGap = gapDurations.length ? d3.median(gapDurations) : 1000 * 60 * 60 * 24 * 30;
  const trailingDate = new Date(data.timestamps[data.timestamps.length - 1].getTime() + fallbackGap);

  const glyphData = [];
  const indexToGlyph = new Array(data.timestamps.length);
  const glyphsByVersion = new Map();
  if (timelineDisplayMode === "timeversion") {
    let runStart = 0;
    for (let i = 1; i <= data.timestamps.length; i += 1) {
      const boundary = i === data.timestamps.length || data.versions[i] !== data.versions[runStart];
      if (!boundary) { continue; }
      const startDate = data.timestamps[runStart];
      const endDate = i < data.timestamps.length ? data.timestamps[i] : trailingDate;
      const drift = d3.max(data.drifts.slice(runStart, i));
      const glyph = {
        id: glyphData.length,
        startDate,
        endDate,
        version: data.versions[runStart],
        drift: drift
      };
      glyphData.push(glyph);
      for (let j = runStart; j < i; j += 1) {
        indexToGlyph[j] = glyph.id;
      }
      if (!glyphsByVersion.has(glyph.version)) glyphsByVersion.set(glyph.version, []);
      glyphsByVersion.get(glyph.version).push(glyph.id);
      runStart = i;
    }
  } else { // timewindow
    data.timestamps.forEach((startDate, idx) => {
      const endDate = idx < data.timestamps.length - 1 ? data.timestamps[idx + 1] : trailingDate;
      const glyph = {
        id: glyphData.length,
        startDate,
        endDate,
        version: data.versions[idx],
        drift: data.drifts[idx]
      };
      glyphData.push(glyph);
      indexToGlyph[idx] = glyph.id;
      if (!glyphsByVersion.has(glyph.version)) glyphsByVersion.set(glyph.version, []);
      glyphsByVersion.get(glyph.version).push(glyph.id);
    });
  }
  glyphData.forEach((d) => {
    const start = x(d.startDate);
    const end = x(d.endDate);
    d.x0 = start;
    d.x1 = Math.max(end, d.x0 + minGlyphWidth);
    d.cx = (d.x0 + d.x1) / 2;
  });
  const uniqueVersions = Array.from(new Set(data.versions));
  const orderedVersions = uniqueVersions.slice().sort((a, b) => {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return d3.ascending(a, b);
  });
  const colorRange = uniqueVersions.map((version, idx) => {
    if (version === 0) {
      return "#9d9d9d";
    }
    if (uniqueVersions.length <= 10) {
      return d3.schemeTableau10[idx % 10];
    }
    return d3.interpolateTurbo(idx / (uniqueVersions.length - 1 || 1));
  });
  const versionColorScale = d3.scaleOrdinal()
    .domain(uniqueVersions)
    .range(colorRange);

  const rowScale = d3.scaleBand()
    .domain(orderedVersions)
    .range([glyphAreaTop, glyphAreaTop + glyphAreaHeight])
    .paddingInner(0.2)
    .paddingOuter(0.15);

  const glyphHeight = Math.max(12, rowScale.bandwidth() * 0.55);
  const glyphCorner = Math.min(10, glyphHeight / 2.4);
  const glyphYOffset = (rowScale.bandwidth() - glyphHeight) / 2;

  const defs = config.container.append("defs");
  const shadow = defs.append("filter")
    .attr("id", "timeline-bar-shadow")
    .attr("x", "-20%")
    .attr("y", "-20%")
    .attr("width", "140%")
    .attr("height", "140%");
  shadow.append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 2)
    .attr("stdDeviation", 2.5)
    .attr("flood-color", "#000")
    .attr("flood-opacity", 0.18);

  config.svg.append("g")
    .attr("class", "drift-lines")
    .selectAll("line")
    .data(data.timestamps
      .map((t, idx) => ({ x: x(t), drift: data.drifts[idx] }))
      .filter(d => d.drift))
    .enter()
    .append("line")
    .attr("x1", d => d.x)
    .attr("x2", d => d.x)
    .attr("y1", selectionOffsetY)
    .attr("y2", selectionOffsetY + selectionBandHeight)
    .attr("stroke", "#d62728")
    .attr("stroke-dasharray", "4,4")
    .attr("stroke-width", 2)
    .style("pointer-events", "none");

  const selectionLayer = config.svg.append("g")
    .attr("class", "timeline-selections");
  let activeSelections = [];
  const selectionStyles = [
    { fill: "rgba(220, 53, 69, 0.2)", stroke: "#dc3545" },   // first (earlier) selection - red
    { fill: "rgba(40, 167, 69, 0.2)", stroke: "#28a745" }    // second (later) selection - green
  ];

  const previewSelection = config.svg.append("rect")
    .attr("class", "timeline-selection-preview")
    .attr("y", 0)
    .attr("height", 0)
    .attr("rx", 0)
    .attr("ry", 0)
    .attr("fill", "rgba(0,0,0,0.12)")
    .attr("stroke", "#666")
    .attr("stroke-dasharray", "6,4")
    .attr("visibility", "hidden")
    .style("pointer-events", "none");

  function renderSelections() {
    const selectionRects = selectionLayer.selectAll("rect")
      .data(activeSelections, d => d.key);

    selectionRects.enter()
      .append("rect")
      .attr("class", "timeline-selection")
      .style("pointer-events", "none")
      .merge(selectionRects)
      .attr("y", d => getSelectionBox(d.indices).y)
      .attr("height", d => getSelectionBox(d.indices).height)
      .attr("rx", d => getSelectionBox(d.indices).height / 2)
      .attr("ry", d => getSelectionBox(d.indices).height / 2)
      .attr("x", d => getSelectionDimensions(d.indices).x)
      .attr("width", d => getSelectionDimensions(d.indices).width)
      .attr("fill", d => selectionStyles[d.styleIndex].fill)
      .attr("stroke", d => selectionStyles[d.styleIndex].stroke)
      .attr("stroke-width", 1.5);

    selectionRects.exit().remove();
  }

  const brush = d3.brushX()
    .extent([[0, selectionOffsetY], [config.width, selectionOffsetY + selectionBandHeight]])
    .on("brush", brushMoved)
    .on("end", brushEnded);

  config.svg.append("g")
    .attr("class", "timeline-brush")
    .call(brush);

  config.svg
    .on("mousemove.dragselect", updateDrag)
    .on("mouseup.dragselect", endDrag)
    .on("mouseleave.dragselect", endDrag);

  const glyphs = config.svg.append("g")
    .attr("class", "timeline-glyphs");

  glyphs.selectAll("rect")
    .data(glyphData)
    .enter()
    .append("rect")
    .attr("x", d => d.x0)
    .attr("y", d => rowScale(d.version) + glyphYOffset)
    .attr("width", d => d.x1 - d.x0)
    .attr("height", glyphHeight)
    .attr("rx", glyphCorner)
    .attr("ry", glyphCorner)
    .attr("fill", d => d3.color(versionColorScale(d.version)).brighter(0.25))
    .attr("stroke", d => d3.color(versionColorScale(d.version)).darker(0.4))
    .attr("stroke-width", 1.2)
    .attr("opacity", 0.94)
    .attr("cursor", "pointer")
    .attr("filter", "url(#timeline-bar-shadow)")
    .on("mousedown", (event, d) => startDrag(event, d))
    .append("title")
    .text(d => "Version " + d.version + " • " + d3.timeFormat("%b %d, %Y")(d.startDate) + " → " + d3.timeFormat("%b %d, %Y")(d.endDate));

  function selectVersion(datum) {
    addSelectionByIndices([datum.id], true);
  }

  // drag-to-select over same version
  const dragState = {
    active: false,
    version: null,
    startX: 0,
    currentX: 0,
    anchorIndex: null,
    hasMoved: false
  };

  function startDrag(event, datum) {
    const [xPos] = d3.pointer(event, config.svg.node());
    dragState.active = true;
    dragState.version = datum.version;
    dragState.startX = xPos;
    dragState.currentX = xPos;
    dragState.anchorIndex = datum.id;
    dragState.hasMoved = false;
    event.stopPropagation();
  }

  function updateDrag(event) {
    if (!dragState.active) return;
    const [xPos] = d3.pointer(event, config.svg.node());
    dragState.currentX = xPos;
    if (Math.abs(xPos - dragState.startX) > 2) {
      dragState.hasMoved = true;
    }
    const indices = getDragIndices(dragState.version, dragState.startX, dragState.currentX, dragState.anchorIndex);
    if (!dragState.hasMoved || indices.length === 0) {
      previewSelection.attr("visibility", "hidden");
      return;
    }
    showPreviewSelection(indices);
  }

  function endDrag() {
    if (!dragState.active) return;
    const indices = getDragIndices(dragState.version, dragState.startX, dragState.currentX, dragState.anchorIndex);
    if (dragState.hasMoved && indices.length > 0) {
      addSelectionByIndices(indices);
    } else if (!dragState.hasMoved && dragState.version !== null) {
      selectVersion({ id: dragState.anchorIndex });
    }
    previewSelection.attr("visibility", "hidden");
    dragState.active = false;
    dragState.version = null;
    dragState.anchorIndex = null;
    dragState.hasMoved = false;
    dragState.startX = 0;
    dragState.currentX = 0;
  }

  function getDragIndices(version, startX, currentX, anchorIndex) {
    if (version === null) return [];
    const all = versionIndexMap.get(version) || [];
    const minX = Math.min(startX, currentX);
    const maxX = Math.max(startX, currentX);
    const filtered = all.filter(idx => {
      const g = glyphData[idx];
      return g.x1 >= minX && g.x0 <= maxX;
    });
    if (anchorIndex !== null && !filtered.includes(anchorIndex)) {
      filtered.push(anchorIndex);
    }
    if (!filtered.length) {
      return [anchorIndex ?? all[0]].filter(v => v !== undefined);
    }
    filtered.sort((a, b) => a - b);
    return filtered;
  }

  function brushMoved(event) {
    if (!event.selection) {
      previewSelection.attr("visibility", "hidden");
      return;
    }
    const [x0, x1] = event.selection;
    const midpoint = (x0 + x1) / 2;
    const closestIndex = bisectNearest(data.timestamps, x.invert(midpoint));
    const indices = getVersionIndicesInRange(closestIndex, x0, x1);
    showPreviewSelection(indices);
  }

  function brushEnded(event) {
    if (!event.selection) {
      previewSelection.attr("visibility", "hidden");
      return;
    }
    const [x0, x1] = event.selection;
    const midpoint = (x0 + x1) / 2;
    const closestIndex = bisectNearest(data.timestamps, x.invert(midpoint));
    const indices = getVersionIndicesInRange(closestIndex, x0, x1);
    previewSelection.attr("visibility", "hidden");
    addSelectionByIndices(indices);
    d3.select(this).call(brush.move, null);
  }

  function bisectNearest(values, target) {
    const idx = d3.bisectLeft(values, target);
    if (idx === 0) return 0;
    if (idx === values.length) return values.length - 1;
    const prev = values[idx - 1];
    const curr = values[idx];
    return (target - prev) < (curr - target) ? idx - 1 : idx;
  }

  function getVersionIndices(index) {
    if (indexToGlyph[index] !== undefined) { return [indexToGlyph[index]]; }
    const version = data.versions[index];
    const mapped = glyphsByVersion.get(version);
    if (mapped && mapped.length) { return mapped.slice(); }
    return [];
  }

  function getVersionIndicesInRange(index, x0, x1) {
    const version = data.versions[index];
    const all = glyphsByVersion.get(version) || [];
    const min = Math.min(x0, x1);
    const max = Math.max(x0, x1);
    const filtered = all.filter(i => {
      const span = glyphData[i];
      return span.x1 >= min && span.x0 <= max;
    });
    if (!filtered.length) {
      return getVersionIndices(index);
    }
    return filtered;
  }

  function getSelectionDimensions(indices) {
    let minX = Infinity;
    let maxX = -Infinity;
    indices.forEach(i => {
      const g = glyphData[i];
      if (g.x0 < minX) { minX = g.x0; }
      if (g.x1 > maxX) { maxX = g.x1; }
    });
    const paddingX = Math.max(8, glyphHeight * 0.3);
    const span = Math.max((maxX - minX), minGlyphWidth);
    const centerX = (minX + maxX) / 2;
    const width = span + paddingX * 2;
    return {
      x: centerX - width / 2,
      width
    };
  }

  function showPreviewSelection(indices) {
    const dims = getSelectionDimensions(indices);
    const box = getSelectionBox(indices);
    previewSelection
      .attr("x", dims.x)
      .attr("width", dims.width)
      .attr("y", box.y)
      .attr("height", box.height)
      .attr("rx", box.height / 2)
      .attr("ry", box.height / 2)
      .attr("visibility", "visible");
  }

  function getSelectionBox(indices) {
    const version = glyphData[indices[0]].version;
    const rowCenter = rowScale(version) + rowScale.bandwidth() / 2;
    const height = Math.max(rowScale.bandwidth(), glyphHeight + 10);
    return {
      y: rowCenter - height / 2,
      height
    };
  }

  function addSelectionByIndices(indices, toggle = false) {
    if (!indices.length) return;
    const version = glyphData[indices[0]].version;
    const existingIndex = activeSelections.findIndex(sel =>
      sel.version === version
    );

    if (toggle && existingIndex >= 0) {
      activeSelections.splice(existingIndex, 1);
    } else {
      if (activeSelections.length === 2) {
        // drop the oldest added selection to keep the new one
        activeSelections.shift();
      }
      activeSelections.push({
        key: `${version}-${Date.now()}`,
        indices: indices.slice(),
        version,
        startDate: d3.min(indices, i => glyphData[i].startDate),
        endDate: d3.max(indices, i => glyphData[i].endDate)
      });
    }

    activeSelections = activeSelections.sort((a, b) => a.startDate - b.startDate)
      .map((sel, idx) => ({
        ...sel,
        styleIndex: idx % selectionStyles.length
      }));

    renderSelections();

    const selectionsForUpdate = activeSelections.map(sel => ({
      startDate: sel.startDate,
      endDate: sel.endDate,
      version: sel.version,
      indices: sel.indices
    }));

    if (selectionsForUpdate.length > 0) {
      updateSelection(selectionsForUpdate);
    } else {
      updateSelection([]);
    }
  }

  function snapSelectionToCluster(startIndex, endIndex, toggle = false) {
    addSelectionByIndices(getVersionIndices(startIndex), toggle);
  }
}
