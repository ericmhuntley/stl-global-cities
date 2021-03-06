// set map options
var options = {
    center: [0,0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 2,
    dragging: false,
    zoomControl: false,
    scrollWheelZoom: false,
    touchZoom: false
}

// define global variables
var map = L.map('map', options),
cities;
// set default year on load
var year = 2015;
// if true, graph will be hidden on mouseout
var graphHide = true;
// scale factor for proportional symbols
var scaleFactor = 0.018;
// minimum value for legend
var legendSymMin = 1000;
var breaks = [];
var graphToggle = true;

// prevent Leaflet interference with user scroll
map.on('focus', function() { map.scrollWheelZoom.enable(); map.touchZoom.enable();});
map.on('blur', function() { map.scrollWheelZoom.disable(); map.touchZoom.disable(); });


$(document).ready(function() {

  query = "SELECT * FROM public.un_cities_data";

  var tiles = L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png', {
      attribution: 'United Nations &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
      subdomains: 'abcd',
      minZoom: 0,
      maxZoom: 18
  });
  map.addLayer(tiles);

  $.getJSON('https://jeffs.carto.com/api/v2/sql?format=GeoJSON&q=' + query)
    .done(function(data) {
      var info = getMinMax(data);
      createPropSymbols(info.timestamps, data);
      createGraph(info.timestamps, data);
      createPropLegend(info.min, info.max);
      createGrowthLegend();
      createSlider(info.timestamps);
  })
  .fail(function() { alert("There has been a problem loading the data.")});
});

// function to generate an array of years at interval
function dateRange(min, max, int) {
  years = [];
  for(var i=min;i<=max;i+=5){
    years.push(i);
  }
  return years;
} // end dateRange();

function getMinMax(data) {
  var timestamps = dateRange(1950, 2025, 5);
  var min = Infinity;
  var max = -Infinity;

  for (features in data.features) {
    var properties = data.features[features].properties;
    for (i in timestamps) {
      var columnName = '_' + timestamps[i];
      if (properties[columnName] < min) {
        min = properties[columnName];
      }
      if (properties[columnName] > max) {
        max = properties[columnName];
      }
    }
  }
  return {
    timestamps : timestamps,
    min : min,
    max : max
  }
}

function getRadius(area) {
    var radius = Math.sqrt(area/Math.PI);
    return radius * 0.15;
}

function getClassBreaks(y) {

    var values = [];

    cities.eachLayer(function(layer) {
      var props = layer.feature.properties;
      pct_change = (props['_' + String(y)] - props['_' + String(y - 5)]) / props['_' + String(y - 5)];
      if (pct_change > 0) {
        var value = Number(pct_change);
        values.push(value);
      }
    });

    var breaks = ss.quantile(values, [0, 0.5, 1]);
    // breaks.unshift(0);
    breaks[0] = 0;
    console.log(breaks);
    return breaks;
} // end getClassBreaks();

// function to get the color value
function getColor(d, breaks) {
    if(d <= breaks[0]) {
      return 'rgba(123, 50, 148, 0.8)'
    } else if (d <= breaks[1]) {
      return 'rgba(229, 245, 224, 0.8)'
    } else if (d > breaks[1]) {
      return 'rgba(49, 163, 84, 0.8)'
    }
} // end getColor();

function createPropSymbols(timestamps, data) {

  cities = L.geoJson(data, {

      pointToLayer: function(feature,latlng) {
          return L.circleMarker(latlng, {
              color: 'white',
              weight: 1,
              fillOpacity: 0.7
          });
      },

      onEachFeature: function(feature, layer) {
          var props = feature.properties;

          layer.on('mouseover', function() {
              // layer.bindPopup(content).openPopup();
              layer.setStyle({
                  fillOpacity: 1
              });
          });

          layer.on('mouseout', function() {
              // layer.closePopup();
              layer.setStyle({
                  fillOpacity: 0.6
              });
          });
      }
    }).addTo(map);
  breaks = getClassBreaks(year);
  updatePropSymbols(year);
} // end createPropSymbols();


function updatePropSymbols(t) {

  var y = '_' + t;
  var y_prev = '_' + (t-5);
  // breaks = getClassBreaks(t);

  cities.eachLayer(function(layer) {
    var props = layer.feature.properties;
    if (props[y] > 0) {
      var radius = calcPropRadius(props[y]);
      var popupContent = '<h4>' + props['urbanagg'] + '</h4><hr><div class = "fact-chunk">' +
      '<h5>' + (props[y] / 1000).toFixed(1) + ' Million</h5>Population in ' + t + '</div><div class = "fact-chunk">' +
      '<h5>' + ((props[y] - props['_1950'])/props['_1950'] * 100).toFixed(1) + '%</h5>Growth 1950 - ' + t + '</div>';
      layer.setRadius(radius);
      layer.bindPopup(popupContent, {offset: new L.Point(0,-radius)});

      pctChange = (props[y] - props[y_prev]) / props[y_prev];
      layer.setStyle({
        fillColor: getColor(pctChange, breaks)
      });

      if (graphToggle == true) {
        // update graph and display
        layer.on('mouseover', function() {
            updateInfo(this);
            $('.info').show();
        });

        if (graphHide == true) {
          layer.on('mouseout', function() {
            $('info').hide();
          });
        }
      }
    }
  });
} //end updatePropSymbols();

