// Load environment variables before anything else
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  PORT: process.env.PORT || 5000,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  MATLAB_PATH: process.env.MATLAB_PATH || 'C:\\Program Files\\MATLAB\\R2025b\\bin\\matlab.exe',
  MATLAB_CODE_PATH: process.env.MATLAB_CODE_PATH || 'C:\\Users\\Madhukumar\\OneDrive\\Desktop\\MATHLAB COUGH PREDICTOR',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/health-ai'
};
