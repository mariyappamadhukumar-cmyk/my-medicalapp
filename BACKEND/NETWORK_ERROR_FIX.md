# 🔧 NETWORK ERROR FIX GUIDE

## ❌ Problem:
You're seeing: **"Network error. Please check your connection and try again."** when trying to register.

## ✅ Solution:

### **Step 1: Make Sure Backend Server is Running**

Open a **NEW PowerShell terminal** and run:

```powershell
cd "c:\Users\Madhukumar\OneDrive\Desktop\train model1 add features\BACKEND"
node server.js
```

You should see:
```
✅ Gemini API Key loaded for cough analysis
✅ Connected to MongoDB: health-ai
✅ Pranava Health AI listening on http://localhost:5000
```

**Keep this terminal open!** Don't close it.

---

### **Step 2: Test the Connection**

Open this file in your browser:
```
FRONTEND/test-server-connection.html
```

Click the buttons to test:
1. "Test Server Connection" - Should show ✅
2. "Test Registration Endpoint" - Should show ✅
3. "Test Login Endpoint" - Should show response

---

### **Step 3: Try Registration Again**

1. Open `FRONTEND/register.html`
2. Fill in the form:
   - Name: Your Name
   - Email: your@email.com
   - Password: test123 (min 6 chars)
3. Click "Create Account"
4. Should work now! ✅

---

## 🔍 Common Issues and Fixes

### **Issue 1: Server Not Running**
**Symptom:** Network error immediately

**Fix:**
```powershell
# In BACKEND folder
node server.js
```

Keep the terminal open!

---

### **Issue 2: Port 5000 Already in Use**
**Symptom:** "EADDRINUSE: address already in use :::5000"

**Fix:**
```powershell
# Kill process on port 5000
netstat -ano | findstr :5000
taskkill /PID <PID_NUMBER> /F

# Then restart server
node server.js
```

---

### **Issue 3: MongoDB Not Connected**
**Symptom:** "MongoDB connection failed"

**Fix:**
1. Check internet connection
2. Verify MongoDB Atlas credentials in `.env` file
3. Whitelist your IP in MongoDB Atlas

---

### **Issue 4: CORS Error**
**Symptom:** "CORS policy: No 'Access-Control-Allow-Origin' header"

**Fix:** Already configured in server.js (line 47):
```javascript
app.use(cors({ origin: true, credentials: true }));
```

Server restart may help:
```powershell
# Stop server (Ctrl+C)
# Start again
node server.js
```

---

## 📋 Quick Checklist

Before trying to register, verify:

- [ ] Backend server is running (`node server.js`)
- [ ] You see "✅ Pranava Health AI listening on http://localhost:5000"
- [ ] MongoDB is connected ("✅ Connected to MongoDB: health-ai")
- [ ] You're opening the HTML file in a browser
- [ ] You're filling in ALL required fields (name, email, password)
- [ ] Password is at least 6 characters

---

## 🎯 Step-by-Step Test

### **Terminal 1: Start Server**
```powershell
cd "c:\Users\Madhukumar\OneDrive\Desktop\train model1 add features\BACKEND"
node server.js
```

**Wait for:**
```
✅ Pranava Health AI listening on http://localhost:5000
```

### **Browser: Test Connection**
1. Open: `FRONTEND/test-server-connection.html`
2. Click: "Test Server Connection"
3. Should see: ✅ Server is ONLINE!

### **Browser: Try Registration**
1. Open: `FRONTEND/register.html`
2. Fill form:
   - Name: Test User
   - Email: test@example.com
   - Password: test123456
3. Click: "Create Account"
4. Should work! ✅

---

## 🚨 Still Not Working?

### **Check Browser Console:**
1. Open browser
2. Press F12 (DevTools)
3. Go to "Console" tab
4. Try registration again
5. Look for error messages

**Common console errors:**

**Error:** `Failed to fetch`
**Fix:** Server not running → Start server

**Error:** `net::ERR_CONNECTION_REFUSED`
**Fix:** Server crashed → Restart server

**Error:** `401 Unauthorized`
**Fix:** Check authentication → Verify credentials

**Error:** `500 Internal Server Error`
**Fix:** Server error → Check server terminal for errors

---

## 📞 Debug Steps

### **Step 1: Check Server Status**
```powershell
# In a new terminal
curl http://localhost:5000/health
```

Should return:
```json
{
  "status": "healthy",
  "mongodb": "connected"
}
```

### **Step 2: Check Network Tab**
1. Open browser DevTools (F12)
2. Go to "Network" tab
3. Try registration
4. Look for `/api/auth/register` request
5. Check status code and response

### **Step 3: Check Server Logs**
Look at the terminal where server is running:
- Should see incoming requests
- Should see any errors

---

## ✅ Working Example

**Terminal Output (Good):**
```
✅ Gemini API Key loaded for cough analysis
✅ Connected to MongoDB: health-ai
✅ Pranava Health AI listening on http://localhost:5000
📊 Health check available at http://localhost:5000/health
🗄️  MongoDB connected: health-ai
```

**Registration Success Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "test@example.com",
    "name": "Test User"
  }
}
```

---

## 🎉 Summary

**The network error happens because:**
1. Backend server is not running, OR
2. Server crashed, OR
3. Port 5000 is blocked

**The fix:**
1. Start backend server: `node server.js` in BACKEND folder
2. Keep terminal open
3. Test connection: Open `test-server-connection.html`
4. Try registration again

**Test file created:**
- `FRONTEND/test-server-connection.html` ← Use this to debug!

---

**Server MUST be running for registration to work!**

🚀 **Start the server and try again!**
