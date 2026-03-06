# Pranava Health AI Backend with YouTube Integration

This backend now includes YouTube video suggestions based on the diagnosed disease/condition.

## New Features Added

### 1. YouTube Video Suggestions
- Automatically suggests relevant YouTube videos based on the diagnosed condition
- Supports both YouTube Data API v3 (for specific videos) and fallback to search results
- Videos are included in all diagnosis responses

### 2. New API Endpoint: `/api/analyze`
A simple endpoint for quick symptom analysis:

```javascript
POST /api/analyze
{
  "symptoms": "headache and fever"
}

Response:
{
  "disease": "Viral Infection",
  "advice": "Rest, hydration, and monitor symptoms",
  "youtube": {
    "url": "https://www.youtube.com/watch?v=abc123",
    "title": "How to Treat Viral Infections at Home",
    "description": "Learn about home remedies...",
    "type": "video"
  }
}
```

## Setup Instructions

### 1. Environment Variables
Add to your `.env` file:
```
PORT=5000
GOOGLE_API_KEY=your_google_api_key
YOUTUBE_API_KEY=your_youtube_api_key_here
```

### 2. Get YouTube API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the YouTube Data API v3
4. Create credentials (API Key)
5. Add the API key to your `.env` file

### 3. Install Dependencies
```bash
npm install
```

### 4. Start the Server
```bash
npm start
# or for development
npm run dev
```

## How YouTube Integration Works

1. **Disease Extraction**: The system extracts the disease/condition from:
   - AI response summary
   - Likely causes
   - Main symptom from user input
   - Falls back to "general health condition"

2. **YouTube Search**: 
   - With API key: Uses YouTube Data API v3 to get specific video recommendations
   - Without API key: Falls back to generic YouTube search URLs

3. **Response Enhancement**: All diagnosis responses now include a `youtube` field with:
   - `url`: Direct link to video or search results
   - `title`: Video title or generic title
   - `description`: Video description (if available)
   - `type`: "video" or "search"

## Frontend Integration

The frontend automatically displays YouTube links in the diagnosis results:
- Shows a clickable video link with play button emoji
- Opens in new tab
- Includes video description if available
- Styled to match the existing UI

## Example Usage

### Quick Analysis
```javascript
const response = await fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ symptoms: 'skin rash and itching' })
});

const data = await response.json();
console.log(data.youtube.url); // YouTube link for the condition
```

### Regular Triage Flow
The existing triage flow (`/api/triage/next`) now automatically includes YouTube suggestions in the final diagnosis response.

## Notes

- YouTube API has usage quotas - monitor your usage
- Without YouTube API key, the system falls back to generic search links
- Video suggestions are based on disease names, so accuracy depends on AI diagnosis quality
- All videos open in new tabs to keep users on your app