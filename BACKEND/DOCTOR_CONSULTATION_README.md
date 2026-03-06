# 🏥 MediCare Health Platform - Doctor Consultation System

## 📋 Overview

Complete healthcare platform with **AI-powered doctor consultation** and **location-based offline doctor finder**. The system provides intelligent medical guidance, treatment recommendations, and helps patients find nearby doctors.

---

## 🌟 Features

### 1. **Main Welcome Page** (`welcome.html`)
Three primary options for patients:
- 💬 **AI Health Chatbot** - Instant health guidance
- 🫁 **Cough Disease Prediction** - AI-powered respiratory analysis
- 🩺 **Doctor Consultation** - NEW Feature!

### 2. **Doctor Consultation Options** (`doctor-options.html`)
Choose between two consultation types:

#### 🤖 **AI Online Doctor**
- 24/7 Availability
- Instant AI-powered diagnosis
- Personalized treatment plans
- Medicine recommendations with dosage
- Symptom analysis
- Follow-up questions

#### 👨‍⚕️ **Offline Doctor**
- Location-based doctor search
- Verified doctors with ratings
- Specialization filters
- Appointment booking
- In-person consultation

### 3. **AI Doctor Consultation** (`ai-doctor.html`)
Intelligent conversation flow:
1. **Symptom Collection** - Patient describes their condition
2. **Duration Assessment** - How long symptoms persist
3. **Severity Evaluation** - Intensity of symptoms
4. **Medical History** - Allergies, current medications
5. **Comprehensive Treatment Plan**:
   - 🔍 Accurate diagnosis
   - 💊 Prescribed medicines (name, dosage, instructions)
   - ⚠️ Precautions and warnings
   - 🏠 Home remedies
   - 🥗 Diet advice
   - 💡 Lifestyle recommendations

### 4. **Offline Doctor Finder** (`offline-doctor.html`)
- **Location Detection** - Auto-detect user's current location
- **Manual Search** - Enter city/area manually
- **Specialization Filter**:
  - General Physician
  - Cardiologist
  - Dermatologist
  - Pediatrician
  - Orthopedic
  - Gynecologist
  - Dentist
  - ENT Specialist
- **Sort Options**:
  - Distance (nearest first)
  - Rating (highest first)
  - Experience (most experienced first)
- **Doctor Details**:
  - Name, specialization, experience
  - Ratings and reviews
  - Address and phone number
  - Consultation fee
  - Timing
  - Book appointment button

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- Google Gemini API key

### Installation

1. **Clone/Download the project**
```bash
cd "BACKEND"
```

2. **Install dependencies**
```bash
npm install
```

3. **Create `.env` file** in BACKEND folder:
```env
PORT=5000
GOOGLE_API_KEY=your_gemini_api_key_here
YOUTUBE_API_KEY=your_youtube_api_key_here
```

4. **Start the backend server**
```bash
npm start
```

Server will run on `http://localhost:5000`

5. **Open the frontend**
Navigate to the FRONTEND folder and open `welcome.html` in your browser.

---

## 📁 File Structure

```
MEDICARE HEALTH PLATFORM/
├── FRONTEND/
│   ├── welcome.html              # Main landing page (3 options)
│   ├── doctor-options.html       # Choose AI or Offline doctor
│   ├── ai-doctor.html            # AI consultation interface
│   ├── offline-doctor.html       # Location-based doctor finder
│   ├── index.html                # Original Pranava Health AI chat
│   └── medicare-login.html       # Login page
│
├── BACKEND/
│   ├── server.js                 # Express server with all APIs
│   ├── package.json
│   ├── .env                      # API keys (create this)
│   └── README.md                 # This file
│
└── DATABASE/ (Future)
    └── ai_consults.sql           # Store consultation history
```

---

## 🔌 API Endpoints

### 1. **AI Doctor Consultation**
```http
POST /api/ai-doctor/consult
Content-Type: application/json

{
  "message": "I have severe headache and fever",
  "conversationHistory": [],
  "currentStep": "symptoms"
}
```

**Response:**
```json
{
  "ok": true,
  "response": "Treatment plan summary...",
  "isTreatment": true,
  "treatment": {
    "diagnosis": "Most likely viral fever",
    "medicines": [
      {
        "name": "Paracetamol 500mg",
        "dosage": "1 tablet",
        "instructions": "Take 3 times daily after meals for 3 days"
      }
    ],
    "precautions": ["Rest adequately", "Stay hydrated"],
    "homeRemedies": ["Drink warm water with honey"],
    "dietAdvice": ["Light, nutritious meals"]
  },
  "nextStep": "complete"
}
```

### 2. **Search Offline Doctors**
```http
POST /api/doctors/search
Content-Type: application/json

{
  "location": "Mumbai",
  "specialization": "cardiologist",
  "sortBy": "rating",
  "latitude": 19.0760,
  "longitude": 72.8777
}
```

**Response:**
```json
{
  "ok": true,
  "doctors": [
    {
      "id": "doc3",
      "name": "Dr. Amit Patel",
      "specialization": "Cardiologist",
      "rating": 4.7,
      "reviews": 456,
      "experience": 20,
      "address": "Heart Care Center, Powai, Mumbai",
      "phone": "+91 98765 43212",
      "fee": 1200,
      "timing": "11:00 AM - 6:00 PM"
    }
  ],
  "count": 1,
  "location": "Mumbai"
}
```

### 3. **Health Check**
```http
GET /health
```

---

## 💡 How It Works

### AI Doctor Consultation Flow

