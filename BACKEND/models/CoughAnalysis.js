// Cough Analysis Model
import mongoose from 'mongoose';

const coughAnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional for now (backward compatibility)
    index: true
  },
  sessionId: {
    type: String,
    index: true
  },
  audioFile: {
    originalName: String,
    size: Number,
    hash: String,
    mimeType: String
  },
  analysis: {
    dominantFrequency: Number,
    pattern: String,
    healthStatus: String,
    possibleConditions: String,
    recommendation: String,
    confidence: Number,
    analysisMethod: String,
    frequencySpectrum: [
      {
        frequency: Number,
        amplitude: Number
      }
    ],
    rawMatlabResult: mongoose.Schema.Types.Mixed
  },
  youtubeVideo: {
    title: String,
    videoId: String,
    thumbnail: String,
    channelTitle: String
  },
  medications: [
    {
      drugName: String,
      dosage: String,
      fdaInfo: mongoose.Schema.Types.Mixed
    }
  ],
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for user + date queries
coughAnalysisSchema.index({ userId: 1, timestamp: -1 });

const CoughAnalysis = mongoose.model('CoughAnalysis', coughAnalysisSchema);

export default CoughAnalysis;