function calcPropRadius(value) {
  var area = value * scaleFactor;
  return Math.sqrt(area/Math.PI)*2;
}

function createPropLegend(min, max) {

  if (min < legendSymMin) {
    min = legendSymMin;
  }

  function roundNumber(inNumber) {
    return (Math.round(inNumber/10) * 10);
  }

  var legend = L.control( { position: 'topright' } );

  legend.onAdd = function(map) {
    var legendContainer = L.DomUtil.create('div', 'legend');
    var symbolsContainer = L.DomUtil.create('div', 'symbolsContainer');
    var classes = [roundNumber(min), roundNumber((max-min)/2), roundNumber(max)];
    var lastRadius = 0;
    var currentRadius;
    var margin;

    L.DomEvent.addListener(legendContainer, "mousedown", function(e) {
      L.DomEvent.stopPropagation(e);
    });

    $(legendContainer).append("<h3 id=’legendTitle’>Population (in Millions)</h3><hr>");

    for (var i = 0; i <= classes.length-1; i++) {

      legendCircle = L.DomUtil.create("div", "legendCircle");
      currentRadius = calcPropRadius(classes[i]);
      margin = -currentRadius - lastRadius - 2;

      $(legendCircle).attr("style", "width: " + currentRadius*2 +
        "px; height: " + currentRadius*2 +
        "px; margin-left: " + margin + "px");
      $(legendCircle).append("<span class='legendValue'>" + Math.round(classes[i] / 1000) + "</span>");

      $(symbolsContainer).append(legendCircle);
      lastRadius = currentRadius;
    }

    $(legendContainer).append(symbolsContainer);
    return legendContainer;

  };

  legend.addTo(map);
} // end function createLegend()

function createGrowthLegend() {
    // var breaks = getClassBreaks(year);
    var growthLegend = L.control({position: 'topleft'});

    growthLegend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'growthLegend');
        return div;
    };

    growthLegend.addTo(map);
    updateGrowthLegend(year);
}

// function to update the legend
function updateGrowthLegend(t) {
    var timestamp = '_' + t;

    // breaks = getClassBreaks(t);
    //select legend class and fill with HTML title
    var growthLegend = $('.growthLegend').html("<h3>Rate of Growth</h3><hr><ul>");

    //for each class, append colored <span> and range
    for (var i = 0; i < breaks.length; i++) {
        var color = getColor(breaks[i], breaks);
        if (i == 0) {
          growthLegend.append('<li><span style="background:' + color + '"></span> ' +
              '< ' + (breaks[i] * 100).toFixed(1) + '%</li>');
        } else if (i == breaks.length-1) {
          growthLegend.append('<li><span style="background:' + color + '"></span> ' +
              '> ' + (breaks[i-1] * 100).toFixed(1) + '%</li>');
        } else {
          growthLegend.append('<li><span style="background:' + color + '"></span> ' +
              (breaks[i - 1] * 100).toFixed(1) + ' &ndash; ' +
              (breaks[i] * 100).toFixed(1) + '%</li>');

        }
    }
    growthLegend.append("</ul>");
}

function createGraph() {
    // create a leaflet control in the bottom right of the screen
    var info = L.control({position: 'bottomright'});

    // when info control is added
    info.onAdd = function(map) {
        // create a <div> of class 'info'
        var div = L.DomUtil.create('div', 'info');
        return div;
    }
    // add <div> to map
    info.addTo(map);
    // but hide it (until user mouses over a feature)
    $(".info").hide();
} //end function createGraph()

function createSlider(timestamps) {
    var sliderControl = L.control({ position: 'bottomleft'} );

    // when we add this control object to the map
    sliderControl.onAdd = function(map) {

      // create slider DOM element
      var slider = L.DomUtil.create('input', 'range-slider');
      // when the user clicks on the slider element
      L.DomEvent.addListener(slider, 'mousedown', function(e) {
          // prevent the click event from bubbling up to the map
          L.DomEvent.stopPropagation(e);
      });

      $(slider)
      .attr({'type': 'range',
        'max': timestamps[timestamps.length - 1],
        'min': timestamps[1],
        'step': 5,
        'value': year})
      .each(function() {
        var a = $(this).context;
        // var vals = a.max - a.min;
        for (var i = Number(a.min); i <= Number(a.max); i = i + 5) {
          var el = $('<label>' + i + '</label>');
          $(slider).append(el);
        }
      })
      .on('input change', function () {
        updatePropSymbols($(this).val());
        $('.temporal-legend').html("<h3 class = 'year-key'>" + this.value + "</h3>");
      });

      return slider;
    }

    // add the control object containing our slider element to the map
    sliderControl.addTo(map);
    createTemporalLegend(year);

} //end function createSlider()

