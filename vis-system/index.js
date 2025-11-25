// in this file the main system is set up to be running

var position = {
    padding: 10, 
    padding_big: 20
}

// help with choosing colors
// https://coolors.co/7d7e7c
let colors = {
    edge_past: '#f66',
    edge_future: '#008000', 
    edge_neutral: '#7D7E7C',
}
let colors_start_end = {
    edge_past: '#FFDEDE',
    // edge_future: '#ADFFAD',  
    edge_future: '#CBE2CB',  
    edge_neutral: '#C7C8C7'
     
}

// colors.edge_past = '#f66'
// colors.edge_future = 'green'
// let count = 50
// let count_actual = 25
var data = {}
let performanceMode = "percent"; // "percent" or "absolute"
let selectionContext = "none";   // "none" | "single" | "double"
// data.count  - these are the count of each time series(number of windows)
// data.count_actual  - the actual derived from the data, count_actual - count is the predicted then.
// data.series_sum// this is for the sum of the time series to build the graph

// data.timestamps - timestamps
// data.dfrs - directly follow relations for each constraints
// data.dfrs[].series[]
// data.dfrs[].act1
// data.dfrs[].act2
// data.dfrs[].technique
// data.dfrs[].series_sum_each_arc -> is the actual dfg relation 
// data.dfrs[].series_sum_each_arc_diff -> is the actual diff or dfg relations
// data.dfrs[].series_sum_each_arc_prev 
// data.dfrs[].series_sum_each_arc_next 
// data.series_sum_each_arc_min 
// data.series_sum_each_arc_max 

data.dfrs = []

data.activity_count = {} // this will be used to colr the activities, and to filter the activities with activities slider
// data.activity_count_prev // shows the activity count of the region that we compare the current region with 

// the result of brushed region and filtering and differencing (when available) is stored here
let filteredData;
// this is even further filtered data that is under the path and activity slider filtering 
let filteredDataPASlider = {};
// store value of the activity and path sliders here sliders.activity, sliders.path
let sliders = {path: 1, activity: 1}



// this to populate the following
// data.timestamps
// data.count
// data.versions
// data.drifts
data.count = 0
data.timestamps = []
data.versions = []
data.drifts = []

const parseTimestampPrimary = d3.timeParse("%Y-%m-%d %H:%M:%S.%f%Z");
const parseTimestampFallback = d3.timeParse("%Y-%m-%d %H:%M:%S");

function parseTimestamp(value) {
    return parseTimestampPrimary(value) || parseTimestampFallback(value);
}

function getDFGOptions() {
    return {
        performanceMode,
        selectionType: selectionContext,
        baseData: data
    };
}

function updatePerformanceMenuActive() {
    const menu = document.getElementById("performance-mode-menu");
    if (!menu) return;
    menu.querySelectorAll("button").forEach(btn => {
        const active = btn.dataset.mode === performanceMode;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
}

function initPerformanceMenu() {
    const menu = document.getElementById("performance-mode-menu");
    if (!menu || menu.dataset.bound === "true") return;
    menu.dataset.bound = "true";
    menu.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const mode = btn.dataset.mode;
            if (!mode) return;
            performanceMode = mode;
            updatePerformanceMenuActive();
            // redraw with current data context
            if (filteredData === undefined) {
                updatePathAndActivitySlidersD(data);
            } else {
                updatePathAndActivitySlidersD(filteredData);
            }
        });
    });
    updatePerformanceMenuActive();
}

