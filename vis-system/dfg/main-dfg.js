// function to initialize the dfg graph
function configDFG(data, opts = {}){
    // Create a new directed graph
    const nodeSet = new Set();
    data.dfrs.forEach(rel => { nodeSet.add(rel.act1); nodeSet.add(rel.act2); });
    const nodeCount = nodeSet.size;
    const edgeCount = data.dfrs.length;

    var g = new dagreD3.graphlib.Graph().setGraph({});
    g.graph().rankSep = 14; 
    g.graph().nodeSep = 12;
    g.graph().edgeSep = 4;
    g.graph().marginx = 6;
    g.graph().marginy = 6;
    g.graph().rankdir = "LR";
    // choose a compact ranker for dense graphs
    g.graph().ranker = (nodeCount > 24 || edgeCount > 60) ? "tight-tree" : "network-simplex";
    g.graph().acyclicer = "greedy";
    g.graph().Schedule = true;
    g.graph().WBS = false;
    console.log(g)  
    config = {}
    config.g = g
    config.threshold_arc_min = 10
    config.threshold_arc_diff_min = 10
    config.coloring = "levelthreecolors" //"threecolors" // 

    config.font_size = "" //"font-size: 2em" // or empty for normal: ''

    config.dashes = {
        end: 'stroke-dasharray: 5, 10',
        start: 'stroke-dasharray: 5, 5'
    }
    // console.log(Object.keys(data.activity_count))
    let temp_activity_count = Object.keys(data.activity_count).map(function(key){
        return data.activity_count[key];
    })
    config.node_color_scale = d3.scaleLinear().domain([d3.min(temp_activity_count),d3.max(temp_activity_count)])
                                              .range(["white", "green"])

    // this is for diverging scale for the change information in nodes
    // config.node_color_scale_diff = d3.scaleLinear().domain([(d3.max(temp_activity_count) * -1),0,d3.max(temp_activity_count)])
    //                                           .range(["red", "white", "green"])

    config.node_end_start_color_scale = d3.scaleLinear().domain([d3.min(temp_activity_count),d3.max(temp_activity_count)])
                                              .range(["white", "orange"])

    let t = data.dfrs.map(i => i.series_sum_each_arc || 0);
    const finiteT = t.filter(v => isFinite(v));
    const edgeMinRaw = d3.min(finiteT);
    const edgeMaxRaw = d3.max(finiteT);
    const edgeMin = (edgeMinRaw === undefined || !isFinite(edgeMinRaw)) ? 0 : edgeMinRaw;
    const edgeMax = (edgeMaxRaw === undefined || !isFinite(edgeMaxRaw)) ? 1 : edgeMaxRaw;
    // thresholds now drop only zero-weight edges; retain the full model otherwise
    config.threshold_arc_min = (opts.selectionType === "double") ? 0 : 1e-6;
    config.threshold_arc_diff_min = 1e-6;

    const edgeScaleDomain = (edgeMin === edgeMax) ? [0, edgeMax || 1] : [edgeMin, edgeMax];

    config.edge_size_scale = d3.scaleLinear().domain(edgeScaleDomain)
                            .range([2, 7])
    config.edgeOpacity = (opts.selectionType === "double") ? 0.9 : 0.55;
    config.layoutMeta = { nodeCount, edgeCount };
    config.performanceMode = opts.performanceMode || "absolute";
    config.selectionType = opts.selectionType || "none";
    const baseData = opts.baseData || {};
    config.baseActivityCounts = baseData.activity_count || {};
    config.baseEdgeTotals = new Map();
    (baseData.dfrs || []).forEach(e => {
        const key = `${e.act1}->${e.act2}`;
        const raw = e.series_sum_each_arc_raw || e.series_sum_each_arc || 0;
        config.baseEdgeTotals.set(key, raw);
    });
    config.baseCount = Math.max(1, baseData.count_actual || baseData.count || 1);
    config.currentCount = Math.max(1, data.count_actual || data.count || 1);

    return config;
}


