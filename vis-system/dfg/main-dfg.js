// function to initialize the dfg graph
function configDFG(data){
    // Create a new directed graph
    var g = new dagreD3.graphlib.Graph().setGraph({});
    g.graph().rankSep = 28; 
    g.graph().nodeSep = 24;
    g.graph().rankdir = "LR";
    g.graph().ranker = "longest-path";
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

    let t = data.dfrs.map(i => i.series_sum_each_arc || 0)
    const edgeMinRaw = d3.min(t);
    const edgeMaxRaw = d3.max(t);
    const edgeMin = (edgeMinRaw === undefined || !isFinite(edgeMinRaw)) ? 0 : edgeMinRaw;
    const edgeMax = (edgeMaxRaw === undefined || !isFinite(edgeMaxRaw)) ? 1 : edgeMaxRaw;
    // thresholds now drop only zero-weight edges; retain the full model otherwise
    config.threshold_arc_min = 1e-6;
    config.threshold_arc_diff_min = 1e-6;

    const edgeScaleDomain = (edgeMin === edgeMax) ? [0, edgeMax || 1] : [edgeMin, edgeMax];

    config.edge_size_scale = d3.scaleLinear().domain(edgeScaleDomain)
                            .range([1, 4])

    return config;
}


//function to draw dfg on 
function computeNodeLayers(data) {
    const nodes = new Set();
    const edges = [];
    data.dfrs.forEach(rel => {
        nodes.add(rel.act1);
        nodes.add(rel.act2);
        edges.push([rel.act1, rel.act2]);
    });
    const inDeg = {};
    nodes.forEach(n => { inDeg[n] = 0; });
    edges.forEach(([s, t]) => { inDeg[t] = (inDeg[t] || 0) + 1; });
    const layer = {};
    const starts = [...nodes].filter(n => inDeg[n] === 0);
    starts.forEach(n => { layer[n] = 0; });
    [...nodes].forEach(n => { if (!(n in layer)) layer[n] = 0; });
    // longest-path style relaxation (bounded iterations for cycles)
    const iterations = nodes.size * 2;
    for (let k = 0; k < iterations; k += 1) {
        let updated = false;
        edges.forEach(([s, t]) => {
            const cand = (layer[s] || 0) + 1;
            if (cand > (layer[t] || 0)) {
                layer[t] = cand;
                updated = true;
            }
        });
        if (!updated) break;
    }
    return layer;
}