Promise.all([
    // d3.csv("data/bose_log_metadata.csv"),
    // d3.csv("data/bose_log_relations_matrix.csv")
        d3.csv("data/Road_Traffic_Fine_Management_Process_metadata.csv"),
        d3.csv("data/Road_Traffic_Fine_Management_Process_df_relations_matrix.csv")
]).then(([windowMetadata, relationsMatrix]) => {
    // populate timeline related arrays from the metadata file
    data.count = windowMetadata.length;
    data.count_actual = data.count; // until forecasts are added, everything is treated as actual
    data.timestamps = windowMetadata.map(row => parseTimestamp(row.timestamp));
    data.versions = windowMetadata.map(row => +row.version);
    data.drifts = windowMetadata.map(row => +row.drift);
    data.series_sum = new Array(data.count).fill(0);

    const seriesColumns = Object.keys(relationsMatrix[0])
        .filter(key => key !== 'idx' && key !== 'act1' && key !== 'act2');

    relationsMatrix.forEach(row => {
        const temp = {};
        temp.series = seriesColumns.map(key => {
            const value = +row[key];
            const idx = parseInt(key, 10);
            if (!Number.isNaN(idx)) {
                data.series_sum[idx] += value;
            }
            return value;
        });

        temp.act1 = row.act1;
        temp.act2 = row.act2;
        temp.technique = row.technique || 'matrix';
        temp.series_sum_each_arc = d3.sum(temp.series);
        temp.series_sum_each_arc_raw = temp.series_sum_each_arc;
        data.dfrs.push(temp);
    });

    console.log("---------dfg");
    console.log(data);

    normalizeEdgeSums(data);
    data.activity_count = calculateActivitiesImportance(data);

    initPerformanceMenu();
    drawDFG(data, getDFGOptions());
    drawLineplot(data, data.count_actual / data.count);
}).catch(function(error){
    console.log('cannot import file', error);
});

// this function receives the selections of the 1-2 brushes of the linechart
// it then updates the dfg 
function updateSelection(selections_dates){
    console.log(selections_dates)
    const normalizedSelections = selections_dates.map(sel => {
        if (Array.isArray(sel)) {
            return { startDate: sel[0], endDate: sel[1] };
        }
        return sel;
    }).filter(Boolean);

    const getStartDate = (sel) => {
        if (sel.startDate) { return sel.startDate; }
        if (sel.indices && sel.indices.length > 0) {
            return data.timestamps[Math.min(...sel.indices)];
        }
        return data.timestamps[0];
    };

    normalizedSelections.sort((a, b) => getStartDate(a) - getStartDate(b));

    if (normalizedSelections.length === 0) {
        selectionContext = "none";
        filteredData = undefined;
        updatePathAndActivitySlidersD(data);
        return;
    }

    function getFilteredDataForSelection(selection) {
        if (!selection) return undefined;
        if (selection.indices && selection.indices.length > 0) {
            return filterDataByIndices(selection.indices);
        }
        if (selection.version !== undefined) {
            const indices = [];
            for (let i = 0; i < data.versions.length; i += 1) {
                if (data.versions[i] === selection.version) {
                    indices.push(i);
                }
            }
            return filterDataByIndices(indices);
        }
        if (selection.startDate && selection.endDate) {
            return filterDataByDate([selection.startDate, selection.endDate]);
        }
        return undefined;
    }

    // for the case of one brush only
    if (normalizedSelections.length === 1){
        selectionContext = "single";
        filteredData = getFilteredDataForSelection(normalizedSelections[0]);
        if (!filteredData) { return; }
        updatePathAndActivitySlidersD(filteredData);
    }
    else { // here is when two regions are brushed
        selectionContext = "double";
        let filteredData1 = getFilteredDataForSelection(normalizedSelections[0]);
        let filteredData2 = getFilteredDataForSelection(normalizedSelections[1]);
        if (!filteredData1 || !filteredData2) { return; }
        // ensure first is earlier for diff computation
        if (filteredData1.timestamps[0] > filteredData2.timestamps[0]) {
            [filteredData1, filteredData2] = [filteredData2, filteredData1];
        }
        filteredData = differenceData(filteredData1, filteredData2);
        console.log('difference between calculated');
        // in case the path and activity sliders are also not in their default 
        // perform those filters and :
        updatePathAndActivitySlidersD(filteredData);
        // drawDFG(filteredData);
    }
}

function updatePathAndActivitySliders(pathSlider, activitySlider){
    // here is when path slider is transwered
    if (pathSlider != undefined){
        sliders.path = pathSlider
    }
    // here is the activities have to filtered 
    else if (activitySlider != undefined) {
        sliders.activity = activitySlider
    }

    console.log("sliders values:  _------>");
    console.log(sliders);

    if (filteredData === undefined) {
        updatePathAndActivitySlidersD(data)
    } else {
        updatePathAndActivitySlidersD(filteredData)
    }
}