//function to draw dfg on 
function computeNodeLayers(data) {
    const nodes = new Set();
    const edges = [];
    data.dfrs.forEach(rel => {
        nodes.add(rel.act1);
        nodes.add(rel.act2);
        const w = Math.max(1, rel.series_sum_each_arc || 1);
        edges.push([rel.act1, rel.act2, w]);
    });
    const inDeg = {};
    nodes.forEach(n => { inDeg[n] = 0; });
    edges.forEach(([s, t]) => { inDeg[t] = (inDeg[t] || 0) + 1; });
    const layer = {};
    const starts = [...nodes].filter(n => inDeg[n] === 0);
    starts.forEach(n => { layer[n] = 0; });
    [...nodes].forEach(n => { if (!(n in layer)) layer[n] = 0; });

    // weighted longest-path relaxation; heavier edges push successors further right
    const iterations = nodes.size * 2;
    for (let k = 0; k < iterations; k += 1) {
        let updated = false;
        edges.forEach(([s, t, w]) => {
            const weightStep = Math.max(1, Math.round(Math.log10(w + 1)));
            const cand = (layer[s] || 0) + weightStep;
            if (cand > (layer[t] || 0)) {
                layer[t] = cand;
                updated = true;
            }
        });
        if (!updated) break;
    }
    return layer;
}

