// Doctor Model — for real doctor registrations on Pranava Health
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, required: true, trim: true },
  specialization: {
    type: String,
    required: true,
    enum: ['General Physician','Dermatologist','Pediatrician','Cardiologist','Gynecologist',
           'Orthopedist','ENT','Diabetologist','Psychiatrist','Neurologist','Ophthalmologist','Other']
  },
  experience: { type: Number, required: true, min: 0 }, // years
  qualifications: { type: String, trim: true },         // e.g. "MBBS, MD"
  languages: [{ type: String }],                        // ['Tamil','English','Hindi']
  consultationFee: { type: Number, required: true, min: 0 },
  avatar: { type: String, default: '👨‍⚕️' },            // emoji avatar
  about: { type: String, trim: true },
  availableNow: { type: Boolean, default: false },
  slots: [{ type: String }],                            // ['9:00 AM','10:00 AM',...]
  registrationNumber: { type: String, trim: true },     // Medical council reg no
  verified: { type: Boolean, default: false },          // Admin-verified doctor
  rating: { type: Number, default: 0, min: 0, max: 5 },
  totalReviews: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

doctorSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export default mongoose.model('Doctor', doctorSchema);