function updatePathAndActivitySlidersD(d) {

    console.log('')

    if (Math.abs(sliders.activity - 1) < 0.01 && Math.abs(sliders.path - 1) < 0.01) {
        // if both are 1 then nothing to do here just show the original data
        console.log('drawing dfg right away, nothing to filter with sliders')
        drawDFG(d, getDFGOptions());
    } else {
        if (Math.abs(sliders.activity - 1) < 0.01 && sliders.path < 1) {
            // if path slider is less than 1 but the activity not we just filter for paths
            filteredDataPASlider = filterDataByPathSlider(d)
            
            console.log('in the PATH SLIDER -<<<<<<<')
            console.log(filteredDataPASlider)
            console.log(data)

        } else if (sliders.activity < 0 && Math.abs(sliders.path - 1) < 0.01) {
            // if activity is less than 1 and path is 1
            // we only filter for activities
            filteredDataPASlider = filterDataByActivitySlider(d)
        } else {
            // if both activitie and paths should be filtered:
            // first we filter activities
            filteredDataPASlider = filterDataByActivitySlider(d)
            // then we filter paths
            filteredDataPASlider = filterDataByPathSlider(filteredDataPASlider)
        }
        
        console.log('filteredDataPASlider')
        console.log(filteredDataPASlider)

        drawDFG(filteredDataPASlider, getDFGOptions());
        delete filteredDataPASlider; 
    }
}


// this function filters the dataset by the dates, and returns the complete new set of datavalues from that filtered region
function filterDataByDate(dates){
    let temp_data = {}
    temp_data.dfrs = []

    // console.log("filter function")
    // console.log(data)           
    // console.log(dates)

    temp_data.timestamps = data.timestamps.filter(function (t) {
        return t >= dates[0] && t <= dates[1]
    })
    temp_data.count = temp_data.timestamps.length;
    temp_data.count_actual = temp_data.timestamps.length;

    // console.log(temp_data.timestamps)

    let temp_timestamp_in_range_first = 0
    while (data.timestamps[temp_timestamp_in_range_first] < dates[0]){
        temp_timestamp_in_range_first += 1
    }
    let temp_timestamp_in_range_second = temp_timestamp_in_range_first + temp_data.timestamps.length

    // console.log(temp_timestamp_in_range_first)
    // console.log(temp_timestamp_in_range_second)

    for (let elem of data.dfrs){
        temp = []
        temp.series = []
        for(let j = temp_timestamp_in_range_first ; j < temp_timestamp_in_range_second ; j+=1){
            temp.series.push(elem.series[j])
        }
        temp.act1 = elem.act1
        temp.act2 = elem.act2
        temp.technique = elem.technique     
        temp.series_sum_each_arc = d3.sum(temp.series)
        temp.series_sum_each_arc_raw = temp.series_sum_each_arc
        temp_data.dfrs.push(temp) 
        

    }

    console.log(temp_data)
    temp_data.activity_count = {}
    temp_data.activity_count = calculateActivitiesImportance(temp_data)

    console.log(temp_data)
    normalizeEdgeSums(temp_data)
    return temp_data;
}

function filterDataByIndices(indices){
    let temp_data = {}
    temp_data.dfrs = []
    const sortedIndices = indices.slice().sort((a, b) => a - b);

    temp_data.timestamps = sortedIndices.map(i => data.timestamps[i]);
    temp_data.versions = sortedIndices.map(i => data.versions[i]);
    temp_data.drifts = sortedIndices.map(i => data.drifts[i]);
    temp_data.count = sortedIndices.length;
    temp_data.count_actual = sortedIndices.length;

    for (let elem of data.dfrs){
        let temp = {};
        temp.series = [];
        for (let idx of sortedIndices){
            temp.series.push(elem.series[idx]);
        }
        temp.act1 = elem.act1;
        temp.act2 = elem.act2;
        temp.technique = elem.technique;
        temp.series_sum_each_arc = d3.sum(temp.series);
        temp.series_sum_each_arc_raw = temp.series_sum_each_arc;
        temp_data.dfrs.push(temp);
    }

    temp_data.activity_count = {}
    temp_data.activity_count = calculateActivitiesImportance(temp_data)
    normalizeEdgeSums(temp_data)
    return temp_data;
}