1. **Patient starts consultation** → Opens `ai-doctor.html`
2. **AI asks for symptoms** → "What symptoms are you experiencing?"
3. **Patient responds** → "I have fever, headache, and body pain"
4. **AI asks follow-up** → "How long have you had these symptoms?"
5. **Patient responds** → "Since 2 days"
6. **AI asks severity** → "On a scale of 1-10, how severe is the fever?"
7. **Patient responds** → "Around 7, quite high"
8. **AI asks history** → "Any allergies or current medications?"
9. **Patient responds** → "No allergies, not taking any medicines"
10. **AI provides treatment plan** → Complete diagnosis + medicines + precautions

### Offline Doctor Search Flow

1. **Patient enters location** → Types "Mumbai" or clicks "Detect Location"
2. **System gets coordinates** → Uses Geolocation API
3. **Filters applied** → Specialization: Cardiologist, Sort by: Rating
4. **API call to backend** → POST /api/doctors/search
5. **Results displayed** → List of doctors with details
6. **Patient books appointment** → Clicks "Book Appointment" button

---

## 🎯 Key Features Explained

### 1. **Intelligent Conversation Management**
- AI remembers conversation context
- Asks relevant follow-up questions
- Adapts based on patient responses
- Knows when enough information is gathered

### 2. **Comprehensive Treatment Plans**
The AI doctor provides:
- **Diagnosis**: Most likely condition
- **Medicines**: Name, exact dosage, timing, duration
- **Precautions**: Safety measures
- **Home Remedies**: Natural treatments
- **Diet Advice**: What to eat/avoid
- **Lifestyle Tips**: Activity recommendations

### 3. **Location-Based Doctor Matching**
- Auto-detect current location
- Search by city/area
- Filter by specialization
- Sort by distance/rating/experience
- View complete doctor profile

### 4. **Safety First Approach**
- Always includes medical disclaimer
- Recommends seeing real doctor for serious conditions
- Provides emergency warning signs
- Medicine recommendations with proper instructions

---

## 🔧 Customization

### Adding More Doctors
Edit `server.js`, find `DOCTORS_DATABASE` array:

```javascript
{
  id: 'doc9',
  name: 'Dr. Your Name',
  specialization: 'Your Specialty',
  avatar: '👨‍⚕️',
  rating: 4.8,
  reviews: 100,
  experience: 10,
  address: 'Your Clinic Address',
  phone: '+91 XXXXXXXXXX',
  fee: 500,
  timing: '9:00 AM - 6:00 PM',
  location: { city: 'YourCity', area: 'YourArea', lat: 0.0, lon: 0.0 }
}
```

### Changing AI Doctor Behavior
Edit the `systemPrompt` in `/api/ai-doctor/consult` endpoint in `server.js`.

### Adding More Specializations
Edit `offline-doctor.html`, find the `specializationFilter` select dropdown.

---

## 🗄️ Database Integration (Future Enhancement)

Create table to store AI consultations:

```sql
CREATE TABLE ai_consults (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT,
  session_id VARCHAR(255),
  symptoms TEXT,
  diagnosis TEXT,
  medicines JSON,
  precautions JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🌐 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Required Features:**
- Geolocation API (for location detection)
- Fetch API (for backend communication)
- Modern CSS (gradients, backdrop-filter)

---

## 🔒 Security Considerations

1. **API Keys**: Never expose in frontend code
2. **User Data**: Implement proper authentication
3. **Medical Advice**: Always include disclaimers
4. **HIPAA Compliance**: If storing patient data
5. **SSL/TLS**: Use HTTPS in production

---

## 📱 Mobile Responsive

All pages are fully responsive:
- Adaptive layouts for phone/tablet/desktop
- Touch-friendly buttons and inputs
- Optimized font sizes
- Mobile-first design approach

---

## 🚧 Future Enhancements

- [ ] User authentication system
- [ ] Save consultation history
- [ ] Video call integration for real doctor consultations
- [ ] Prescription PDF generation
- [ ] Medicine reminder notifications
- [ ] Integration with pharmacy APIs
- [ ] Real-time doctor availability
- [ ] Online payment for consultations
- [ ] Multi-language support
- [ ] Voice input for symptoms

---

## 🐛 Troubleshooting

### "Connection Error" in AI Doctor
- Check if backend server is running on port 5000
- Verify GOOGLE_API_KEY in .env file
- Check browser console for errors

### "No Doctors Found"
- Try different location (e.g., "Mumbai" instead of specific area)
- Check specialization filter
- Verify backend server is running

### Location Detection Not Working
- Allow location permissions in browser
- Use HTTPS (required for geolocation in production)
- Fallback to manual location entry

---

## 📞 Support

For issues or questions:
1. Check console logs (F12 in browser)
2. Verify backend is running
3. Check API responses in Network tab
4. Review error messages

---

## 📄 License

This project is for educational and demonstration purposes.

**Medical Disclaimer**: This system provides AI-generated health information and should not be used as a substitute for professional medical advice, diagnosis, or treatment.

---

## 👨‍💻 Developer Notes

### Tech Stack
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend**: Node.js + Express
- **AI**: Google Gemini API
- **Geolocation**: Browser Geolocation API
- **Storage**: In-memory (upgrade to MongoDB/PostgreSQL)

### Code Quality
- Clean, commented code
- Modular structure
- Error handling
- Responsive design
- Accessibility considerations

---

**Built with ❤️ for better healthcare access**

🚀 **Start the platform**: Open `welcome.html`
🤖 **Test AI Doctor**: Go through the consultation flow
👨‍⚕️ **Find Doctors**: Search for doctors in your area

---

**Last Updated**: October 2025
**Version**: 1.0.0