function drawDFG(data, opts = {}){     
    console.log(data)
    // initialize the dfg againt
    config_dfg = configDFG(data, opts);
    // remove the previous plot
    d3.select("#DFGChart").selectAll("*").remove();

    // todo: stepwise color for the arcs in two brushed version
    let minmax_series_sums = determineMaxMinSeriesSum(data)
    console.log('datadatadatadatadatadatadatadatadatadatadatadata')
    console.log(minmax_series_sums)
    let scaleC = d3.scaleLinear().domain(minmax_series_sums).range(['#dc2626', '#9ca3af', '#16a34a'])
    console.log(scaleC(0))
    const selType = config_dfg.selectionType;
    const mode = config_dfg.performanceMode;
    let nodeDiffScale = null;
    if (selType === "double") {
        const nodeDiffs = Object.keys(data.activity_count || {}).map(k => {
            const curr = data.activity_count[k] || 0;
            const prev = (data.activity_count_prev || {})[k] || 0;
            if (mode === "absolute") {
                return curr - prev;
            }
            const prevDen = Math.max(1, data.count_prev || config_dfg.baseCount || 1);
            const currDen = Math.max(1, data.count_actual || data.count || prevDen);
            const prevNorm = prev / prevDen;
            const currNorm = curr / currDen;
            return (prevNorm === 0) ? (currNorm > 0 ? Infinity : 0) : ((currNorm - prevNorm) / prevNorm) * 100;
        });
        const maxNodeDiff = d3.max(nodeDiffs.map(v => Math.abs(isFinite(v) ? v : 0))) || 1;
        nodeDiffScale = d3.scaleLinear()
            .domain([-maxNodeDiff, 0, maxNodeDiff])
            .range(['#dc2626', '#e5e7eb', '#16a34a']);
        config_dfg.nodeDiffScale = nodeDiffScale;
    }
    
    const nodeLayers = computeNodeLayers(data);
    let states = {}
    for (let j = 0 ; j < data.dfrs.length ; j+= 1){
        states[data.dfrs[j].act1] = {
            description: "description"
            }
        states[data.dfrs[j].act2] = {
            description: "description"
        }
        let temp_sum = data.dfrs[j].series_sum_each_arc;
        let temp_sum_prev = data.dfrs[j].series_sum_each_arc_prev;
        let temp_sum_next = data.dfrs[j].series_sum_each_arc_next;
        temp_sum = isFinite(temp_sum) ? temp_sum : 0;
        if (temp_sum_prev !== undefined) { temp_sum_prev = isFinite(temp_sum_prev) ? temp_sum_prev : 0; }
        if (temp_sum_next !== undefined) { temp_sum_next = isFinite(temp_sum_next) ? temp_sum_next : 0; }
        let temp_sum_prev_raw = data.dfrs[j].series_sum_each_arc_prev_raw;
        let temp_sum_next_raw = data.dfrs[j].series_sum_each_arc_next_raw;

        const effectiveSum = (config_dfg.selectionType === "double")
            ? Math.max(temp_sum, temp_sum_prev || 0, temp_sum_next || 0)
            : temp_sum;

        if (effectiveSum > config_dfg.threshold_arc_min){
            // // Set up the edges
                // the difference between the two datasets is larger than some value:
            setEdgeWithParams(
                config_dfg,
                data.dfrs[j].act1,
                data.dfrs[j].act2,
                temp_sum,
                temp_sum_next,
                temp_sum_prev,
                scaleC,
                data.dfrs[j].series_sum_each_arc_diff,
                temp_sum_next_raw,
                temp_sum_prev_raw
            )   
        }
    }
    
    // Add states to the graph, set labels, and style
    console.log('here we draw nodes! --->')
    // console.log(data)
    // console.log(states)
    Object.keys(states).forEach(function(state) {
        var value = states[state];
        // console.log(data.activity_count_prev)
        // console.log(data)
        const currentVal = data.activity_count[state] || 0;
        const prevVal = (data.activity_count_prev || {})[state] || 0;
        const baseVal = (config_dfg.baseActivityCounts || {})[state] || 0;
        const countBase = Math.max(1, config_dfg.baseCount || 1);
        const mode = config_dfg.performanceMode;
        const selType = config_dfg.selectionType;
        const fmt = (v) => Math.round(v);
        let nodeDiffVal = 0;
        if (selType === "double" && data.activity_count_prev !== undefined) {
            if (mode === "absolute") {
                value.label = `${state} (${fmt(currentVal)} - ${fmt(prevVal)})`;
                nodeDiffVal = currentVal - prevVal;
            } else {
                const prevDen = Math.max(1, data.count_prev || countBase);
                const currDen = Math.max(1, data.count_actual || data.count || countBase);
                const prevNorm = prevVal / prevDen;
                const currNorm = currentVal / currDen;
                const diffPercent = (prevNorm === 0)
                    ? (currNorm > 0 ? Infinity : 0)
                    : ((currNorm - prevNorm) / prevNorm) * 100;
                const dir = diffPercent > 0 ? "↑" : diffPercent < 0 ? "↓" : "±";
                value.label = `${state} (${dir}${Math.abs(diffPercent).toFixed(0)}%)`;
                nodeDiffVal = diffPercent;
            }
        } else if (selType === "single" && mode === "percent") {
            const percent = baseVal === 0 ? 0 : (currentVal / baseVal) * 100;
            value.label = `${state} (${percent.toFixed(0)}%)`;
        } else {
            value.label = `${state} (${fmt(currentVal)})`;
        }
        // clamp diff value to color scale domain to avoid extreme colors/black
        let nodeColorVal = nodeDiffVal;
        if (nodeDiffScale) {
            const d = nodeDiffScale.domain();
            const minD = Math.min(...d);
            const maxD = Math.max(...d);
            if (!isFinite(nodeColorVal)) {
                nodeColorVal = nodeColorVal > 0 ? maxD : minD;
            } else {
                nodeColorVal = Math.max(minD, Math.min(maxD, nodeColorVal));
            }
        }
        value.rx = value.ry = 5;
        value.labelStyle = config.font_size;
        value.rank = nodeLayers[state] || 0;
        
        if (state === 'end' || state === 'start') {
            // console.log(state)
            value.shape = 'ellipse'
            
            if (selType === "double" && config_dfg.nodeDiffScale) {
                value.style = "fill: " + config_dfg.nodeDiffScale(nodeColorVal);
            } else {
                value.style = "fill: " + config_dfg.node_end_start_color_scale(data.activity_count[state])
            }
            config_dfg.g.setNode(state, value);
        } else {
            // if (!(data.activity_count_prev === undefined)) {
                // the diverging color schema for the difference 
                // value.style = "fill: " + config_dfg.node_color_scale_diff(data.activity_count[state]- data.activity_count_prev[state]);
            // } else {
            if (selType === "double" && config_dfg.nodeDiffScale) {
                value.style = "fill: " + config_dfg.nodeDiffScale(nodeColorVal);
            } else {
                value.style = "fill: " + config_dfg.node_color_scale(data.activity_count[state]);
            }
            // }
            
            if (state === 'Send for Credit Collection') {
                console.log("===============================data.activity_count[state]")

                console.log(data.activity_count[state])
                console.log(data.activity_count)
                console.log(data)

            }

            config_dfg.g.setNode(state, value);
        }
    });
    delete states;
    // Create the renderer
    var render = new dagreD3.render();
    // render.edgeTension('linear')
    // Set up an SVG group so that we can translate the final graph.

    var svg = d3.select("#DFGChart");
    let inner = svg.append("g");
    
    // Set up zoom support
    var zoom = d3.zoom()
        .on("zoom", function(event) {
            inner.attr("transform", event.transform);
        });
    svg.call(zoom);
    
    // Simple function to style the tooltip for the given node.
    var styleTooltip = function(name, description) {
        return "<p class='name'>" + name + "</p><p class='description'>" + description + "</p>";
    };
    

    // compact node spacing dynamically for larger graphs
    const nodeCount = config_dfg.g.nodes().length;
    const densityScale = Math.max(0.25, Math.min(1, 56 / Math.max(nodeCount, 1)));
    const adjustedRankSep = 14 * densityScale + 4;
    const adjustedNodeSep = 12 * densityScale + 4;
    config_dfg.g.graph().rankSep = adjustedRankSep;
    config_dfg.g.graph().nodeSep = adjustedNodeSep;

    // Run the renderer. This is what draws the final graph.
    try {
        render(inner, config_dfg.g);
    } catch (e) {
        console.error("DFG render error", e);
        return;
    }
    
    inner.selectAll("config_lineplot.g.node")
        .attr("title", function(v) { return styleTooltip(v, config_dfg.g.node(v).description) })
        .each(function(v) { $(this).tipsy({ gravity: "w", opacity: 1, html: true}); });
    
    // subtle styling upgrades
    inner.selectAll("g.node rect, g.node ellipse")
        .attr("stroke", "#1f2937")
        .attr("stroke-width", 0.7)
        .attr("rx", 10)
        .attr("ry", 10)
        .style("filter", "drop-shadow(0px 2px 4px rgba(0,0,0,0.18))");
    inner.selectAll("g.edgePath path")
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("opacity", 1);

    // align arrowheads with edges: same opacity and centered on stroke
    inner.selectAll("defs marker")
        .attr("markerUnits", "strokeWidth")
        .attr("markerWidth", 8)
        .attr("markerHeight", 8)
        .attr("refX", 4)
        .attr("refY", 4)
        .attr("orient", "auto");

    // add subtle backgrounds behind edge labels to keep them legible on-edge
    function addEdgeLabelBackgrounds() {
        try {
            const padX = 3;
            const padY = 1;
            inner.selectAll("g.edgeLabel").each(function() {
                const labelGroup = d3.select(this).select("g.label");
                const text = labelGroup.select("text");
                if (text.empty() || !text.node()) return;
                const bbox = text.node().getBBox();
                let bg = labelGroup.select("rect.label-bg");
                if (bg.empty()) {
                    bg = labelGroup.insert("rect", "text").classed("label-bg", true);
                }
                bg.attr("x", bbox.x - padX)
                  .attr("y", bbox.y - padY)
                  .attr("width", bbox.width + padX * 2)
                  .attr("height", bbox.height + padY * 2)
                  .attr("rx", 6)
                  .attr("ry", 6)
                  .attr("fill", "rgba(255,255,255,0.6)")
                  .attr("stroke", "rgba(0,0,0,0.05)")
                  .attr("stroke-width", 0.4)
                  .attr("filter", "drop-shadow(0 1px 2px rgba(0,0,0,0.03))");
                text
                  .attr("dominant-baseline", "top")
                  .attr("dy", "-0.15em");
            });
        } catch (e) {
            console.warn("Edge label background skipped", e);
        }
    }
    addEdgeLabelBackgrounds();

    // tone arrowheads to match opacity and scale them down for elegance
    const arrowOpacity = config_dfg.selectionType === "double" ? 0.9 : 0.55;
    inner.selectAll("defs marker path")
        .attr("fill-opacity", arrowOpacity)
        .attr("transform", "scale(0.82)");
    
    // add tooltip

    // console.log("inner: ")
    // console.log(config_dfg.g)

    // var styleTooltip = function(v,k) {
    //     return "<p class='name'>" + v + " </p><p class='description'> " + k + " </p>";
    // };


    // var tooltip = d3.select("#DFGChart")
    //     .append("div")
    //     .style("position", "absolute")
    //     .style("visibility", "visible")
    //     .style('top', "200px")
    //     .style('left', "200px")
    //     .text("I'm a circle!");

    // inner.selectAll("g.edgePath")
    //     .on("mouseover", function(){
    //         console.log('HERE IN HERE <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
    //         return tooltip.style("visibility", "visible");})
    //     .on("mousemove", function(){return tooltip.style("top", 100+"px").style("left",100+"px");})
    //     .on("mouseout", function(){return tooltip.style("visibility", "hidden");});    
    
    // .attr("title", function(v,k) { return styleTooltip(v,k) })
        //     .each(function(v,k) { $(this).tipsy({ gravity: "w", opacity: 1, html: true }); });



    // Center the graph
    
    
    let width_dfg = document.getElementById('DFGChart').getBoundingClientRect().width
    
    // this is the real height of the svg box
    let height_dfg_svg_box = document.getElementById('DFGChart').getBoundingClientRect().height;
    // this is the size of the graph inside of svg
    let height_dfg_actual = config_dfg.g.graph().height;
    let width_dfg_actual = config_dfg.g.graph().width;
    // scale to fit both width and height
    const scaleHeight = (height_dfg_svg_box - position.padding_big) / height_dfg_actual;
    const scaleWidth = (width_dfg - position.padding_big) / width_dfg_actual;
    let initialScaleCalculated = Math.min(scaleHeight, scaleWidth);
    let initialScale = Math.min(initialScaleCalculated, 0.9);

    // console.log(initialScale)
    let padding_top = 0
    const scaledHeight = height_dfg_actual * initialScale;
    const scaledWidth = width_dfg_actual * initialScale;
    padding_top = Math.max(position.padding, (height_dfg_svg_box - scaledHeight) / 2);
    const padding_left = Math.max(position.padding, (width_dfg - scaledWidth) / 2);

    // console.log(height_dfg_svg_box)
    // console.log(height_dfg_actual)
    // console.log('making adjustments of the dfg positioning')
    // console.log(padding_top)

    svg.call(zoom.transform, d3.zoomIdentity.translate(padding_left, padding_top).scale(initialScale));
    // console.log("!!!!!!!!!!!!!@@@@@@@@@@@  " )
    // height_dfg_svg_box = document.getElementById('DFGChart').getBoundingClientRect().height;
    // height_dfg_actual = config_dfg.g.graph().height;
    // console.log(height_dfg_svg_box)
    // console.log(height_dfg_actual)

    
    // svg.attr('height', config_dfg.g.graph().height * initialScale + 40);
}


