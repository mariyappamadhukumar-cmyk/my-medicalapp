# Database Setup Guide for Health AI App

## Overview
This guide explains how to add MongoDB database to store user data, analysis history, and medical records.

## Database Schema Design

### Collections (Tables):

#### 1. **users**
Stores user account information
```json
{
  "_id": "ObjectId",
  "email": "user@example.com",
  "name": "John Doe",
  "passwordHash": "hashed_password",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "createdAt": "2025-10-10T00:00:00Z",
  "lastLogin": "2025-10-10T12:00:00Z",
  "medicalProfile": {
    "bloodType": "O+",
    "allergies": ["penicillin"],
    "chronicConditions": ["asthma"],
    "currentMedications": ["albuterol"]
  }
}
```

#### 2. **cough_analyses**
Stores all cough analysis results
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (ref: users)",
  "sessionId": "session_123",
  "audioFile": {
    "originalName": "cough.webm",
    "size": 45027,
    "hash": "2f4bc873b69f2553"
  },
  "analysis": {
    "dominantFrequency": 8273.5,
    "pattern": "Cold-like cough",
    "healthStatus": "Mild concern",
    "possibleConditions": "Common cold",
    "recommendation": "Rest and hydrate",
    "confidence": 65,
    "analysisMethod": "MATLAB + Gemini AI"
  },
  "timestamp": "2025-10-10T12:00:00Z"
}
```

#### 3. **chat_conversations**
Stores AI chatbot conversations
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (ref: users)",
  "sessionId": "session_123",
  "messages": [
    {
      "role": "user",
      "content": "I have a headache",
      "timestamp": "2025-10-10T12:00:00Z"
    },
    {
      "role": "assistant",
      "content": "I understand. Can you describe...",
      "timestamp": "2025-10-10T12:00:01Z"
    }
  ],
  "diagnosis": {
    "condition": "tension headache",
    "confidence": 75,
    "medications": ["ibuprofen"]
  },
  "createdAt": "2025-10-10T12:00:00Z",
  "updatedAt": "2025-10-10T12:05:00Z"
}
```

#### 4. **medical_records**
Stores uploaded medical documents and reports
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (ref: users)",
  "documentType": "lab_report",
  "fileName": "blood_test_2025.pdf",
  "fileUrl": "/uploads/medical/...",
  "uploadDate": "2025-10-10T12:00:00Z",
  "metadata": {
    "testDate": "2025-10-08",
    "hospital": "City Hospital",
    "doctorName": "Dr. Smith"
  },
  "aiExtractedData": {
    "testResults": {
      "hemoglobin": "14.5 g/dL",
      "glucose": "95 mg/dL"
    }
  }
}
```

#### 5. **medication_orders**
Tracks medication orders (when integrated with pharmacy)
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (ref: users)",
  "orderId": "ORD-2025-001",
  "medications": [
    {
      "drugName": "Ibuprofen",
      "dosage": "200mg",
      "quantity": 20,
      "instructions": "Take 1 tablet every 6 hours"
    }
  ],
  "totalAmount": 15.99,
  "status": "pending",
  "orderDate": "2025-10-10T12:00:00Z",
  "deliveryAddress": "123 Main St"
}
```

#### 6. **hospital_searches**
Tracks hospital/doctor searches
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (ref: users)",
  "location": {
    "latitude": 13.0827,
    "longitude": 80.2707,
    "address": "Chennai, Tamil Nadu"
  },
  "hospitalsFound": [
    {
      "name": "Apollo Hospital",
      "distance": 2.5,
      "phone": "+91-44-1234-5678"
    }
  ],
  "searchDate": "2025-10-10T12:00:00Z"
}
```

## Installation Steps

### 1. Install MongoDB
Two options:

**Option A: Local MongoDB**
```bash
# Download from https://www.mongodb.com/try/download/community
# Install and run locally
```

**Option B: MongoDB Atlas (Free Cloud - Recommended)**
1. Go to https://www.mongodb.com/cloud/atlas
2. Create free account
3. Create a free cluster
4. Get connection string

### 2. Install Mongoose (MongoDB ODM)
```bash
cd BACKEND
npm install mongoose
```

### 3. Update .env file
Add to your `.env`:
```
MONGODB_URI=mongodb://localhost:27017/health-ai
# OR for Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/health-ai
```

## Next Steps
1. I'll create the database connection file
2. Create data models
3. Update API endpoints to save/retrieve from database
4. Add user authentication

Would you like me to proceed with the implementation?
