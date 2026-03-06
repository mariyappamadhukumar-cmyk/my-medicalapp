// SEED DOCTORS DATABASE
// Run this file to populate MongoDB with sample doctors
// Usage: node seed-doctors.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/medicare';

await mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

console.log('✅ Connected to MongoDB');

// Doctor Schema
const doctorSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  specialization: String,
  licenseNumber: String,
  experience: Number,
  education: [String],
  rating: Number,
  reviews: Number,
  fee: Number,
  timing: String,
  availableDays: [String],
  address: String,
  location: {
    city: String,
    area: String,
    state: String,
    country: String,
    pincode: String,
    coordinates: {
      lat: Number,
      lon: Number
    }
  },
  avatar: String,
  verified: Boolean,
  languages: [String],
  createdAt: Date
});

const Doctor = mongoose.model('Doctor', doctorSchema);

// ===================================================================
// COMPREHENSIVE DOCTOR DATA - MUMBAI
// ===================================================================
const mumbaiDoctors = [
  {
    name: 'Dr. Rajesh Kumar',
    email: 'rajesh.kumar@apolloclinic.com',
    phone: '+91 98765 43210',
    specialization: 'General Physician',
    licenseNumber: 'MH-GP-12345',
    experience: 15,
    education: ['MBBS - Mumbai University', 'MD - Internal Medicine - KEM Hospital'],
    rating: 4.8,
    reviews: 245,
    fee: 500,
    timing: '9:00 AM - 8:00 PM',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    address: 'Apollo Clinic, Shop No. 5, Veera Desai Road, Andheri West, Mumbai - 400053',
    location: {
      city: 'Mumbai',
      area: 'Andheri West',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400053',
      coordinates: { lat: 19.1136, lon: 72.8697 }
    },
    avatar: '👨‍⚕️',
    verified: true,
    languages: ['English', 'Hindi', 'Marathi'],
    createdAt: new Date()
  },
  {
    name: 'Dr. Priya Sharma',
    email: 'priya.sharma@skincare.com',
    phone: '+91 98765 43211',
    specialization: 'Dermatologist',
    licenseNumber: 'MH-DERM-23456',
    experience: 12,
    education: ['MBBS - Grant Medical College', 'MD - Dermatology - Nair Hospital', 'Fellowship in Cosmetic Dermatology'],
    rating: 4.9,
    reviews: 389,
    fee: 800,
    timing: '10:00 AM - 7:00 PM',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    address: 'SkinCare Clinic, 2nd Floor, Pali Market, Bandra West, Mumbai - 400050',
    location: {
      city: 'Mumbai',
      area: 'Bandra West',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400050',
      coordinates: { lat: 19.0596, lon: 72.8295 }
    },
    avatar: '👩‍⚕️',
    verified: true,
    languages: ['English', 'Hindi'],
    createdAt: new Date()
  },
  {
    name: 'Dr. Amit Patel',
    email: 'amit.patel@heartcare.com',
    phone: '+91 98765 43212',
    specialization: 'Cardiologist',
    licenseNumber: 'MH-CARD-34567',
    experience: 20,
    education: ['MBBS - Sion Hospital', 'MD - General Medicine', 'DM - Cardiology - KEM Hospital'],
    rating: 4.7,
    reviews: 456,
    fee: 1200,
    timing: '11:00 AM - 6:00 PM',
    availableDays: ['Monday', 'Tuesday', 'Thursday', 'Friday', 'Saturday'],
    address: 'Heart Care Center, Hiranandani Business Park, Powai, Mumbai - 400076',
    location: {
      city: 'Mumbai',
      area: 'Powai',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400076',
      coordinates: { lat: 19.1197, lon: 72.9065 }
    },
    avatar: '👨‍⚕️',
    verified: true,
    languages: ['English', 'Hindi', 'Gujarati'],
    createdAt: new Date()
  },
  {
    name: 'Dr. Sneha Reddy',
    email: 'sneha.reddy@childcare.com',
    phone: '+91 98765 43213',
    specialization: 'Pediatrician',
    licenseNumber: 'MH-PED-45678',
    experience: 10,
    education: ['MBBS - Topiwala Medical College', 'MD - Pediatrics - Tata Memorial', 'Fellowship in Neonatology'],
    rating: 4.9,
    reviews: 567,
    fee: 600,
    timing: '9:00 AM - 9:00 PM',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    address: 'Child Care Hospital, Orlem Church Road, Malad West, Mumbai - 400064',
    location: {
      city: 'Mumbai',
      area: 'Malad West',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400064',
      coordinates: { lat: 19.1868, lon: 72.8483 }
    },
    avatar: '👩‍⚕️',
    verified: true,
    languages: ['English', 'Hindi', 'Telugu'],
    createdAt: new Date()
  },
  {
    name: 'Dr. Vikram Singh',
    email: 'vikram.singh@boneclinic.com',
    phone: '+91 98765 43214',
    specialization: 'Orthopedic',
    licenseNumber: 'MH-ORTH-56789',
    experience: 18,
    education: ['MBBS - LTMMC Sion', 'MS - Orthopedics - KEM Hospital', 'Fellowship in Joint Replacement'],
    rating: 4.6,
    reviews: 234,
    fee: 900,
    timing: '10:00 AM - 5:00 PM',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'],
    address: 'Bone & Joint Clinic, JVPD Scheme, Juhu, Mumbai - 400049',
    location: {
      city: 'Mumbai',
      area: 'Juhu',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400049',
      coordinates: { lat: 19.0969, lon: 72.8264 }
    },
    avatar: '👨‍⚕️',
    verified: true,
    languages: ['English', 'Hindi', 'Punjabi'],
    createdAt: new Date()
  },
  {
    name: 'Dr. Anjali Mehta',
    email: 'anjali.mehta@womenshealth.com',
    phone: '+91 98765 43215',
    specialization: 'Gynecologist',
    licenseNumber: 'MH-GYN-67890',
    experience: 14,
    education: ['MBBS - Seth GS Medical College', 'MD - Obstetrics & Gynecology - Sion Hospital'],
    rating: 4.8,
    reviews: 678,
    fee: 700,
    timing: '9:30 AM - 7:30 PM',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    address: 'Women Health Clinic, Near Dadar Station, Dadar East, Mumbai - 400014',
    location: {
      city: 'Mumbai',
      area: 'Dadar East',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400014',
      coordinates: { lat: 19.0176, lon: 72.8561 }
    },
    avatar: '👩‍⚕️',
    verified: true,
    languages: ['English', 'Hindi', 'Gujarati'],
    createdAt: new Date()
  },
  {
    name: 'Dr. Suresh Gupta',
    email: 'suresh.gupta@entcare.com',
    phone: '+91 98765 43216',
    specialization: 'ENT Specialist',
    licenseNumber: 'MH-ENT-78901',
    experience: 16,
    education: ['MBBS - TN Medical College', 'MS - ENT - BYL Nair Hospital', 'Advanced Training in Cochlear Implant'],
    rating: 4.7,
    reviews: 345,
    fee: 650,
    timing: '11:00 AM - 8:00 PM',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    address: 'ENT Care Center, Link Road, Goregaon West, Mumbai - 400104',
    location: {
      city: 'Mumbai',
      area: 'Goregaon West',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400104',
      coordinates: { lat: 19.1663, lon: 72.8526 }
    },
    avatar: '👨‍⚕️',
    verified: true,
    languages: ['English', 'Hindi', 'Marathi'],
    createdAt: new Date()
  },
  {
    name: 'Dr. Kavita Iyer',
    email: 'kavita.iyer@smiledental.com',
    phone: '+91 98765 43217',
    specialization: 'Dentist',
    licenseNumber: 'MH-DENT-89012',
    experience: 11,
    education: ['BDS - MGM Dental College', 'MDS - Prosthodontics', 'Certificate in Cosmetic Dentistry'],
    rating: 4.9,
    reviews: 892,
    fee: 500,
    timing: '10:00 AM - 8:00 PM',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    address: 'Smile Dental Clinic, Veer Nariman Road, Churchgate, Mumbai - 400020',
    location: {
      city: 'Mumbai',
      area: 'Churchgate',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400020',
      coordinates: { lat: 18.9322, lon: 72.8264 }
    },
    avatar: '👩‍⚕️',
    verified: true,
    languages: ['English', 'Hindi', 'Tamil'],
    createdAt: new Date()
  },
  {
    name: 'Dr. Rahul Joshi',
    email: 'rahul.joshi@neuroclini.com',
    phone: '+91 98765 43218',
    specialization: 'Neurologist',
    licenseNumber: 'MH-NEURO-90123',
    experience: 22,
    education: ['MBBS - LTMMC', 'MD - General Medicine', 'DM - Neurology - JJ Hospital'],
    rating: 4.8,
    reviews: 412,
    fee: 1500,
    timing: '4:00 PM - 9:00 PM',
    availableDays: ['Tuesday', 'Thursday', 'Friday', 'Saturday'],
    address: 'NeuroLife Clinic, Linking Road, Khar West, Mumbai - 400052',
    location: {
      city: 'Mumbai',
      area: 'Khar West',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400052',
      coordinates: { lat: 19.0728, lon: 72.8326 }
    },
    avatar: '👨‍⚕️',
    verified: true,
    languages: ['English', 'Hindi', 'Marathi'],
    createdAt: new Date()
  },
  {
    name: 'Dr. Meera Nair',
    email: 'meera.nair@eyecare.com',
    phone: '+91 98765 43219',
    specialization: 'Ophthalmologist',
    licenseNumber: 'MH-OPTH-01234',
    experience: 13,
    education: ['MBBS - Lokmanya Tilak Medical College', 'MS - Ophthalmology - LV Prasad Eye Institute'],
    rating: 4.7,
    reviews: 523,
    fee: 800,
    timing: '9:00 AM - 6:00 PM',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    address: 'Vision Eye Care, Turner Road, Bandra West, Mumbai - 400050',
    location: {
      city: 'Mumbai',
      area: 'Bandra West',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400050',
      coordinates: { lat: 19.0544, lon: 72.8311 }
    },
    avatar: '👩‍⚕️',
    verified: true,
    languages: ['English', 'Hindi', 'Malayalam'],
    createdAt: new Date()
  }
];