function round_and_to_string(number){
    if (!isFinite(number) || number <= 0) {
        return "";
    }
    const rounded = Math.round(number);
    return rounded < 1 ? "1" : rounded.toString();
}

function colorWithOpacity(hex, opacity) {
    if (typeof d3 === "undefined" || !d3.color) { return hex; }
    const c = d3.color(hex);
    if (!c) { return hex; }
    c.opacity = opacity;
    return c.formatRgb();
}

// uniform stroke sizing with a minimum in double-selection mode
function edgeStrokeWidth(val){
    let w = config_dfg.edge_size_scale(val);
    if (config_dfg.selectionType === "double") {
        w = Math.max(w, 3.2);
    }
    return w;
}

// this code sets the style for the arcs
function edge_style(act1, act2, edge_scale_val, edge_type){
    const strokeColor = colorWithOpacity(colors[edge_type], config_dfg.edgeOpacity || 1);
    if (act1 === 'start'){
        return "stroke: " + colorWithOpacity(colors_start_end[edge_type], config_dfg.edgeOpacity || 1) + "; stroke-width: " + edgeStrokeWidth(edge_scale_val) + "px; stroke-dasharray: 4, 10"
    }
    else if (act2 === 'end') {
        return "stroke: " + colorWithOpacity(colors_start_end[edge_type], config_dfg.edgeOpacity || 1) + "; stroke-width: " + edgeStrokeWidth(edge_scale_val) + "px; stroke-dasharray: 10, 4"
    } else {
        return "stroke: " + strokeColor + "; stroke-width: " + edgeStrokeWidth(edge_scale_val) + "px";
    }
    
}

