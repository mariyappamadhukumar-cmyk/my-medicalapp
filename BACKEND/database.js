// Database Connection Configuration
import mongoose from 'mongoose';

let isConnected = false;

export async function connectToDatabase() {
  // Get MONGODB_URI at runtime (after dotenv has loaded)
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/health-ai';
  
  console.log('🔍 MongoDB URI loaded:', MONGODB_URI ? (MONGODB_URI.includes('mongodb+srv') ? 'Atlas Cloud ✅' : 'Local (fallback)') : 'Not set');
  
  if (isConnected) {
    console.log('✅ Using existing database connection');
    return;
  }

  try {
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(MONGODB_URI, options);
    
    isConnected = true;
    console.log('✅ Connected to MongoDB:', mongoose.connection.name);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.warn('⚠️ MongoDB connection error (non-fatal):', err.message);
      isConnected = false;
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
      isConnected = false;
    });
    
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    console.log('⚠️ App will continue without database (using in-memory storage)');
    // Don't throw - let app continue without database
    isConnected = false;
  }
}

export function getConnectionStatus() {
  return {
    isConnected,
    dbName: mongoose.connection.name,
    readyState: mongoose.connection.readyState
  };
}

export default mongoose;
