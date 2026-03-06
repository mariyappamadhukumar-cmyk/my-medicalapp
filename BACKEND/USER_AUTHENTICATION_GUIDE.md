# 🔐 User Authentication & Data Privacy System

## 📋 **Current Problem**

**Issue:** Dashboard shows ALL data from database, not filtered by user
- Anyone can see everyone's cough analyses
- No login/logout system
- No data privacy
- No user sessions

---

## ✅ **Solution: Complete User Authentication System**

### **Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    USER REGISTRATION                         │
│  1. User creates account (email, password)                  │
│  2. Password hashed with bcrypt                             │
│  3. User saved to MongoDB users collection                  │
│  4. Unique userId generated                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        USER LOGIN                            │
│  1. User enters email/password                              │
│  2. Backend verifies credentials                            │
│  3. JWT token generated                                     │
│  4. Token stored in localStorage                            │
│  5. userId stored in session                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    DATA ASSOCIATION                          │
│  1. Every cough analysis saved with userId                  │
│  2. Every chat conversation saved with userId               │
│  3. Every medical record saved with userId                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    DASHBOARD FILTERING                       │
│  1. User opens dashboard                                    │
│  2. Frontend sends JWT token to backend                     │
│  3. Backend verifies token, extracts userId                 │
│  4. Query: CoughAnalysis.find({ userId: userId })          │
│  5. Returns ONLY that user's data                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 **Implementation Steps**

### **Step 1: Install Required Packages**

```bash
cd BACKEND
npm install bcryptjs jsonwebtoken express-session
```

**Packages:**
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT token generation/verification
- `express-session` - Session management

---

### **Step 2: Update User Schema**

**File:** `BACKEND/database.js`

```javascript
// Enhanced User Schema with authentication
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true
  },
  phone: String,
  dateOfBirth: Date,
  gender: String,
  profilePicture: String,
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Add method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
```

---

### **Step 3: Update CoughAnalysis Schema**

**Add userId field:**

```javascript
const coughAnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,  // ← IMPORTANT: Link to user
    index: true      // ← IMPORTANT: Fast queries
  },
  sessionId: String,
  audioFile: {
    originalName: String,
    size: Number,
    hash: String
  },
  analysis: {
    dominantFrequency: Number,
    pattern: String,
    healthStatus: String,
    possibleConditions: String,
    recommendation: String,
    confidence: Number,
    spectralCentroid: Number,
    spectralBandwidth: Number,
    zeroCrossingRate: Number,
    rmsEnergy: Number,
    analysisMethod: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });
```

---

### **Step 4: Update ChatConversation Schema**

```javascript
const chatConversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionId: String,
  messages: [{
    role: String,
    content: String,
    timestamp: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });
```

---

### **Step 5: Create Authentication Middleware**

**File:** `BACKEND/auth-middleware.js`

```javascript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Verify JWT token
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid or expired token' 
      });
    }
    
    req.userId = user.userId; // Attach userId to request
    next();
  });
};

// Generate JWT token
export const generateToken = (userId) => {
  return jwt.sign(
    { userId }, 
    JWT_SECRET, 
    { expiresIn: '7d' } // Token expires in 7 days
  );
};
```

---

### **Step 6: Create Authentication Routes**

**File:** `BACKEND/server.js` (add these routes)

