/**
* Copyright (c) Leonardo Becker da Luz and Grazieli Rodigheri 2023
* 
* Leonardo Becker da Luz
* leobeckerdaluz@gmail.com
* National Institute for Space Research (INPE)
* 
* Grazieli Rodigheri
* grazielirodigheri@gmail.com
* Federal University of Rio Grande do Sul (UFRGS)
* 
* This source code is licensed under the MIT license found in the LICENSE file 
* in the root directory of this source tree.
* ____________________________________________________________________________
* 
* This code has an example of the use of the two main NPP functions developed 
* (singleNPP and collectionNPP). After obtaining the NDVI, LST, SOL and We
* collections and setting the constants Topt and LUEmax, the NPP is computed 
* for each set of images using the collectionNPP function. The first image of 
* each collection is also used to exemplify the computation of only one NPP 
* image by using the singleNPP function.
*/


 
// ====================================================================================
// Region of Interest (ROI)
var ROI = ee.FeatureCollection("users/leobeckerdaluz/FIXED_shapes/mesoregionRS") 
Map.addLayer(ROI, {}, 'ROI')
Map.centerObject(ROI)



// ====================================================================================
// Set scale (m/px) to upscale/downscale NDVI, LST, SOL and We images
var SCALE_M_PX = 250
// var SCALE_M_PX = 1000



// ====================================================================================
// Required dates
var dates = ee.List(['2018-01-01','2018-01-17','2018-02-02','2018-02-18'])
var startDate = ee.Date(dates.get(0))
var endDate = ee.Date(dates.get(-1)).advance(1,"day")



// ====================================================================================
// Palette to show on map
var pal = ['lightgreen','darkgreen','yellow','orange','red','darkred']
// var pal = ['red','white','darkgreen']



// ====================================================================================
// NDVI collection
var collectionNDVI = ee.ImageCollection('MODIS/061/MOD13Q1')
  .filterBounds(ROI)
  .filterDate(startDate, endDate)
  .select('NDVI')
  .map(function(img){
    return img
      .clip(ROI)
      .rename('NDVI')                               // Rename band
      .multiply(0.0001)                             // Apply band scale
      .reproject('EPSG:4326', null, SCALE_M_PX)     // Downscale/Upscale image
      .set("date", img.date().format("yyyy-MM-dd")) // Set date property
  })

Map.addLayer(collectionNDVI.first(), {min:0.2,max:1.0,palette:pal}, 'IN - collectionNDVI img1')



// ====================================================================================
// Land Surface Temperature (LST) collection
var collectionLST = dates.map(function(dateString){
  return ee.ImageCollection("MODIS/061/MOD11A2")
    .filterBounds(ROI)
    .filterDate(ee.Date(dateString), ee.Date(dateString).advance(16, "day"))
    .select('LST_Day_1km')
    .mean()
    .rename("LST")                            // Rename band
    .multiply(0.02)                           // Apply band scale
    .subtract(273.15)                         // Convert from Kelvin to Celsius
    .clip(ROI)                                // Clip geometry
    .reproject('EPSG:4326', null, SCALE_M_PX) // Downscale/Upscale image
    .set("date", dateString)                  // Set date property
})
// Cast list object to imageCollection
collectionLST = ee.ImageCollection(collectionLST)

Map.addLayer(collectionLST.first(), {min:20, max:35, palette:pal}, 'IN - collectionLST img1')



// ====================================================================================
// Solar Radiation (SOL) collection
var collectionSOL = dates.map(function(dateString){
  return ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY")
    .filterBounds(ROI)
    .filterDate(ee.Date(dateString), ee.Date(dateString).advance(16, "day"))
    .select('surface_solar_radiation_downwards_hourly')
    .sum()
    .rename("SOL")                            // Rename band
    .divide(1e6)                              // Convert J/m² to MJ/m²
    .clip(ROI)                                // Clip geometry
    .reproject('EPSG:4326', null, SCALE_M_PX) // Downscale/Upscale image
    .set("date", dateString)                  // Set date property
})
// Cast list object to imageCollection
collectionSOL = ee.ImageCollection(collectionSOL)

Map.addLayer(collectionSOL.first(), {min:315, max:415, palette:pal}, 'IN - collectionSOL img1')



