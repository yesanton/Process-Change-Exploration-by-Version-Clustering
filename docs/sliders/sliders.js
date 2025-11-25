// for further help with sliders, documentation is here https://github.com/johnwalley/d3-simple-slider

const div_sizes = document.getElementById('SliderDivId1').getBoundingClientRect();
const sliderHeight = Math.min(div_sizes.height - 70, Math.max(220, div_sizes.height * 0.76));
const sliderYOffset = (div_sizes.height - sliderHeight) / 2 - 18; // breathing room for labels
const sharedColors = ['#0ea5e9', '#6366f1'];

function applySliderStyle(svg, title, colors) {
    const gradientId = `slider-gradient-${title.replace(/\s+/g, '-').toLowerCase()}`;

    const defs = svg.append('defs');
    const shadow = defs.append('filter')
        .attr('id', `${gradientId}-shadow`)
        .attr('x', '-20%')
        .attr('y', '-20%')
        .attr('width', '140%')
        .attr('height', '140%');
    shadow.append('feDropShadow')
        .attr('dx', 0)
        .attr('dy', 2)
        .attr('stdDeviation', 1.6)
        .attr('flood-color', colors[1])
        .attr('flood-opacity', 0.25);

    const gradient = defs.append('linearGradient')
        .attr('id', gradientId)
        .attr('x1', '0%')
        .attr('x2', '0%')
        .attr('y1', '0%')
        .attr('y2', '100%');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', colors[0]);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', colors[1]);

    svg.classed('refined-slider', true);
    svg.selectAll('.track')
        .attr('stroke', `url(#${gradientId})`)
        .attr('stroke-width', 9)
        .attr('stroke-linecap', 'round')
        .attr('opacity', 1);
    svg.selectAll('.track-inset')
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', 7)
        .attr('stroke-linecap', 'round')
        .attr('opacity', 1);
    svg.selectAll('.track-overlay')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 24);

    svg.selectAll('.handle')
        .attr('d', d3.symbol().type(d3.symbolCircle).size(220))
        .attr('fill', '#6b7280')       // toned-down gray handle
        .attr('stroke', '#4b5563')     // slightly darker edge
        .attr('stroke-width', 1)
        .attr('opacity', 0.92)
        .attr('filter', `url(#${gradientId}-shadow)`);

    svg.selectAll('.tick text')
        .attr('fill', '#4a5568')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('opacity', 0); // hide default tick labels; custom labels added below

    svg.selectAll('.tick line')
        .attr('stroke', '#cbd5e0')
        .attr('stroke-width', 1);

    svg.append('text')
        .attr('x', div_sizes.width / 2)
        .attr('y', sliderYOffset - 32)
        .attr('text-anchor', 'middle')
        .attr('fill', '#1f2937')
        .attr('font-size', '12px')
        .attr('font-weight', '700')
        .text(title);

    // static top/bottom labels
    svg.append('text')
        .attr('x', div_sizes.width / 2)
        .attr('y', sliderYOffset - 14)
        .attr('text-anchor', 'middle')
        .attr('fill', '#4b5563')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text('100%');
    svg.append('text')
        .attr('x', div_sizes.width / 2)
        .attr('y', sliderYOffset + sliderHeight + 28)
        .attr('text-anchor', 'middle')
        .attr('fill', '#4b5563')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text('0%');
}

var pathSlider = d3
    .sliderVertical()
    .min(0)
    .max(1)
    .step(0.01)
    .width(div_sizes.width)
    .height(sliderHeight)
    .tickFormat(d3.format('.0%'))
    .ticks(0)
    .tickPadding(0)
    .default(1)
    .displayValue(false)
    .on('onchange', (valPath) => {
        // do somethng with the value 
        updatePathAndActivitySliders(
            // scaless are used in order to allow for the lower values of the percentage
            // to still have some paths and activities
            d3.scaleLinear()   
                .domain([0, 1]) // unit: km
                .range([0.1, 1])(valPath), 
            undefined);
    });

var activitySlider = d3
    .sliderVertical()
    .min(0)
    .default(1)
    .max(1)
    .step(0.01)
    .width(div_sizes.width)
    .height(sliderHeight)
    .ticks(2)
    .tickPadding(0)
    .tickFormat(d3.format('.0%'))
    .displayValue(false)
    .on('onchange', (valActivity) => {
        // do something with the value 
        
        updatePathAndActivitySliders(undefined, 
            d3.scaleLinear()   
                .domain([0, 1]) // unit: km
                .range([0.1, 1])(valActivity)
            );
    });

console.log('------------->')
let pathSliderSvg = d3.select('#SliderId1')
    // .append('svg')
    .attr('width', div_sizes.width)
    .attr('height', div_sizes.height)
    pathSliderSvg
    .append('g')
    .attr('transform', 'translate(' + div_sizes.width /2  +',' + sliderYOffset.toString() + ')')
    .call(pathSlider);
applySliderStyle(pathSliderSvg, 'Paths', sharedColors);


let activitySliderSvg = d3.select('#SliderId2')
    // .append('svg')
    .attr('width', div_sizes.width)
    .attr('height', div_sizes.height)
    activitySliderSvg
    .append('g')
    .attr('transform', 'translate(' + div_sizes.width /2  +',' + sliderYOffset.toString() + ')')
    .call(activitySlider);    
applySliderStyle(activitySliderSvg, 'Activities', sharedColors);
