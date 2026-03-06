// OPTION 2: GOOGLE PLACES API INTEGRATION
// Find real nearby doctors, clinics, and hospitals using Google Places

import { Client } from '@googlemaps/google-maps-services-js';

const googleMapsClient = new Client({});

// ===================================================================
// SEARCH NEARBY DOCTORS USING GOOGLE PLACES
// ===================================================================
export async function searchDoctorsFromGooglePlaces(req, res) {
  try {
    const { 
      latitude, 
      longitude, 
      specialization,
      radius = 5000 // 5km default
    } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ 
        ok: false, 
        error: 'User location (latitude, longitude) required' 
      });
    }

    // Build search query
    let searchQuery = 'doctor';
    if (specialization && specialization !== 'All') {
      searchQuery = `${specialization} doctor`;
    }

    console.log(`🔍 Searching for: "${searchQuery}" near ${latitude}, ${longitude}`);

    // Search for nearby places
    const response = await googleMapsClient.placesNearby({
      params: {
        location: { lat: latitude, lng: longitude },
        radius: radius,
        type: 'doctor',
        keyword: searchQuery,
        key: process.env.GOOGLE_PLACES_API_KEY
      }
    });

    if (!response.data.results || response.data.results.length === 0) {
      return res.json({
        ok: true,
        doctors: [],
        count: 0,
        message: 'No doctors found nearby',
        source: 'Google Places'
      });
    }

    // Get detailed info for each place (limit to 20 to save API quota)
    const doctors = await Promise.all(
      response.data.results.slice(0, 20).map(async (place) => {
        try {
          // Get place details
          const details = await googleMapsClient.placeDetails({
            params: {
              place_id: place.place_id,
              fields: [
                'name',
                'formatted_phone_number',
                'opening_hours',
                'website',
                'rating',
                'user_ratings_total',
                'formatted_address',
                'types'
              ],
              key: process.env.GOOGLE_PLACES_API_KEY
            }
          });

          const placeDetails = details.data.result;

          // Calculate distance from user
          const distance = calculateDistance(
            latitude,
            longitude,
            place.geometry.location.lat,
            place.geometry.location.lng
          );

          return {
            id: place.place_id,
            name: place.name,
            specialization: specialization || 'General Physician',
            avatar: getAvatarForType(place.types),
            rating: place.rating || 5.0,
            reviews: place.user_ratings_total || 0,
            experience: null, // Not available from Google
            address: placeDetails.formatted_address || place.vicinity,
            phone: placeDetails.formatted_phone_number || 'Call for appointment',
            fee: null, // Not available from Google
            timing: formatOpeningHours(placeDetails.opening_hours),
            location: {
              city: extractCityFromAddress(placeDetails.formatted_address),
              area: place.vicinity,
              lat: place.geometry.location.lat,
              lon: place.geometry.location.lng
            },
            website: placeDetails.website,
            distance: distance.toFixed(1) + ' km',
            googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            isOpen: placeDetails.opening_hours?.open_now,
            source: 'Google Places'
          };
        } catch (detailError) {
          console.error(`Error fetching details for ${place.name}:`, detailError.message);
          return null;
        }
      })
    );

    // Filter out nulls and sort by distance
    const validDoctors = doctors
      .filter(doc => doc !== null)
      .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

    res.json({
      ok: true,
      doctors: validDoctors,
      count: validDoctors.length,
      source: 'Google Places API'
    });

  } catch (error) {
    console.error('Google Places API error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to search nearby doctors',
      details: error.message
    });
  }
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

// Get appropriate avatar based on place type
function getAvatarForType(types) {
  if (types.includes('hospital')) return '🏥';
  if (types.includes('dentist')) return '🦷';
  if (types.includes('pharmacy')) return '💊';
  return '👨‍⚕️';
}

// Format opening hours for display
function formatOpeningHours(openingHours) {
  if (!openingHours) return 'Call for timings';
  
  if (openingHours.weekday_text) {
    // Get today's hours
    const today = new Date().getDay();
    const dayIndex = today === 0 ? 6 : today - 1; // Convert Sunday=0 to Monday=0
    return openingHours.weekday_text[dayIndex] || 'Call for timings';
  }
  
  return 'Call for timings';
}

// Extract city from formatted address
function extractCityFromAddress(address) {
  if (!address) return 'Unknown';
  
  const parts = address.split(',');
  if (parts.length >= 2) {
    return parts[parts.length - 3]?.trim() || 'Unknown';
  }
  return 'Unknown';
}

// ===================================================================
// SEARCH SPECIFIC TYPES OF MEDICAL FACILITIES
// ===================================================================

export async function searchHospitals(req, res) {
  const { latitude, longitude, radius = 5000 } = req.body;

  try {
    const response = await googleMapsClient.placesNearby({
      params: {
        location: { lat: latitude, lng: longitude },
        radius: radius,
        type: 'hospital',
        key: process.env.GOOGLE_PLACES_API_KEY
      }
    });

    const hospitals = response.data.results.map(place => ({
      id: place.place_id,
      name: place.name,
      address: place.vicinity,
      rating: place.rating,
      reviews: place.user_ratings_total,
      location: {
        lat: place.geometry.location.lat,
        lon: place.geometry.location.lng
      },
      googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
    }));

    res.json({
      ok: true,
      hospitals: hospitals,
      count: hospitals.length
    });

  } catch (error) {
    console.error('Search hospitals error:', error);
    res.status(500).json({ ok: false, error: 'Failed to search hospitals' });
  }
}

export async function searchPharmacies(req, res) {
  const { latitude, longitude, radius = 3000 } = req.body;

  try {
    const response = await googleMapsClient.placesNearby({
      params: {
        location: { lat: latitude, lng: longitude },
        radius: radius,
        type: 'pharmacy',
        key: process.env.GOOGLE_PLACES_API_KEY
      }
    });

    const pharmacies = response.data.results.map(place => ({
      id: place.place_id,
      name: place.name,
      address: place.vicinity,
      rating: place.rating,
      isOpen: place.opening_hours?.open_now,
      location: {
        lat: place.geometry.location.lat,
        lon: place.geometry.location.lng
      }
    }));

    res.json({
      ok: true,
      pharmacies: pharmacies,
      count: pharmacies.length
    });

  } catch (error) {
    console.error('Search pharmacies error:', error);
    res.status(500).json({ ok: false, error: 'Failed to search pharmacies' });
  }
}

export { googleMapsClient };