// ====================================================================================
// WeMODIS is generated through band math between the ET and PET bands
var collectionWe = dates.map(function(dateString){
  // Accumulates the two 8-day images to one 16-day image.
  var imageSum16days = ee.ImageCollection("MODIS/006/MOD16A2")
    .filterDate(ee.Date(dateString), ee.Date(dateString).advance(16, "day"))
    .filterBounds(ROI)
    .sum()
    
  // Compute MODIS We
  var ET = imageSum16days.select('ET');
  var PET = imageSum16days.select('PET');
  var We = ET.divide(PET).multiply(0.5).add(0.5);
    
  // For each We image, rename band, clip geometry and set date property
  return We
    .rename('We')                             // Rename band
    .clip(ROI)                                // Clip geometry
    .reproject('EPSG:4326', null, SCALE_M_PX) // Downscale/Upscale image
    .set("data", dateString)                  // Set date property
})
// Cast list object to imageCollection
collectionWe = ee.ImageCollection(collectionWe)

Map.addLayer(collectionWe.first(), {min:0.5, max:1.0, palette:pal}, 'IN - collectionWe img1')



// ====================================================================================
// Optimal Temperature
var Topt = 24.85



// ====================================================================================
// Max LUE
var LUEmax = 0.926



print("============== INPUTS ==============",
      "- Region of Interest:", 
      ROI,
      "- Scale (m/px):", 
      SCALE_M_PX,
      "- Image Collection NDVI:", 
      collectionNDVI,
      "- Image Collection LST:", 
      collectionLST,
      "- Image Collection SOL:", 
      collectionSOL,
      "- Image Collection We:", 
      collectionWe,
      "- Optimal Temperature:", 
      Topt,
      "- Maximum LUE:", 
      LUEmax)



// ====================================================================================
// Apply a soybean mask in all collections
// ====================================================================================

var soybeanMask = ee.Image("users/leobeckerdaluz/FIXED/soybeanMask_mesoregionRS")

var maskCollections = function(img){return img.updateMask(soybeanMask)}

collectionNDVI = collectionNDVI.map(maskCollections)
collectionLST = collectionLST.map(maskCollections)
collectionSOL = collectionSOL.map(maskCollections)
collectionWe = collectionWe.map(maskCollections)



// ====================================================================================
// Compute NPP
// ====================================================================================

var computeNPP = require('users/leobeckerdaluz/NPP_algorithm:computeNPP')

var NPPvisParams = {min:20, max:130, palette:pal}



print("===== collectionNPP example ========")

// Compute collectionNPP
var collectionNPP = computeNPP.collectionNPP(
  collectionNDVI, 
  collectionLST,
  collectionSOL, 
  collectionWe, 
  Topt, 
  LUEmax)

// Print and add the first two computed images to the map
var img1 = ee.Image(collectionNPP.toList(collectionNPP.size()).get(0))
var img2 = ee.Image(collectionNPP.toList(collectionNPP.size()).get(1))
Map.addLayer(img1, NPPvisParams, 'OUT - collectionNPP img1')
Map.addLayer(img2, NPPvisParams, 'OUT - collectionNPP img2')
print(collectionNPP, 
      'The first two calculated NPP images have been added to the map!')



print("======== singleNPP example =========")

var NDVI = collectionNDVI.first()
var LST = collectionLST.first()
var SOL = collectionSOL.first()
var We = collectionWe.first()

// Computes the number of pixels in both images
var reduceRegionParameters = {
  reducer: ee.Reducer.count(), 
  scale:SCALE_M_PX,
  geometry: ROI
}
print('Note that the images have different numbers of pixels:',
      '- NDVI Pixels count:', ee.Number(NDVI.reduceRegion(reduceRegionParameters).get("NDVI")),
      '- LST Pixels count:',  ee.Number(LST.reduceRegion(reduceRegionParameters).get("LST")),
      '- SOL Pixels count:',  ee.Number(SOL.reduceRegion(reduceRegionParameters).get("SOL")),
      '- We Pixels count:',  ee.Number(We.reduceRegion(reduceRegionParameters).get("We")))

// Compute singleNPP
var imageNPP = computeNPP.singleNPP(NDVI, LST, SOL, We, Topt, LUEmax)

// Print and add 2 images to the map

print("imageNPP:", 
      imageNPP,
      imageNPP.getDownloadURL({name:"NPP", region:ROI.geometry()}))
Map.addLayer(imageNPP, NPPvisParams, "OUT - imageNPP")

