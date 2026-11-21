/* Path2Safe Reunite: bundled reference data (works offline).
   Live hazard polygons are downloaded at runtime from DOGAMI / Multnomah County (see app.js CFG). */
window.P2S_DATA = {
  /* Willamette River crossings. Positions are approximate span midpoints.
     quake: "resilient" = designed to remain usable after a major Cascadia quake; "closed" = assume unusable.
     Sources: Multnomah County (Sellwood seismic design; "none of downtown Portland's Willamette River vehicular
     bridges will be immediately usable"), KGW bridge summary (Tilikum: minor damage). Columbia crossings assumed closed. */
  bridges: [
    { id: "sellwood", name: "Sellwood Bridge", lat: 45.46444, lng: -122.66556, quake: "resilient", modes: { foot: 1, bike: 1, car: 1 }, note: "Opened 2016; designed to stay standing in a major quake." },
    { id: "tilikum", name: "Tilikum Crossing", lat: 45.50556, lng: -122.66500, quake: "resilient", modes: { foot: 1, bike: 1, car: 0 }, note: "Opened 2015; built for seismic resilience. Transit, bikes and people on foot only, no cars." },
    { id: "rossisland", name: "Ross Island Bridge", lat: 45.4955, lng: -122.6655, quake: "closed", modes: { foot: 1, bike: 1, car: 1 } },
    { id: "marquam", name: "Marquam Bridge (I-5)", lat: 45.5087, lng: -122.6688, quake: "closed", modes: { foot: 0, bike: 0, car: 1 } },
    { id: "hawthorne", name: "Hawthorne Bridge", lat: 45.5131, lng: -122.6716, quake: "closed", modes: { foot: 1, bike: 1, car: 1 } },
    { id: "morrison", name: "Morrison Bridge", lat: 45.5175, lng: -122.6693, quake: "closed", modes: { foot: 1, bike: 1, car: 1 } },
    { id: "burnside", name: "Burnside Bridge", lat: 45.5230, lng: -122.6670, quake: "closed", modes: { foot: 1, bike: 1, car: 1 }, note: "Earthquake Ready Burnside Bridge replacement is still in design; construction start not yet set." },
    { id: "steel", name: "Steel Bridge", lat: 45.5275, lng: -122.6695, quake: "closed", modes: { foot: 1, bike: 1, car: 1 } },
    { id: "broadway", name: "Broadway Bridge", lat: 45.5317, lng: -122.6760, quake: "closed", modes: { foot: 1, bike: 1, car: 1 } },
    { id: "fremont", name: "Fremont Bridge (I-405)", lat: 45.5379, lng: -122.6834, quake: "closed", modes: { foot: 0, bike: 0, car: 1 } },
    { id: "stjohns", name: "St. Johns Bridge", lat: 45.5851, lng: -122.7647, quake: "closed", modes: { foot: 1, bike: 1, car: 1 } },
    { id: "i5", name: "Interstate Bridge (I-5)", lat: 45.6186, lng: -122.6748, quake: "closed", modes: { foot: 1, bike: 1, car: 1 } },
    { id: "i205", name: "Glenn Jackson Bridge (I-205)", lat: 45.5926, lng: -122.5508, quake: "closed", modes: { foot: 1, bike: 1, car: 1 } },
    /* Clackamas County crossings of the Willamette (ODOT, 2024-2026) */
    { id: "abernethy", name: "Abernethy Bridge (I-205, Oregon City)", lat: 45.3645, lng: -122.6135, quake: "resilient", modes: { foot: 0, bike: 0, car: 1 }, note: "ODOT seismic upgrade to make it the first earthquake-ready interstate bridge over the Willamette in the Portland area; final work scheduled for 2026. Freeway: no walking." },
    { id: "ocarch", name: "Oregon City Arch Bridge (OR 43)", lat: 45.35917, lng: -122.60972, quake: "closed", modes: { foot: 1, bike: 1, car: 1 }, note: "ODOT (2024): not expected to survive a major earthquake." },
    { id: "boone", name: "Boone Bridge (I-5, Wilsonville)", lat: 45.2993, lng: -122.7700, quake: "closed", modes: { foot: 0, bike: 0, car: 1 }, note: "ODOT (2024): not earthquake-ready; replacement planned." }
  ],

  /* Approximate river centerlines [lat,lng] (Willamette from Wilsonville to the Columbia; the Clackamas and Tualatin rivers aren't modelled). Used only so offline routing can't "swim" across;
     a route may cross only where an open bridge is. */
  rivers: [
    { name: "Willamette", pts: [[45.270,-122.950],[45.280,-122.850],[45.293,-122.800],[45.2993,-122.7700],[45.302,-122.745],[45.308,-122.718],[45.318,-122.700],[45.337,-122.668],[45.344,-122.640],[45.352,-122.617],[45.35917,-122.6100],[45.3645,-122.6135],[45.374,-122.618],[45.395,-122.640],[45.412,-122.652],[45.440,-122.655],[45.4644,-122.6656],[45.480,-122.6660],[45.4955,-122.6655],[45.5056,-122.6650],[45.5087,-122.6688],[45.5131,-122.6716],[45.5175,-122.6693],[45.5230,-122.6670],[45.5275,-122.6695],[45.5317,-122.6760],[45.5379,-122.6834],[45.5500,-122.7050],[45.5650,-122.7300],[45.5851,-122.7647],[45.6050,-122.7800],[45.6300,-122.7700],[45.6480,-122.7630]] },
    { name: "Columbia", pts: [[45.700,-122.780],[45.6480,-122.7630],[45.6300,-122.7200],[45.6186,-122.6748],[45.6050,-122.6200],[45.5926,-122.5508],[45.5800,-122.4700],[45.5650,-122.3800]] }
  ],

  /* Portland BEECN sites (Basic Earthquake Emergency Communication Nodes): staffed ham-radio help points
     PBEM aims to open 24-48 hours after a major quake. Pulled from PortlandMaps open data layer 92 (50 sites), Nov 2026. */
  beecn: [
    ["Parkrose High School Field",45.55244,-122.54226],["Ainsworth Elementary School Field",45.51002,-122.70025],["Chapman Elementary School Field",45.53322,-122.70637],["ACCESS Academy Field",45.47828,-122.67617],["Lair Hill Park",45.50156,-122.68022],["Stephenson Elementary School Field",45.44138,-122.70313],["Riverdale High School Field",45.45447,-122.68528],["Hamilton Park",45.49113,-122.72268],["West Portland United Methodist Church",45.45517,-122.7258],["Holly Farm Park",45.44716,-122.72623],["St Johns Park",45.59276,-122.75179],["University of Portland Public Safety",45.57509,-122.73013],["Duniway Elementary School Field",45.46797,-122.62848],["Woodstock Park",45.48318,-122.61145],["Harrison Park",45.5089,-122.57579],["Montavilla Park",45.52836,-122.57825],["Alberta Park",45.56583,-122.64525],["Woodlawn Park",45.57219,-122.65424],["Rigler SUN Community School Field",45.55624,-122.6091],["Roseway Heights School Field",45.54319,-122.58817],["Wilkes Park",45.54981,-122.50449],["Lincoln Memorial Cemetery Parking Lot",45.45933,-122.54343],["Clatsop Butte Park",45.47237,-122.50627],["Flavel Park",45.46801,-122.58598],["Lents Park",45.48967,-122.56998],["Arbor Lodge Park",45.57228,-122.69433],["Jefferson High School Field",45.55955,-122.67231],["Irvington Elementary School Field",45.53955,-122.65275],["All Saints School Parking Lot",45.52734,-122.62392],["Gabriel Park",45.47515,-122.71613],["Ida B Wells High School Field",45.47659,-122.69141],["Sleep Train Parking Lot",45.61476,-122.68815],["Columbia Site Field",45.60039,-122.65922],["Ventura Park",45.51952,-122.54378],["Knott City Park",45.54015,-122.54708],["Forest Park Elementary School Field",45.54246,-122.77815],["Linnton Community Center Parking Lot",45.59842,-122.78526],["Greenspace at SW 12th/SW Market",45.51417,-122.68714],["The Fields",45.53313,-122.68202],["Lincoln High School Field",45.51929,-122.69057],["Glenfair Park",45.52386,-122.50543],["Parklane Church",45.51433,-122.49854],["Sellwood Middle School Field",45.462,-122.64977],["Brooklyn Park",45.49855,-122.65492],["Clinton Park",45.50245,-122.60489],["Colonel Summers Park",45.51552,-122.64789],["Mill Park",45.50955,-122.53967],["Gilbert Heights Elementary School Field",45.49125,-122.53159],["Elizabeth Caruthers Park",45.49775,-122.67166],["Harbor Way Median",45.50972,-122.67562]
  ],

  /* Sample family for demo mode (fictional people, real Portland places). */
  demo: {
    home: { name: "Home", lat: 45.4840, lng: -122.6120 },
    members: [
      { name: "Alex", note: "At work downtown", lat: 45.5189, lng: -122.6795, status: "ok" },
      { name: "Sam", note: "At school in Sellwood", lat: 45.4710, lng: -122.6540, status: "ok" },
      { name: "Jordan", note: "Shopping at Gateway", lat: 45.5320, lng: -122.5640, status: "help" }
    ]
  }
};