function normalizeEdgeSums(dataset) {
    const count = Math.max(1, dataset.count_actual || dataset.count || 1);
    dataset.dfrs.forEach(edge => {
        if (edge.series_sum_each_arc_raw === undefined) {
            edge.series_sum_each_arc_raw = edge.series_sum_each_arc || 0;
        }
        const raw = edge.series_sum_each_arc_raw || 0;
        const normalized = raw / count;
        edge.series_sum_each_arc_normalized = normalized;
        // keep series_sum_each_arc as the raw count for visualization in single-model mode
        edge.series_sum_each_arc = edge.series_sum_each_arc_raw;
    });
}

function normalizeActivityCountsMap(activityCounts, count) {
    const denom = Math.max(1, count || 1);
    const normalized = {};
    Object.keys(activityCounts || {}).forEach(key => {
        normalized[key] = (activityCounts[key] || 0) / denom;
    });
    return normalized;
}


function differenceData(new_data_1, new_data_2){
    const countPrev = Math.max(1, new_data_1.count_actual || new_data_1.count || 1);
    const countNext = Math.max(1, new_data_2.count_actual || new_data_2.count || 1);
    const prevActivityAvg = normalizeActivityCountsMap(new_data_1.activity_count || {}, countPrev);
    const nextActivityAvg = normalizeActivityCountsMap(new_data_2.activity_count || {}, countNext);
    for (let i = 0 ; i < new_data_1.dfrs.length ; i += 1){
        const prevRaw = new_data_1.dfrs[i].series_sum_each_arc_raw || new_data_1.dfrs[i].series_sum_each_arc || 0;
        const nextRaw = new_data_2.dfrs[i].series_sum_each_arc_raw || new_data_2.dfrs[i].series_sum_each_arc || 0;
        const prevNorm = prevRaw / countPrev;
        const nextNorm = nextRaw / countNext;
        const diffPercent = (prevNorm === 0)
            ? (nextNorm > 0 ? Infinity : 0)
            : ((nextNorm - prevNorm) / prevNorm) * 100;

        new_data_2.dfrs[i].series_sum_each_arc_prev = prevNorm;
        new_data_2.dfrs[i].series_sum_each_arc_next = nextNorm;
        new_data_2.dfrs[i].series_sum_each_arc_prev_raw = prevRaw;
        new_data_2.dfrs[i].series_sum_each_arc_next_raw = nextRaw;
        new_data_2.dfrs[i].series_sum_each_arc_diff = diffPercent;
        // use max of the two normalized values for sizing in diff view
        new_data_2.dfrs[i].series_sum_each_arc = Math.max(prevNorm, nextNorm);
        new_data_2.dfrs[i].series_sum_each_arc_raw = Math.max(prevRaw, nextRaw);
    }

    new_data_2.activity_count_prev = new_data_1.activity_count;
    new_data_2.activity_count_prev_avg = prevActivityAvg;
    new_data_2.activity_count_avg = nextActivityAvg;
    new_data_2.count_prev = countPrev;

    console.log(new_data_2);
    return new_data_2;
}