```javascript
import bcrypt from 'bcryptjs';
import { authenticateToken, generateToken } from './auth-middleware.js';

// -------------------------------------------------------------------------------------
// USER AUTHENTICATION ROUTES
// -------------------------------------------------------------------------------------

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Create new user (password will be hashed by pre-save hook)
    const user = await User.create({
      email,
      password,
      name,
      phone
    });

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current user profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

### **Step 7: Update Cough Analysis Endpoint**

**Modify to save with userId:**

```javascript
// POST /api/cough/analyze - UPDATED with authentication
app.post('/api/cough/analyze', authenticateToken, upload.single('audio'), async (req, res) => {
  try {
    const userId = req.userId; // From JWT token
    const audioFile = req.file;

    // ... existing MATLAB analysis code ...

    // Save to MongoDB WITH userId
    const savedAnalysis = await CoughAnalysis.create({
      userId: userId,  // ← IMPORTANT: Link to user
      sessionId: sessionId,
      audioFile: {
        originalName: audioFile.originalname,
        size: audioFile.size,
        hash: hash
      },
      analysis: results
    });

    console.log(`🗄️  Saved cough analysis to database for user ${userId} (ID: ${savedAnalysis._id})`);

    res.json({
      ok: true,
      analysis: results,
      analysisMethod: 'real'
    });

  } catch (error) {
    console.error('❌ Analysis error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});
```

---

### **Step 8: Update Dashboard API Endpoints**

**Filter by userId:**

```javascript
// Get user's cough analyses ONLY
app.get('/api/cough-analyses', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const analyses = await CoughAnalysis.find({ userId: userId })  // ← Filter by user
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      count: analyses.length,
      data: analyses
    });

  } catch (error) {
    console.error('❌ Error fetching analyses:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user's chat conversations ONLY
app.get('/api/chat-conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const conversations = await ChatConversation.find({ userId: userId })  // ← Filter by user
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json(conversations);

  } catch (error) {
    console.error('❌ Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

### **Step 9: Create Login Page**

**File:** `FRONTEND/login.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - MediCare</title>
    <style>
        /* Beautiful login page styles */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #FFE4E6 0%, #FFCCD5 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .login-container {
            background: rgba(255, 255, 255, 0.9);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            max-width: 450px;
            width: 100%;
            backdrop-filter: blur(10px);
        }
        
        .logo {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #4169E1, #8B5CF6);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            margin: 0 auto 20px;
        }
        
        h1 {
            text-align: center;
            color: #1f2937;
            margin-bottom: 10px;
        }
        
        .subtitle {
            text-align: center;
            color: #6b7280;
            margin-bottom: 30px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #1f2937;
            font-weight: 600;
        }
        
        input {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            font-size: 16px;
            transition: all 0.3s;
        }
        
        input:focus {
            outline: none;
            border-color: #4169E1;
            box-shadow: 0 0 0 3px rgba(65, 105, 225, 0.1);
        }
        
        .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #4169E1, #8B5CF6);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(65, 105, 225, 0.3);
        }
        
        .toggle-form {
            text-align: center;
            margin-top: 20px;
            color: #6b7280;
        }
        
        .toggle-form a {
            color: #4169E1;
            text-decoration: none;
            font-weight: 600;
        }
        
        .error {
            background: #fef2f2;
            border: 1px solid #fecaca;
            color: #dc2626;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }
        
        .success {
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            color: #16a34a;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">🏥</div>
        <h1>Welcome Back</h1>
        <p class="subtitle">Login to access your health dashboard</p>
        
        <div class="error" id="errorMsg"></div>
        <div class="success" id="successMsg"></div>
        
        <!-- Login Form -->
        <form id="loginForm">
            <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" required placeholder="your@email.com">
            </div>
            
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" required placeholder="••••••••">
            </div>
            
            <button type="submit" class="btn">Login</button>
        </form>
        
        <div class="toggle-form">
            Don't have an account? <a href="#" onclick="showRegister()">Register</a>
        </div>
    </div>

    <script>
        const API_URL = 'http://localhost:5000';

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const response = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Store token
                    localStorage.setItem('authToken', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    
                    // Show success
                    showSuccess('Login successful! Redirecting...');
                    
                    // Redirect to welcome page
                    setTimeout(() => {
                        window.location.href = 'welcome.html';
                    }, 1000);
                } else {
                    showError(data.error);
                }
            } catch (error) {
                showError('Login failed. Please try again.');
            }
        });
        
        function showError(message) {
            const errorDiv = document.getElementById('errorMsg');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => errorDiv.style.display = 'none', 5000);
        }
        
        function showSuccess(message) {
            const successDiv = document.getElementById('successMsg');
            successDiv.textContent = message;
            successDiv.style.display = 'block';
        }
        
        function showRegister() {
            window.location.href = 'register.html';
        }
    </script>
</body>
</html>
```

---

### **Step 10: Update Frontend to Send JWT Token**

**File:** `FRONTEND/health-dashboard.html`

```javascript
// Update API calls to include authentication token

async function loadDashboardData() {
    const loading = document.getElementById('loading');
    const mainContent = document.getElementById('mainContent');
    const emptyState = document.getElementById('emptyState');

    // Check if user is logged in
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    loading.style.display = 'block';
    mainContent.style.display = 'none';
    emptyState.style.display = 'none';

    try {
        // Fetch data with authentication header
        const [coughResponse, chatResponse] = await Promise.all([
            fetch(`${API_URL}/api/cough-analyses`, {
                headers: {
                    'Authorization': `Bearer ${token}`  // ← JWT token
                }
            }),
            fetch(`${API_URL}/api/chat-conversations`, {
                headers: {
                    'Authorization': `Bearer ${token}`  // ← JWT token
                }
            })
        ]);

        if (coughResponse.ok) {
            const result = await coughResponse.json();
            healthData.coughAnalyses = result.data;  // User's data only
        }

        if (chatResponse.ok) {
            healthData.chatConversations = await chatResponse.json();  // User's data only
        }

        // ... rest of the code
    } catch (error) {
        console.error('Error:', error);
        if (error.message.includes('401') || error.message.includes('403')) {
            // Token invalid or expired
            localStorage.removeItem('authToken');
            window.location.href = 'login.html';
        }
    }
}
```

---

## 🎯 **Summary of Changes**

### **What Gets Saved:**

**Before (No Auth):**
```javascript
CoughAnalysis.create({
  sessionId: '...',
  analysis: { ... }
});
// ❌ No user association
// ❌ Everyone sees all data
```

**After (With Auth):**
```javascript
CoughAnalysis.create({
  userId: 'user123xyz',  // ← User ID from JWT
  sessionId: '...',
  analysis: { ... }
});
// ✅ Data linked to user
// ✅ Private and secure
```

### **What Gets Retrieved:**

**Before:**
```javascript
CoughAnalysis.find();  // All records
// Returns ALL users' data
```

**After:**
```javascript
CoughAnalysis.find({ userId: req.userId });  // Filtered
// Returns ONLY logged-in user's data
```

---

## 🔒 **Data Privacy Flow**

```
User A logs in
  → Gets JWT token with userIdA
  → Records cough analysis
  → Saved with userIdA
  → Dashboard queries: { userId: userIdA }
  → Shows ONLY User A's data

User B logs in
  → Gets JWT token with userIdB
  → Records cough analysis
  → Saved with userIdB
  → Dashboard queries: { userId: userIdB }
  → Shows ONLY User B's data

✅ Users CANNOT see each other's data!
```

---

## ✅ **Implementation Checklist**

- [ ] Install packages: `bcryptjs`, `jsonwebtoken`, `express-session`
- [ ] Update User schema with password hashing
- [ ] Add `userId` field to CoughAnalysis schema
- [ ] Add `userId` field to ChatConversation schema
- [ ] Create auth middleware (`auth-middleware.js`)
- [ ] Add register endpoint (`POST /api/auth/register`)
- [ ] Add login endpoint (`POST /api/auth/login`)
- [ ] Update cough analysis endpoint (add `authenticateToken`)
- [ ] Update dashboard endpoints (filter by `userId`)
- [ ] Create login page (`login.html`)
- [ ] Create register page (`register.html`)
- [ ] Update frontend to send JWT tokens
- [ ] Add logout functionality

---

## 🚀 **Next Steps**

Would you like me to implement this complete authentication system for you? I can:

1. ✅ Create all the necessary files
2. ✅ Update existing schemas
3. ✅ Add authentication routes
4. ✅ Create login/register pages
5. ✅ Update frontend to use JWT tokens
6. ✅ Add logout functionality
7. ✅ Add "protected routes" middleware

Just say **"Yes, implement user authentication"** and I'll build the complete system! 🔐
