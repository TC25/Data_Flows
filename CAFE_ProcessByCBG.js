// Originally written by TC: https://tc25.github.io/

// Load in Statewide Census Block Group data. You can change the path to a different state.
var CBG = ee.FeatureCollection("users/datadrivenlab/States_CBG/California_CBG");

// Quality control functions for the Landsat data
var getQABits = function(image, start, end, newName) {
    // Compute the bits we need to extract.
    var pattern = 0;
    for (var i = start; i <= end; i++) {
       pattern += Math.pow(2, i);
    }
    // Return a single band image of the extracted QA bits, giving the band
    // a new name.
    return image.select([0], [newName])
                  .bitwiseAnd(pattern)
                  .rightShift(start);
};

// A function to mask out pixels with cloud shadows.
var cloud_shadows = function(image) {
    // Select the QA band.
    var QA = image.select(['QA_PIXEL']);
    // Get the internal_cloud_algorithm_flag bit.
    return getQABits(QA, 4,4, 'Cloud_shadows').eq(0);
    // Return an image masking out cloudy areas.
};

// A function to mask out cloudy pixels.
var clouds = function(image) {
    // Select the QA band.
    var QA = image.select(['QA_PIXEL']);
    // Get the internal_cloud_algorithm_flag bit.
    return getQABits(QA, 3,3, 'Cloud').eq(0);
    // Return an image masking out cloudy areas.
};

//Implement cloudmask on image collection.
var cloudMask = function(image) {
    var cloud = clouds(image);
    var shadow = cloud_shadows(image);
    return image.updateMask(cloud).updateMask(shadow)
};

// New variable name for the CBG feature collection
var table = CBG;

// Load in Landsat Collection 2 data; Landsat 5 (LANDSAT/LT05/C02/T1_L2) 
// is available from from 1984-03-16 to 2012-05-05; 
// Landsat 7 (LANDSAT/LE07/C02/T1_L2) is available from 1999-05-28 to present;
// However, for scan line issues, I only use these for the years 2011 to 2012
// Landsat 8 (LANDSAT/LC08/C02/T1_L2) is available from 2013-03-18 to present

// var Landsat = ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
// var Landsat = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
var Landsat = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")

// Create a summer filter (this is based on the start and end day of the year (both inclusive)
// spanning June 1st to August 31st; modify for leap years and other seasons).
var sumFilter = ee.Filter.dayOfYear(152, 243);

// Filter Landsat scenes to the region of interest (CBGs), times period of interest (summer 2018 to 2022; final date is not inclusive)
// Then apply the cloud mask function and get the mean for all the images.
var Landsat=Landsat.filterBounds(table).filterDate('2018-01-01', '2023-01-01').filter(sumFilter).map(cloudMask).mean()

//Calculate NDVI (Normalized Difference Vegetation Index) by first using the scale and offset for the bands 
// and then implementing the normalized difference function
var Landsat_NDVI = Landsat.multiply(0.0000275).subtract(0.2).normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI')
//Note that you should use B4 and B3 for Landsat 5 and 7; B5 and B4 for Landsat 8 for calculating NDVI

//Extract Land Surface Temperature (LST) directly from Landsat; note the scaling factor and offset    
var Landsat_LST=Landsat.select(['ST_B10']).multiply(0.00341802).add(149)
 //Note that ST_B6 is the band to use for landsat 5 and 7; and ST_B10 for L8

// Uncomment if you want to interact with the results
// Map.addLayer(Landsat_LST, {min:265, max:295, palette:['green','yellow','red']})
// Map.addLayer(table.filterMetadata('unique_id','equals', 'Miami_444'))
// print(table.filterMetadata('unique_id','equals', 'Miami_444'))
// Map.addLayer(table.filterMetadata('unique_id','equals', 'Miami_444').first().geometry().centroid())
// print(Landsat_LST.reduceRegion({geometry: table.filterMetadata('unique_id','equals', 'Miami_444').first().geometry(), reducer: ee.Reducer.mean(),  scale: 60, maxPixels:9999999999999999}))
// print(Landsat_LST.clip(table.filterMetadata('unique_id','equals', 'Miami_444').first().geometry()).reduceRegion({geometry: table.filterMetadata('unique_id','equals', 'Miami_444').first().geometry().bounds(), reducer: ee.Reducer.mean(),  scale: 60, maxPixels:9999999999999999}))


// Function to generate spatial aggregation for LST and NDVI
var regions= function(feature){
   
   // Reduce region over each geometry in collection to get spatial means; can be replaced with a different statistical summary
   // Scale can be modified depending on the native resolution of the data source; here 60 m is between the 30 m for NDVI and around 100 m for LST
    var Landsat_LST2=Landsat_LST.reduceRegion({geometry: feature.geometry(), reducer: ee.Reducer.mean(),  scale: 60, maxPixels:9999999999999999});
    var Landsat_NDVI2=Landsat_NDVI.reduceRegion({geometry: feature.geometry(), reducer: ee.Reducer.mean(),  scale: 60, maxPixels:9999999999999999});
 
    // ST_B6 for landsat 5 and 7; ST_B10 for L8
    var LST=ee.Algorithms.If(Landsat_LST2.contains('ST_B10'),ee.Number(Landsat_LST2.get('ST_B10')),ee.Number(-9999));

    // var LST=ee.Algorithms.If(Landsat_LST2.contains('ST_B6'),ee.Number(Landsat_LST2.get('ST_B6')),ee.Number(-9999));
    var NDVI=ee.Algorithms.If(Landsat_NDVI2.contains('NDVI'),ee.Number(Landsat_NDVI2.get('NDVI')),ee.Number(-9999));

    return feature.set({'LST':LST,'NDVI':NDVI})
    
}

// Map function over CBGs to extract LST and NDVI and then subset the columns and remove geometry to reduce size (to export as table) 
var table_Dat=table.map(regions).select({propertySelectors:['LST','NDVI','GEOID','NAME','Pop','Income'],retainGeometry:false})

// Export as a CSV to your Google Drive; You can also keep retainGeometry as True and export as GeoJSON by changing the fileFormat option below
Export.table.toDrive({collection:table_Dat, description:'Fin_export', folder:'CBG_data', fileNamePrefix:'Landsat_direct_Summer_2018_2022', fileFormat:'CSV'})

//--------------------------------------
