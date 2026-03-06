// Medical Record Model
import mongoose from 'mongoose';

const medicalRecordSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  documentType: {
    type: String,
    enum: ['lab_report', 'prescription', 'xray', 'scan', 'discharge_summary', 'consultation_note', 'other'],
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileSize: Number,
  mimeType: String,
  uploadDate: {
    type: Date,
    default: Date.now
  },
  metadata: {
    testDate: Date,
    hospital: String,
    doctorName: String,
    specialty: String,
    notes: String
  },
  aiExtractedData: {
    testResults: mongoose.Schema.Types.Mixed,
    medications: [String],
    diagnoses: [String],
    vitalSigns: {
      bloodPressure: String,
      heartRate: Number,
      temperature: Number,
      weight: Number
    }
  },
  tags: [String],
  isShared: {
    type: Boolean,
    default: false
  },
  sharedWith: [{
    email: String,
    accessLevel: {
      type: String,
      enum: ['view', 'edit']
    },
    sharedAt: Date
  }]
}, {
  timestamps: true
});

// Index for searching
medicalRecordSchema.index({ userId: 1, uploadDate: -1 });
medicalRecordSchema.index({ tags: 1 });

const MedicalRecord = mongoose.model('MedicalRecord', medicalRecordSchema);

export default MedicalRecord;