// ===================================================================
// SEED DATABASE
// ===================================================================
async function seedDatabase() {
  try {
    // Clear existing doctors
    const deleteResult = await Doctor.deleteMany({});
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing doctors`);

    // Insert new doctors
    const insertResult = await Doctor.insertMany(mumbaiDoctors);
    console.log(`✅ Inserted ${insertResult.length} doctors`);

    // Display inserted doctors
    console.log('\n📋 Doctors in Database:\n');
    const allDoctors = await Doctor.find({}).sort({ specialization: 1, name: 1 });
    
    allDoctors.forEach((doc, index) => {
      console.log(`${index + 1}. ${doc.name}`);
      console.log(`   📌 ${doc.specialization} | ${doc.experience} years`);
      console.log(`   📍 ${doc.location.area}, ${doc.location.city}`);
      console.log(`   ⭐ ${doc.rating}/5.0 (${doc.reviews} reviews)`);
      console.log(`   💰 ₹${doc.fee} | 📞 ${doc.phone}`);
      console.log('');
    });

    console.log('✅ Database seeded successfully!');
    console.log(`\n📊 Total doctors: ${allDoctors.length}`);
    
    // Show specialization distribution
    const specializations = [...new Set(allDoctors.map(d => d.specialization))];
    console.log(`\n🏥 Specializations available: ${specializations.length}`);
    specializations.forEach(spec => {
      const count = allDoctors.filter(d => d.specialization === spec).length;
      console.log(`   - ${spec}: ${count} doctor(s)`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();