function arrow_style(act1, act2, edge_type){
    const base = (act1 === 'start' || act2 === 'end') ? colors_start_end[edge_type] : colors[edge_type];
    const col = colorWithOpacity(base, config_dfg.edgeOpacity || 1);
    return `fill: ${col}; stroke: none; fill-opacity: 1; stroke-opacity:0.5`;
}


// this code sets the style for the arcs
function edge_style_colorlevels(act1, act2, edge_scale_val,  color){
    const strokeColor = colorWithOpacity(color, config_dfg.edgeOpacity || 1);
    if (act1 === 'start'){
        return "stroke: " + strokeColor + "; stroke-width: " + edgeStrokeWidth(edge_scale_val) + "px; stroke-dasharray: 4, 10"
    }
    else if (act2 === 'end') {
        return "stroke: " + strokeColor + "; stroke-width: " + edgeStrokeWidth(edge_scale_val) + "px; stroke-dasharray: 10, 4"
    } else {
        return "stroke: " + strokeColor + "; stroke-width: " + edgeStrokeWidth(edge_scale_val) + "px";
    }
    
}


// todo: stepwise color for the arcs in two brushed version
function determineMaxMinSeriesSum(data) {
    let mi = Infinity;
    let ma = 0;
    console.log('here -<<')
    console.log(data)
    for (let i = 0; i < data.dfrs.length ; i += 1){
        let t = data.dfrs[i].series_sum_each_arc_diff;
        if (!isFinite(t)) {
            continue;
        }
        if (mi > t) {
            mi = t;
        } 
        if (ma < t) {
            ma = t;
        }
    }
    console.log('here ->>')
    if (mi === Infinity || ma === -Infinity || (!isFinite(mi) && !isFinite(ma))) {
        return [-1, 0, 1];
    }
    return [mi, 0, ma]
}