function drawDFG(data){     
    console.log(data)
    // initialize the dfg againt
    config_dfg = configDFG(data);
    // remove the previous plot
    d3.select("#DFGChart").selectAll("*").remove();

    // todo: stepwise color for the arcs in two brushed version
    let minmax_series_sums = determineMaxMinSeriesSum(data)
    console.log('datadatadatadatadatadatadatadatadatadatadatadata')
    console.log(minmax_series_sums)
    let scaleC = d3.scaleLinear().domain(minmax_series_sums).range(['red', 'black', 'green'])
    console.log(scaleC(0))
    
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
        let temp_sum_prev = data.dfrs[j].series_sum_each_arc_prev
        let temp_sum_next = data.dfrs[j].series_sum_each_arc_next

        if (temp_sum > config_dfg.threshold_arc_min){
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
                data.dfrs[j].series_sum_each_arc_diff
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
        if (!(data.activity_count_prev === undefined)) {
            value.label = state + " (" + Math.round(data.activity_count_prev[state]) + '→' + Math.round(data.activity_count[state]) + ")";
            // console.log(value.label)

        } else {
            value.label = state + " (" + Math.round(data.activity_count[state]) + ")";
        }
        value.rx = value.ry = 5;
        value.labelStyle = config.font_size;
        value.rank = nodeLayers[state] || 0;
        
        if (state === 'end' || state === 'start') {
            // console.log(state)
            value.shape = 'ellipse'
            
            value.style = "fill: " + config_dfg.node_end_start_color_scale(data.activity_count[state])
            config_dfg.g.setNode(state, value);
        } else {
            // if (!(data.activity_count_prev === undefined)) {
                // the diverging color schema for the difference 
                // value.style = "fill: " + config_dfg.node_color_scale_diff(data.activity_count[state]- data.activity_count_prev[state]);
            // } else {
            value.style = "fill: " + config_dfg.node_color_scale(data.activity_count[state]);
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
    const densityScale = Math.max(0.55, Math.min(1, 40 / Math.max(nodeCount, 1)));
    const adjustedRankSep = 26 * densityScale + 10;
    const adjustedNodeSep = 22 * densityScale + 8;
    config_dfg.g.graph().rankSep = adjustedRankSep;
    config_dfg.g.graph().nodeSep = adjustedNodeSep;

    // Run the renderer. This is what draws the final graph.
    render(inner, config_dfg.g);
    
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
        .attr("opacity", 0.9);
    
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

// this code sets the style for the arcs
function edge_style(act1, act2, edge_scale_val, edge_type){
    if (act1 === 'start'){
        return "stroke: " + colors_start_end[edge_type] + "; stroke-width: " + config_dfg.edge_size_scale(edge_scale_val) + "px; stroke-dasharray: 4, 10"
    }
    else if (act2 === 'end') {
        return "stroke: " + colors_start_end[edge_type] + "; stroke-width: " + config_dfg.edge_size_scale(edge_scale_val) + "px; stroke-dasharray: 10, 4"
    } else {
        return "stroke: " + colors[edge_type] + "; stroke-width: " + config_dfg.edge_size_scale(edge_scale_val) + "px";
    }
    
}

function arrow_style(act1, act2, edge_type){
    if (act1 === 'start'){
        return "fill: " + colors_start_end[edge_type]
    }
    else if (act2 === 'end') {
        return "fill: " + colors_start_end[edge_type]
    } else {
        return "fill: " + colors[edge_type];
    } 
}


// this code sets the style for the arcs
function edge_style_colorlevels(act1, act2, edge_scale_val,  color){
    if (act1 === 'start'){
        return "stroke: " + color + "; stroke-width: " + config_dfg.edge_size_scale(edge_scale_val) + "px; stroke-dasharray: 4, 10"
    }
    else if (act2 === 'end') {
        return "stroke: " + color + "; stroke-width: " + config_dfg.edge_size_scale(edge_scale_val) + "px; stroke-dasharray: 10, 4"
    } else {
        return "stroke: " + color + "; stroke-width: " + config_dfg.edge_size_scale(edge_scale_val) + "px";
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


function setEdgeWithParams(config, act1, act2, sum, sum_next, sum_prev = undefined, scaleC = undefined, diffPercent = undefined){
    // we are dealing with two brushed regions
    if (sum_prev !== undefined) {
        let temp_diff = (diffPercent !== undefined) ? diffPercent : (sum_next - sum_prev);
        if (config.coloring === "threecolors") {
            let color = temp_diff > 0 ? "edge_future" : temp_diff < 0 ? "edge_past" : "edge_neutral";
            config.g.setEdge(act1, act2, 
                {
                    curve: d3.curveBasis, // cuvre the edges
                    labelStyle: 'fill: ' + colors[color] + "; " + config.font_size,
                    label: formatChangeLabel(temp_diff),
                    // additional options possible
                    // style: edge_style(data.dfrs[j].act1, data.dfrs[j].act2, temp_sum, "edge_future"),
                    style: edge_style(act1, act2, sum, color),
                    arrowheadStyle: arrow_style(act1, act2, color)
                })
        } else if (config.coloring === "levelthreecolors") {
            const domain = scaleC.domain();
            const clampedDiff = Math.max(domain[0], Math.min(domain[domain.length - 1], isFinite(temp_diff) ? temp_diff : (temp_diff > 0 ? domain[domain.length - 1] : domain[0])));
            const colorForEdge = d3.color(scaleC(clampedDiff)).formatHex();
            config.g.setEdge(act1, act2, 
                {
                    curve: d3.curveBasis, // cuvre the edges
                    labelStyle: 'fill: ' + colorForEdge + "; " + config.font_size,
                    label: formatChangeLabel(temp_diff),
                    style: edge_style_colorlevels(act1, act2, sum, colorForEdge),
                    arrowheadStyle: "fill: " +  colorForEdge
                })
        }
        
    } else {
        config_dfg.g.setEdge(act1, act2, 
            {
                curve: d3.curveBasis, // cuvre the edges
                label: round_and_to_string(sum),
                style: edge_style(act1, act2, sum, "edge_neutral"), 
                arrowheadStyle: arrow_style(act1, act2,'edge_neutral'),
                labelStyle: config.font_size
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