// we filter here for sliders.path and sliders.activity sliders' results
function filterDataByActivitySlider(d) {
    let filteredBySliders = {}
    // it means that the line chart was brushed
    console.log('in the filter data by activityes slider function')

    // first goes filtering with the activities

    // // this loop collects activities that are exectuted alongsize with the cordinalities 
    // for (let i=0; i < d.dfrs.length ; i+=1){
    //     if (d.dfrs[i].act1 in activities_filter) {
    //         activities_filter[d.dfrs[i].act1] += d.dfrs[i].series_sum_each_arc; 
    //     } else { 
    //         activities_filter[d.dfrs[i].act1] = d.dfrs[i].series_sum_each_arc 
    //     }

    //     if (d.dfrs[i].act2 in activities_filter) {
    //         activities_filter[d.dfrs[i].act2] += d.dfrs[i].series_sum_each_arc; 
    //     } else { 
    //         activities_filter[d.dfrs[i].act2] = d.dfrs[i].series_sum_each_arc 
    //     }
    // }

    // Create items array
    var activities_filter_array = Object.keys(d.activity_count).map(function(key) {
        return [key, d.activity_count[key]];
    });
    // after sorting one can see which activities are used the most and which the least.
    activities_filter_array.sort(function(first, second) {
        if (first[0] === 'start' || first[0] === 'end') {
            return -1;
        } else if (second[0] === 'start' || second[0] === 'end'){
            return 1;
        }
        return second[1] - first[1];
    }) 

    console.log(activities_filter_array)
    console.log(Infinity)
    // this will only leave the right number of elements
    activities_filter_array = activities_filter_array.slice(0, Math.round(sliders.activity * activities_filter_array.length))
    let set_activities_filter = new Set(activities_filter_array.map(function(key) {return key[0]}))

    // we take all those arcs that both of the activities that the arc is connecting are in our list of prioritized activities
    let temp_dfrs = []
    for (let i = 0 ; i < d.dfrs.length ; i += 1) { 
        if ((set_activities_filter.has(d.dfrs[i].act1)) && 
            (set_activities_filter.has(d.dfrs[i].act2))){
                temp_dfrs.push(d.dfrs[i])
        }
    }
    //save in the new variable 
    filteredBySliders.count = d.count
    filteredBySliders.count_actual = d.count_actual
    filteredBySliders.timestamps = d.timestamps
    filteredBySliders.series_sum = d.series_sum
    filteredBySliders.dfrs = temp_dfrs
    console.log(d)
    console.log('123412341234123412341234<<_<_<_<_<_')
    console.log(filteredBySliders)
    filteredBySliders.activity_count = d.activity_count
    filteredBySliders.activity_count_prev = d.activity_count_prev
    filteredBySliders.activity_count_avg = d.activity_count_avg
    filteredBySliders.activity_count_prev_avg = d.activity_count_prev_avg
    filteredBySliders.count_prev = d.count_prev
    console.log(filteredBySliders)
    return filteredBySliders;
}

function filterDataByPathSlider(d) {
    let filteredBySliders = {}
    // here goes filtering with the paths
    d.dfrs.sort(function(first, second) {
        return second.series_sum_each_arc - first.series_sum_each_arc;
    })    
    temp_dfrs = d.dfrs.slice(0, Math.round(sliders.path * d.dfrs.length))

    filteredBySliders.count = d.count
    filteredBySliders.count_actual = d.count_actual
    filteredBySliders.timestamps = d.timestamps
    filteredBySliders.series_sum = d.series_sum
    filteredBySliders.dfrs = temp_dfrs
    filteredBySliders.activity_count = d.activity_count
    filteredBySliders.activity_count_prev = d.activity_count_prev
    filteredBySliders.activity_count_avg = d.activity_count_avg
    filteredBySliders.activity_count_prev_avg = d.activity_count_prev_avg
    filteredBySliders.count_prev = d.count_prev
    return filteredBySliders;
  
}


function calculateActivitiesImportance(d){
    // this loop collects activities that are exectuted alongsize with the cordinalities 
    
    activity_count = {}

    activity_count['end'] = 0
    for (let i=0; i < d.dfrs.length ; i+=1) {
        activity_count[d.dfrs[i].act1] = 0
    }

    for (let i=0; i < d.dfrs.length ; i+=1){
        if (d.dfrs[i].act1 in activity_count) {
            activity_count[d.dfrs[i].act1] += d.dfrs[i].series_sum_each_arc; 
        }
        if (d.dfrs[i].act2 === 'end' && d.dfrs[i].act2 in activity_count) {
            activity_count['end'] += d.dfrs[i].series_sum_each_arc
        }

    }
    console.log('1111111111111111111111111111111111111111111111111111111111')

    return activity_count
}
