// OPTION 1: MONGODB INTEGRATION
// Complete working code to connect to MongoDB database

import mongoose from 'mongoose';

// ===================================================================
// MONGODB CONNECTION
// ===================================================================
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB - Real Doctors Database');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.log('⚠️  Falling back to sample doctors database');
  }
};

// Call this in your server.js
// connectMongoDB();

// ===================================================================
// DOCTOR SCHEMA
// ===================================================================
const doctorSchema = new mongoose.Schema({
  // Basic Info
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  
  // Professional Info
  specialization: { type: String, required: true },
  licenseNumber: { type: String, required: true },
  experience: { type: Number, required: true },
  education: [String],
  
  // Ratings & Reviews
  rating: { type: Number, default: 5.0, min: 0, max: 5 },
  reviews: { type: Number, default: 0 },
  
  // Availability
  fee: { type: Number, required: true },
  timing: { type: String, required: true },
  availableDays: [String],
  
  // Location
  address: { type: String, required: true },
  location: {
    city: { type: String, required: true },
    area: String,
    state: String,
    country: { type: String, default: 'India' },
    pincode: String,
    coordinates: {
      lat: { type: Number, required: true },
      lon: { type: Number, required: true }
    }
  },
  
  // Additional Info
  avatar: { type: String, default: '👨‍⚕️' },
  verified: { type: Boolean, default: false },
  languages: [String],
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create geospatial index for location-based queries
doctorSchema.index({ 'location.coordinates': '2dsphere' });
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ 'location.city': 1 });

const Doctor = mongoose.model('Doctor', doctorSchema);

// ===================================================================
// SEARCH DOCTORS API (MongoDB Version)
// ===================================================================
export async function searchDoctorsFromMongoDB(req, res) {
  try {
    const { 
      city, 
      specialization, 
      latitude, 
      longitude, 
      maxDistance = 10000, // 10km in meters
      minRating = 0,
      maxFee = 10000
    } = req.body;

    let query = {};

    // Filter by city
    if (city) {
      query['location.city'] = new RegExp(city, 'i');
    }

    // Filter by specialization
    if (specialization && specialization !== 'All') {
      query.specialization = new RegExp(specialization, 'i');
    }

    // Filter by minimum rating
    if (minRating > 0) {
      query.rating = { $gte: minRating };
    }

    // Filter by maximum fee
    if (maxFee < 10000) {
      query.fee = { $lte: maxFee };
    }

    // Only verified doctors
    query.verified = true;

    let doctors;

    // If user location provided, find nearby doctors
    if (latitude && longitude) {
      doctors = await Doctor.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            distanceField: 'distance',
            maxDistance: maxDistance,
            query: query,
            spherical: true
          }
        },
        { $sort: { distance: 1, rating: -1 } },
        { $limit: 50 }
      ]);
    } else {
      // No location, just sort by rating
      doctors = await Doctor.find(query)
        .sort({ rating: -1, reviews: -1 })
        .limit(50)
        .lean();
    }

    // Add distance in km if calculated
    const formattedDoctors = doctors.map(doc => ({
      ...doc,
      distance: doc.distance ? (doc.distance / 1000).toFixed(1) + ' km' : null
    }));

    res.json({
      ok: true,
      doctors: formattedDoctors,
      count: formattedDoctors.length,
      source: 'MongoDB'
    });

  } catch (error) {
    console.error('MongoDB search error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to search doctors from database' 
    });
  }
}

// ===================================================================
// ADD NEW DOCTOR (For Registration)
// ===================================================================
export async function addDoctor(req, res) {
  try {
    const doctorData = req.body;
    
    // Check if doctor already exists
    const existingDoctor = await Doctor.findOne({ email: doctorData.email });
    if (existingDoctor) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Doctor with this email already exists' 
      });
    }

    // Create new doctor
    const newDoctor = new Doctor(doctorData);
    await newDoctor.save();

    res.json({
      ok: true,
      message: 'Doctor registered successfully',
      doctor: newDoctor
    });

  } catch (error) {
    console.error('Add doctor error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to register doctor' 
    });
  }
}

// ===================================================================
// UPDATE DOCTOR INFO
// ===================================================================
export async function updateDoctor(req, res) {
  try {
    const { doctorId } = req.params;
    const updates = req.body;
    
    updates.updatedAt = new Date();
    
    const updatedDoctor = await Doctor.findByIdAndUpdate(
      doctorId, 
      updates, 
      { new: true, runValidators: true }
    );

    if (!updatedDoctor) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Doctor not found' 
      });
    }

    res.json({
      ok: true,
      message: 'Doctor updated successfully',
      doctor: updatedDoctor
    });

  } catch (error) {
    console.error('Update doctor error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to update doctor' 
    });
  }
}

// ===================================================================
// GET DOCTOR BY ID
// ===================================================================
export async function getDoctorById(req, res) {
  try {
    const { doctorId } = req.params;
    
    const doctor = await Doctor.findById(doctorId);
    
    if (!doctor) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Doctor not found' 
      });
    }

    res.json({
      ok: true,
      doctor: doctor
    });

  } catch (error) {
    console.error('Get doctor error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to fetch doctor details' 
    });
  }
}

// Export for use in server.js
export { Doctor, connectMongoDB };