function formatChangeLabel(changePercent) {
    if (!isFinite(changePercent)) {
        return changePercent > 0 ? "↑∞%" : "0%";
    }
    const direction = changePercent > 0 ? "↑" : changePercent < 0 ? "↓" : "";
    return direction + Math.abs(changePercent).toFixed(0) + "%";
}


function formatAbsChange(val) {
    if (!isFinite(val)) return val > 0 ? "+∞" : "0";
    const rounded = Math.round(val * 100) / 100;
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded}`;
}

function setEdgeWithParams(config, act1, act2, sum, sum_next, sum_prev = undefined, scaleC = undefined, diffPercent = undefined, sum_next_raw = undefined, sum_prev_raw = undefined){
    // sanitize values to avoid NaNs breaking layout
    if (!isFinite(sum)) { sum = 0; }
    if (sum_next !== undefined && !isFinite(sum_next)) { sum_next = 0; }
    if (sum_prev !== undefined && !isFinite(sum_prev)) { sum_prev = 0; }
    if (sum_next_raw !== undefined && !isFinite(sum_next_raw)) { sum_next_raw = sum_next; }
    if (sum_prev_raw !== undefined && !isFinite(sum_prev_raw)) { sum_prev_raw = sum_prev; }
    // we are dealing with two brushed regions
    if (sum_prev !== undefined) {
        const temp_diff = (diffPercent !== undefined) ? diffPercent : (sum_next - sum_prev);
        const nextRawSafe = round_and_to_string(sum_next_raw !== undefined ? sum_next_raw : sum_next) || "0";
        const prevRawSafe = round_and_to_string(sum_prev_raw !== undefined ? sum_prev_raw : sum_prev) || "0";
        const absLabel = `${nextRawSafe} - ${prevRawSafe}`;
        const edgeOpacity = config.selectionType === "double" ? 0.9 : 0.55;
        if (config.coloring === "threecolors") {
            let color = temp_diff > 0 ? "edge_future" : temp_diff < 0 ? "edge_past" : "edge_neutral";
            config.g.setEdge(act1, act2, 
                {
                    curve: d3.curveBasis, // cuvre the edges
                    labelStyle: 'fill: ' + colors[color] + "; " + config.font_size,
                    label: (config.performanceMode === "absolute") ? absLabel : (formatChangeLabel(temp_diff) || "0"),
                    labelpos: "m",
                    labeloffset: 0,
                    style: edge_style(act1, act2, sum, color),
                    arrowheadStyle: arrow_style(act1, act2, color)
                })
        } else if (config.coloring === "levelthreecolors" && scaleC) {
            const domain = scaleC.domain();
            const clampedDiff = Math.max(domain[0], Math.min(domain[domain.length - 1], isFinite(temp_diff) ? temp_diff : (temp_diff > 0 ? domain[domain.length - 1] : domain[0])));
            const colorForEdge = d3.color(scaleC(clampedDiff)).formatHex();
            const arrowCol = colorWithOpacity(colorForEdge, config.edgeOpacity || 1);
            config.g.setEdge(act1, act2, 
                {
                    curve: d3.curveBasis, // cuvre the edges
                    labelStyle: 'fill: ' + colorForEdge + "; " + config.font_size,
                    label: (config.performanceMode === "absolute") ? absLabel : (formatChangeLabel(temp_diff) || "0"),
                    labelpos: "m",
                    labeloffset: 0,
                    style: edge_style_colorlevels(act1, act2, sum, d3.color(colorForEdge).copy({opacity: edgeOpacity}).formatRgb()),
                    arrowheadStyle: `fill: ${arrowCol}; stroke: ${arrowCol}; fill-opacity: 1; stroke-opacity: 1`
                })
        }
    } else {
        let labelText = round_and_to_string(sum);
        if (config.performanceMode === "percent" && config.selectionType === "single") {
            const baseKey = `${act1}->${act2}`;
            const baseRaw = config.baseEdgeTotals.get(baseKey) || 0;
            const baseNorm = baseRaw / Math.max(1, config.baseCount || 1);
            const currNorm = sum / Math.max(1, config.currentCount || 1);
            const percent = baseNorm === 0 ? 0 : (currNorm / baseNorm) * 100;
            labelText = percent.toFixed(0) + "%";
        }
        const edgeOpacity = config.selectionType === "double" ? 0.9 : 0.55;
        config.g.setEdge(act1, act2, 
            {
                curve: d3.curveBasis, // cuvre the edges
                label: labelText,
                labelpos: "m",
                labeloffset: 0,
                style: edge_style(act1, act2, sum, "edge_neutral"), 
                arrowheadStyle: arrow_style(act1, act2,'edge_neutral'),
                labelStyle: 'fill: ' + colors["edge_neutral"] + "; " + config.font_size
                //style: "stroke: #f66; stroke-width: 3px; stroke-dasharray: 5, 5;",
                // arrowheadStyle: "fill: #f66" 
                // additional options possible
                // style: "stroke: #aaa;   stroke-dasharray: 5, 10;" 
                // ,curve: d3.curveBasis
                // ,arrowheadStyle: "fill: #aaa"
                // ,labelpos: 'c'
                // label: 'pruned'
                // ,labelStyle: 'stroke: #aaa'
                // labeloffset: 5
                // arrowhead: 'undirected'
            })

    }
    
}