function createTemporalLegend(startTimestamp) {
  var temporalLegend = L.control({position: 'bottomleft'});

  temporalLegend.onAdd = function(map) {
    var output = L.DomUtil.create('output', 'temporal-legend');
    $(output).html(function() {
      return "<h3 class='year-key'>" + startTimestamp + "</h3>";
    });
    return output;
  }

  temporalLegend.addTo(map);
} //end function createTemporalLegend()

function updateInfo(layer) {
    //create 'shortcut' variable to layer properties
    var props = layer.feature.properties;

      //create info box HTML content, establishing a header...
      var header = '<h3>' + props['urbanagg'] + ', ' + props['country'] + '</h3><hr>';
      $(".info").html(header);

      //Set size variables
      var m = {top: 10, right: 20, bottom: 20, left: 60},
      w = 400 - m.left - m.right,
      h = 200 - m.top - m.bottom;

      //Y-axis scale method
      var y = d3.scaleLinear()
          .range([h,0]);

      //X-axis scale method
      var x = d3.scaleLinear()
          .range([0, w]);

      //path constructor for line grapht data
      var valueLine = d3.line()
          .x(function(d) { return x(d.year); })
          .y(function(d) { return y(d.population); });

      //select div of class info and append an svg to contain line graph
      var svg = d3.select(".info")
          .append("svg")
              .attr("width", w + m.left + m.right)
              .attr("height", h + m.top + m.bottom + 30)
          .append("g")
              .attr("transform", "translate(" + m.left + "," + m.top + ")");

      //create empty data variable that will contain annual unemployment data
      //for a given feature.
      var data = [];
      var popMin = Number.POSITIVE_INFINITY;
      var popMax = Number.NEGATIVE_INFINITY;

      // for each year, add year and unemployment rate as properties of a data
      // variable.

      for (var i = 0; i < years.length; i++) {
          var pop = Number(props['_'+String(years[i])]);
          data.push({year: years[i], population: pop});

          // locate maximum and minimum unemployment values with which to set
          // Y-axis scale domain.
          if (pop < popMin) popMin = pop;
          if (pop > popMax) popMax = pop;
      }

      //Declare X axis constructor
      var xAxis = d3.axisBottom().scale(x)
          //Format tick labels as dates (i.e., no comma-separation)
          .tickFormat(d3.format("d"))
          //Display every year.
          .ticks(data.length);

      //Declare Y axis constructor
      var yAxis = d3.axisLeft().scale(y)
          .ticks(5);

      //Set X and Y axis scale domains
      x.domain([years[0], years[years.length-1]]);
      y.domain([popMin,popMax]);

      //Draw line graph
      var p = svg.append("path")
          .attr("d",valueLine(data))
          .attr("class", "line");

      // Set range for dashed line
      var dashBetweenX = [2015, 2050]
        path = p.node(),
        totalLen = path.getTotalLength();


      // find the corresponding line lengths
      var dashBetweenL = dashBetweenX.map(function(d,i){

        var beginning = 0,
            end = totalLen,
            target = null,
            d = x(d);

        // find the line lengths the correspond to our X values
        // stolen from @duopixel from http://bl.ocks.org/duopixel/3824661
        while (true){
          target = Math.floor((beginning + end) / 2);
          pos = path.getPointAtLength(target);
          if ((target === end || target === beginning) && pos.x !== d) {
              break;
          }
          if (pos.x > d) end = target;
          else if (pos.x < d) beginning = target;
          else break; //position found
        }

        return target;
      })

      // draw the dashes
      var sd =  dashBetweenL[0],
          dp = dashBetweenL[0],
          count = 0;
      while (dp < dashBetweenL[1]){
        dp += 2;
        sd += ", 2";
        count++;
      }

      if (count % 2 == 0)
        sd += ", 2";
      sd += ", " + (totalLen - dashBetweenL[1]);
      p.attr("stroke-dasharray", sd);

      //append X axis
      svg.append("g")
          .attr("class", "x axis")
          .attr("transform", "translate(0," + h + ")")
          .call(xAxis)
          .selectAll("text")
          // Rotate text 65 degrees
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", function(d) {
              return "rotate(-65)"
              });

      // Append Y Axis
      svg.append("g")
          .attr("class", "y axis")
          .attr("outerTickSize", 0)
          .call(yAxis);

  }
