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

function drawLineplot(data) {
  d3.select("#LineChart").selectAll("*").remove();
  const config = configTimeline();

  const glyphAreaPadding = 6;
  const glyphAreaHeight = Math.max(16, config.height - glyphAreaPadding * 2);
  const glyphWidth = Math.max(10, Math.min(20, config.width / (data.timestamps.length * 3)));
  const glyphAreaTop = glyphAreaPadding;

  const selectionBandHeight = glyphAreaHeight + 10;
  const selectionOffsetY = Math.max(0, glyphAreaTop - 5);

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

  const timestampTotals = {};
  data.timestamps.forEach(ts => {
    const key = ts.getTime();
    timestampTotals[key] = (timestampTotals[key] || 0) + 1;
  });
  const timestampOffsets = {};
  const glyphData = data.timestamps.map((date, index) => {
    const key = date.getTime();
    const total = timestampTotals[key];
    timestampOffsets[key] = (timestampOffsets[key] || 0) + 1;
    const order = timestampOffsets[key] - 1;
    const spread = Math.min(glyphWidth + 6, 22);
    const offset = (order - (total - 1) / 2) * spread;
    const positionX = x(date) + offset;
    return {
      date,
      version: data.versions[index],
      drift: data.drifts[index],
      index,
      positionX
    };
  });
  const versionIndexMap = new Map();
  glyphData.forEach((d, idx) => {
    if (!versionIndexMap.has(d.version)) {
      versionIndexMap.set(d.version, []);
    }
    versionIndexMap.get(d.version).push(idx);
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

  const glyphRadius = Math.max(4, Math.min(10, Math.min(glyphWidth / 2, rowScale.bandwidth() / 2 - 2)));

  config.svg.append("g")
    .attr("class", "drift-lines")
    .selectAll("line")
    .data(glyphData.filter(d => d.drift))
    .enter()
    .append("line")
    .attr("x1", d => d.positionX)
    .attr("x2", d => d.positionX)
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

  glyphs.selectAll("circle")
    .data(glyphData)
    .enter()
    .append("circle")
    .attr("cx", d => d.positionX)
    .attr("cy", d => rowScale(d.version) + rowScale.bandwidth() / 2)
    .attr("r", glyphRadius)
    .attr("fill", d => versionColorScale(d.version))
    .attr("stroke", "#2f2f2f")
    .attr("stroke-width", 1)
    .attr("cursor", "pointer")
    .on("mousedown", (event, d) => startDrag(event, d))
    .append("title")
    .text(d => "Version " + d.version + " • " + d3.timeFormat("%b %d, %Y")(d.date));

  function selectVersion(version) {
    const indices = versionIndexMap.get(version) || [];
    addSelectionByIndices(indices, true);
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
    dragState.anchorIndex = datum.index;
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
      selectVersion(dragState.version);
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
      const px = glyphData[idx].positionX;
      return px >= minX && px <= maxX;
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
    const version = data.versions[index];
    return versionIndexMap.get(version) || [index];
  }

  function getVersionIndicesInRange(index, x0, x1) {
    const version = data.versions[index];
    const all = versionIndexMap.get(version) || [index];
    const min = Math.min(x0, x1);
    const max = Math.max(x0, x1);
    const filtered = all.filter(i => {
      const pos = glyphData[i].positionX;
      return pos >= min && pos <= max;
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
      const pos = glyphData[i].positionX;
      if (pos < minX) { minX = pos; }
      if (pos > maxX) { maxX = pos; }
    });
    const paddingX = Math.max(6, glyphRadius * 0.6);
    const span = Math.max((maxX - minX) + glyphWidth, glyphWidth);
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
    const height = Math.max(rowScale.bandwidth(), glyphRadius * 2 + 6);
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
        startDate: d3.min(indices, i => data.timestamps[i]),
        endDate: d3.max(indices, i => data.timestamps[i])
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
