# 🚀 Enable Google Places API - 2 Minutes!

## Step 1: Go to Google Cloud Console
https://console.cloud.google.com/

## Step 2: Enable Places API

1. Click on "APIs & Services" → "Library"
2. Search for "Places API"
3. Click on "Places API"
4. Click "ENABLE" button

**That's it!** ✅

## Step 3: (Optional) Enable Billing

Google Places API is FREE for:
- Up to 25,000 requests per month
- $200 free credit every month

But you need to enable billing (you won't be charged unless you exceed limits):

1. Go to "Billing" in left menu
2. Click "Link a billing account"
3. Add credit card (won't be charged for free tier)
4. Done!

## Your API Key
Already in your .env file:
```
GOOGLE_PLACES_API_KEY=AIzaSyBXoe5MR3Du2td1-w7Ce073Va_2Mn185Hc
```

## Test It!

1. Restart your server: `node server.js`
2. Open `offline-doctor.html`
3. Allow location access
4. Click "Search Nearby Doctors"
5. You'll see REAL nearby doctors! 🎉

## What You'll Get:

✅ Real doctors, clinics, hospitals near you
✅ Live ratings and reviews from Google
✅ Phone numbers and websites
✅ Opening hours and current status (open/closed)
✅ Direct Google Maps links
✅ Distance from your location

## Fallback:

If Google Places API is not enabled yet, the system will automatically use sample doctors from Mumbai.

---

**Ready to test!** 🚀
