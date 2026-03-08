// server.js — Pranava Health AI backend with Real MATLAB Cough Analysis
// Node 18+ (has global fetch).  .env: PORT=5000, GOOGLE_API_KEY=xxxx, GEMINI_API_KEY=xxxx

import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import dotenv from "dotenv";
// Load environment variables FIRST before importing database
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@googlemaps/google-maps-services-js";
import { connectToDatabase, getConnectionStatus } from './database.js';
import { User, CoughAnalysis, ChatConversation, MedicalRecord } from './models/index.js';
import { authenticateToken, generateToken, optionalAuth } from './auth-middleware.js';
import bcrypt from 'bcryptjs';

// For ES6 modules, we need __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MATLAB_PATH = process.env.MATLAB_PATH || 'C:\\Program Files\\MATLAB\\R2025b\\bin\\matlab.exe';
const MATLAB_CODE_PATH = process.env.MATLAB_CODE_PATH || 'C:\\Users\\Madhukumar\\OneDrive\\Desktop\\MATHLAB COUGH PREDICTOR';

if (!GOOGLE_API_KEY) console.warn("[WARN] Missing GOOGLE_API_KEY in .env");
if (!YOUTUBE_API_KEY) console.warn("[WARN] Missing YOUTUBE_API_KEY in .env - YouTube search will use generic links");
if (!GOOGLE_PLACES_API_KEY) console.warn("[WARN] Missing GOOGLE_PLACES_API_KEY in .env - Doctor search will use sample data");
if (!GEMINI_API_KEY) console.warn("[WARN] Missing GEMINI_API_KEY in .env - MATLAB cough analysis will use simulation");
else console.log("✅ Gemini API Key loaded for cough analysis");
if (GROQ_API_KEY) console.log("✅ Groq API Key loaded (fallback AI)");

// Initialize Google Maps client for real doctor search
const googleMapsClient = new Client({});

// -------------------------------------------------------------------------------------
// Middleware
// -------------------------------------------------------------------------------------
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
});

// -------------------------------------------------------------------------------------
// In-memory sessions (swap to Redis/DB later)
// -------------------------------------------------------------------------------------
const SESSIONS = new Map();

// Cache for audio analysis results (to ensure consistency)
const ANALYSIS_CACHE = new Map();
const crypto = await import('crypto');

function getAudioHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function newSession() {
  const id = "sess_" + Math.random().toString(36).slice(2, 10);
  const s = {
    id,
    createdAt: Date.now(),
    initialComplaint: "",
    last_question: "",
    profile: { age: null, sex: null, city: null, comorbid: null },
    triage: { expecting: null, key: null, answers: {}, history: [] },
  };
  SESSIONS.set(id, s);
  return s;
}
function getOrCreateSession(id) {
  if (!id) return newSession();
  const s = SESSIONS.get(id);
  if (!s) return newSession();
  return s;
}

// Helper to get session from request (for pre-emption logic)
function getSession(req) {
  const sessionId = req.body?.sessionId;
  return getOrCreateSession(sessionId);
}

// -------------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------------
function toInlineData(mime, bufOrB64) {
  const b64 =
    typeof bufOrB64 === "string" ? bufOrB64.split(",").pop() : Buffer.from(bufOrB64).toString("base64");
  return { inline_data: { mime_type: mime || "image/jpeg", data: b64 } };
}

// -------------------------------------------------------------------------------------
// OpenFDA API Integration - Get real drug information (FREE, NO API KEY NEEDED!)
// -------------------------------------------------------------------------------------
async function getDrugInfoFromFDA(drugName) {
  try {
    // Clean up drug name
    const cleanName = drugName.trim().toLowerCase();
    
    // Search OpenFDA for drug label information
    const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${cleanName}"+openfda.brand_name:"${cleanName}"&limit=1`;
    
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return null;
    }
    
    const drugInfo = data.results[0];
    
    return {
      genericName: drugInfo.openfda?.generic_name?.[0] || drugName,
      brandNames: drugInfo.openfda?.brand_name || [],
      dosageAndAdministration: drugInfo.dosage_and_administration?.[0] || '',
      indications: drugInfo.indications_and_usage?.[0] || '',
      warnings: drugInfo.warnings?.[0] || '',
      adverseReactions: drugInfo.adverse_reactions?.[0] || '',
      drugInteractions: drugInfo.drug_interactions?.[0] || '',
      manufacturerName: drugInfo.openfda?.manufacturer_name?.[0] || ''
    };
  } catch (error) {
    console.error('OpenFDA API error:', error.message);
    return null;
  }
}

// Get drug interactions from OpenFDA
async function checkDrugInteractions(drugNames) {
  try {
    const interactions = [];
    for (const drug of drugNames) {
      const info = await getDrugInfoFromFDA(drug);
      if (info && info.drugInteractions) {
        interactions.push({
          drug: drug,
          interactions: info.drugInteractions
        });
      }
    }
    return interactions;
  } catch (error) {
    console.error('Drug interaction check error:', error);
    return [];
  }
}

// Groq (PRIMARY): converts Gemini-style contents to OpenAI messages format
async function groqGenerate(contents) {
  if (!GROQ_API_KEY) throw new Error('No Groq API key');
  const messages = contents.map(c => ({
    role: c.role === 'model' ? 'assistant' : 'user',
    content: c.parts.map(p => p.text || '').join('')
  }));
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.7 })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq error ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content || '';
}

async function geminiGenerate({ contents, model = "gemini-2.0-flash" }, retryCount = 0) {
  // Try Groq FIRST — faster and more reliable
  if (GROQ_API_KEY) {
    try {
      console.log('🚀 Using Groq (primary)...');
      return await groqGenerate(contents);
    } catch (groqErr) {
      console.warn('⚠️ Groq failed, falling back to Gemini:', groqErr.message);
    }
  }

  // Gemini as fallback
  const maxRetries = 2;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      
      // If 503 (overloaded), retry with exponential backoff
      if (res.status === 503 && retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.warn(`⚠️ Gemini 503, retrying in ${waitTime/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return geminiGenerate({ contents, model }, retryCount + 1);
      }
      
      throw new Error(`Gemini error ${res.status}: ${text.slice(0, 400)}`);
    }
    
    const json = await res.json();
    const out = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    return out;
  } catch (error) {
    throw error;
  }
}

// YouTube search function to suggest relevant videos from top medical channels
async function suggestYoutubeVideo(diseaseOrCondition) {
  try {
    // Clean up the disease name for search
    const searchQuery = `${diseaseOrCondition} treatment symptoms care`;
    
    // List of top medical YouTube channels to prioritize
    const topMedicalChannels = [
      'Mayo Clinic',
      'Cleveland Clinic',
      'Johns Hopkins Medicine',
      'WebMD',
      'Harvard Medical School',
      'Osmosis',
      'MedlinePlus',
      'Nucleus Medical Media',
      'Doctor Mike',
      'MedCram - Medical Lectures Explained CLEARLY',
      'Armando Hasudungan',
      'Khan Academy Medicine',
      'Lecturio Medical Education',
      'NEJM - New England Journal of Medicine',
      'BMJ - British Medical Journal'
    ];
    
    // Use YouTube Data API v3 (you'll need to add YOUTUBE_API_KEY to .env)
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    
    if (!YOUTUBE_API_KEY) {
      console.warn("[WARN] Missing YOUTUBE_API_KEY in .env - returning generic search");
      return {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`,
        title: `Learn more about ${diseaseOrCondition}`,
        type: "search"
      };
    }

    // First, try to search for videos from top medical channels
    let bestVideo = null;
    let searchAttempts = 0;
    const maxAttempts = 3;

    while (!bestVideo && searchAttempts < maxAttempts) {
      let currentQuery = searchQuery;
      
      // On different attempts, try different search strategies
      if (searchAttempts === 1) {
        // Try with a specific top channel
        const randomChannel = topMedicalChannels[Math.floor(Math.random() * 5)]; // Top 5 channels
        currentQuery = `${diseaseOrCondition} ${randomChannel}`;
      } else if (searchAttempts === 2) {
        // Try more specific medical terms
        currentQuery = `${diseaseOrCondition} medical explanation doctor`;
      }

      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(currentQuery)}&type=video&order=relevance&videoDuration=medium&videoDefinition=high&key=${YOUTUBE_API_KEY}`;
      
      const response = await fetch(searchUrl);
      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        // Filter and rank videos by channel quality and relevance
        const rankedVideos = data.items
          .map(video => {
            const channelName = video.snippet.channelTitle;
            const title = video.snippet.title.toLowerCase();
            const description = video.snippet.description.toLowerCase();
            
            let score = 0;
            
            // Higher score for top medical channels
            topMedicalChannels.forEach((topChannel, index) => {
              if (channelName.toLowerCase().includes(topChannel.toLowerCase())) {
                score += (topMedicalChannels.length - index) * 10; // Higher score for better channels
              }
            });
            
            // Bonus points for medical keywords in title
            const medicalKeywords = ['treatment', 'symptoms', 'causes', 'diagnosis', 'medicine', 'health', 'doctor', 'medical'];
            medicalKeywords.forEach(keyword => {
              if (title.includes(keyword)) score += 2;
            });
            
            // Bonus for educational content indicators
            const educationalKeywords = ['explained', 'guide', 'how to', 'understanding', 'overview', 'basics'];
            educationalKeywords.forEach(keyword => {
              if (title.includes(keyword)) score += 3;
            });
            
            // Penalty for non-medical content
            const spamKeywords = ['click', 'amazing', 'shocking', 'secret', 'miracle'];
            spamKeywords.forEach(keyword => {
              if (title.includes(keyword)) score -= 5;
            });
            
            return {
              video,
              score,
              channelName
            };
          })
          .sort((a, b) => b.score - a.score); // Sort by score (highest first)
        
        // Get the best video (highest score)
        if (rankedVideos.length > 0 && rankedVideos[0].score > 0) {
          bestVideo = rankedVideos[0].video;
          break;
        }
      }
      
      searchAttempts++;
    }
    
    if (bestVideo) {
      return {
        url: `https://www.youtube.com/watch?v=${bestVideo.id.videoId}`,
        title: bestVideo.snippet.title,
        description: bestVideo.snippet.description.substring(0, 150) + "...",
        thumbnail: bestVideo.snippet.thumbnails?.medium?.url || "",
        channelName: bestVideo.snippet.channelTitle,
        type: "video"
      };
    } else {
      // Fallback to search results if no good video found
      return {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`,
        title: `Learn more about ${diseaseOrCondition}`,
        type: "search"
      };
    }
  } catch (error) {
    console.error("YouTube search error:", error);
    // Fallback to general search
    return {
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(diseaseOrCondition + " treatment")}`,
      title: `Learn more about ${diseaseOrCondition}`,
      type: "search"
    };
  }
}

// Parse the first JSON object; strip any ``` fences/HTML defensively
function extractLeadingJSON(s = "") {
  const noFences = String(s)
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/<[^>]*>/g, "")
    .trim();

  let depth = 0,
    start = -1,
    end = -1;
  for (let i = 0; i < noFences.length; i++) {
    const ch = noFences[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        end = i + 1;
        break;
      }
    }
  }
  if (start !== -1 && end !== -1) {
    const seg = noFences.slice(start, end);
    try {
      return JSON.parse(seg);
    } catch {}
  }
  const m = noFences.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

function extractJsonBlock(s=""){
  if (!s) return null;
  const m = s.match(/```json\s*([\s\S]*?)```/i) || s.match(/^\s*\{[\s\S]*\}\s*$/);
  if (!m) return null;
  try { return JSON.parse(m[1] || m[0]); } catch { return null; }
}

function tryParseJSONBlock(s=""){
  if (!s) return null;
  const trimmed = s.trim().replace(/^```json/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(trimmed); } catch { return null; }
}

function escapeHtml(x=""){ return String(x).replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }

// B) Server-side JSON processing helpers
function safeJsonFromBlock(s=""){
  const t = String(s).trim().replace(/^```json/i,"").replace(/```$/,"").trim();
  try { return JSON.parse(t); } catch { return null; }
}

function sectionsToHtmlServer(sections=[], safety=""){
  const lis = s => s.map(i=>`<li>${escapeHtml(i)}</li>`).join("");
  const blocks = sections.map(sec => `
    <div class="advice">
      <div class="advice-title">${escapeHtml(sec.title || "")}</div>
      <ul>${lis(sec.items || [])}</ul>
    </div>`).join("");
  return blocks + (safety?`<div class="vax-note">${escapeHtml(safety)}</div>`:"");
}

function sectionsToHtml(sections=[], safety=""){
  const parts = [];
  for (const sec of sections){
    if (!sec || !sec.items || !sec.items.length) continue;
    const lis = sec.items.map(it=>`<li>${escapeHtml(it)}</li>`).join("");
    parts.push(`<div class="advice"><div class="advice-title">${escapeHtml(sec.title)}</div><ul>${lis}</ul></div>`);
  }
  if (safety) parts.push(`<div class="vax-note">${escapeHtml(safety)}</div>`);
  return parts.join("");
}

// Fallback: turn "Common:** * A * B ... **Less Common:** * ..." into lists
function starBulletsToHtml(s=""){
  const blocks = [];
  const re = /\*\*(Common|Less Common|Emergency Signs)\*\*:\s*([^]*?)(?=\*\*|$)/gi;
  let m;
  while ((m = re.exec(s))){
    const title = m[1];
    const items = m[2].split(/\s*\*\s+/).map(x=>x.trim()).filter(Boolean);
    if (items.length){
      blocks.push(`<div class="advice"><div class="advice-title">${escapeHtml(title)}</div><ul>${
        items.map(it=>`<li>${escapeHtml(it)}</li>`).join("")
      }</ul></div>`);
    }
  }
  if (!blocks.length){
    // last resort: split by " * " and hope for the best
    const items = s.split(/\s\*\s+/).map(x=>x.replace(/^\*/, '').trim()).filter(Boolean);
    if (items.length) return `<ul>${items.map(it=>`<li>${escapeHtml(it)}`).join("")}</ul>`;
  }
  return blocks.join("");
}

function toAnswerHtml(raw, intent){
  const j = tryParseJSONBlock(raw);
  if (j && Array.isArray(j.sections)) return sectionsToHtml(j.sections, j.safety||"");
  
  // Legacy vaccine JSON format
  if (j && Array.isArray(j.answer)) {
    const bullets = j.answer.map(li => `<li>${escapeHtml(li)}</li>`).join("");
    const safety  = j.safety  ? `<div class="vax-note">${escapeHtml(j.safety)}</div>` : "";
    const clarify = j.clarify ? `<div class="vax-note"><b>One quick question:</b> ${escapeHtml(j.clarify)}</div>` : "";
    return `<ul>${bullets}</ul>${safety}${clarify}`;
  }
  
  return (intent === "symptoms") ? starBulletsToHtml(raw) : raw;
}

// Sanitize: when no image, we must NOT bring skin up
function removeSkinMentions(t = "") {
  return t.replace(/\b(rash|rashes|skin|derma|eczema|psoriasis|acne|pimples?)\b/gi, "[redacted]");
}

// Greeting detector (hi/hello/hey/namaste/etc.)
function isGreeting(s = "") {
  const t = s.trim().toLowerCase();
  if (!t) return false;
  return /^(hi|hello|hey|hola|namaste|namaskar|vanakkam|hai|yo|sup|good\s*(morning|afternoon|evening))\b/.test(t);
}

// Intent detector for remedy requests
function remedyIntent(t=""){
  const s = t.toLowerCase();
  return /(remedy|remedies|cream|ointment|gel|tablet|tab|medicine|meds|food|diet|avoid|eat|home\s*care|home\s*remedy)/.test(s);
}

// A) Add these helpers for question pre-emption
function normalizeUserText(s = "") {
  return String(s).toLowerCase().trim();
}

// Treat messages as questions if they look like one
function isQuestionLike(text = "") {
  const t = normalizeUserText(text);
  if (!t) return false;
  return /\?/.test(t)
      || /\b(what|why|how|when|where|who)\b/.test(t)
      || /\b(explain|about|overview|definition|define|meaning of)\b/.test(t)
      || /\b(symptom|signs|vaccine|booster|cause|prevent|treat|risk|test|prognosis)\b/.test(t);
}

// Map questions to intents (make "overview" catch explain/about)
function followupIntentRegex(q = "") {
  const t = normalizeUserText(q);
  if (/\b(symptom|signs?|what.*symptom|how.*know|manifest|presentation)\b/.test(t)) return "symptoms";
  if (/\b(explain|about|overview|what is|definition|define|meaning of)\b/.test(t)) return "overview";
  if (/\b(vaccine|vaccin|vax|booster|shot|jab|immuni[sz]e?)\b/.test(t)) return "vaccine";
  if (/\b(why|cause|etiolog|reason|how did|how come|pathophysiolog)\b/.test(t)) return "cause";
  if (/\b(treat|manage|medicine|tablet|pill|cream|ointment|remedy|diet|food)\b/.test(t)) return "treatment";
  if (/\b(prevent|avoid|stop|reduce|again|recurr|recurrence|lower.*risk)\b/.test(t)) return "prevention";
  if (/\b(test|diagnos|check|scan|blood|rt[- ]?pcr|antigen|culture)\b/.test(t)) return "tests";
  return "general";
}

// Intent detector for detailed explanations
function explainIntent(s=""){
  const t=(s||"").toLowerCase();
  return /\b(explain|detail|bigger|more info|understand|elaborate|teach)\b/.test(t);
}

// ---- 2) LLM fallback (reliable on paraphrases)
const INTENT_SYSTEM = `
You classify a single health question into ONE of these labels:
symptoms, cause, prevention, treatment, vaccine, risk, prognosis, tests, lifestyle, general.

Rules:
- Return STRICT JSON only: {"intent":"<label>","confidence":0.0-1.0,"topic":"<short topic>"}
- "vaccine" covers boosters, shots, immunization.
- If uncertain, choose "general" with lower confidence.
- Do not give advice here; classification only.
`;

async function followupIntentLLM(q) {
  try {
    const raw = await geminiGenerate({
      contents: [
        { role: "user", parts: [{ text: INTENT_SYSTEM }] },
        { role: "user", parts: [{ text: "QUESTION:\n" + q }] },
      ],
    });
    const j = extractLeadingJSON(raw) || {};
    let label = String(j.intent || "").toLowerCase();
    const allowed = new Set(["symptoms","cause","prevention","treatment","vaccine","risk","prognosis","tests","lifestyle","general"]);
    if (!allowed.has(label)) label = "general";
    const conf = Math.max(0, Math.min(1, Number(j.confidence || 0)));
    return { intent: label, confidence: conf, topic: j.topic || "" };
  } catch {
    return { intent: "general", confidence: 0, topic: "" };
  }
}

// ---- 3) Hybrid: use regex, then fall back to LLM if needed
async function detectIntent(q) {
  const fast = followupIntentRegex(q);
  if (fast !== "general") return { intent: fast, confidence: 0.75, via: "regex" };
  const slow = await followupIntentLLM(q);
  return { ...slow, via: "llm" };
}

// ---- Legacy function for backward compatibility
function followupIntent(s = "") {
  const t = (s || "").toLowerCase().trim();
  if (!t) return false;
  return (
    /\b(why|cause|reason|how did|how come)\b/.test(t) ||                // WHY
    /\b(prognosis|predict|prediction|outlook|course|will it get)\b/.test(t) || // PROGNOSIS
    /\b(risk|danger|serious|bad|good or not|is it good|safe to wait|urgent)\b/.test(t)
  );
}

// --- Detect topical intent ---
function mentionsCreams(s=""){
  return /\b(cream|ointment|gel|lotion|topical|calamine|steroid)\b/i.test(s||"");
}

// --- Minimal dermatology info we want before giving creams ---
const DERM_REQUIRED = [
  "duration",    // "3 days", "1 week"
  "severity",    // "Mild|Moderate|Severe"
  "location",    // "elbows", "face", etc.
  "itch",        // yes/no
  "scaling",     // yes/no
  "spreading",   // yes/no
  "discharge",   // yes/no
  "bleeding"     // yes/no
];

// Which fields are still missing?
function dermMissing(session){
  const a = session.triage?.answers || {};
  return DERM_REQUIRED.filter(k => !(k in a) || a[k] === "");
}

// Map each missing key → one short question + expected answer type
function dermQuestionFor(key){
  switch(key){
    case "duration":   return { key, expecting:"duration", q:"How long has the rash been there? (e.g., 5 days, 2 weeks)" };
    case "severity":   return { key, expecting:"free",     q:"How severe is it right now? (Mild / Moderate / Severe)" };
    case "location":   return { key, expecting:"location", q:"Where on the body is it? (e.g., elbows, knees, face, groin)" };
    case "itch":       return { key, expecting:"yesno",    q:"Is it itchy? (Yes/No)" };
    case "scaling":    return { key, expecting:"yesno",    q:"Do you see white/silvery scaling? (Yes/No)" };
    case "spreading":  return { key, expecting:"yesno",    q:"Is it spreading or growing? (Yes/No)" };
    case "discharge":  return { key, expecting:"yesno",    q:"Any discharge or pus? (Yes/No)" };
    case "bleeding":   return { key, expecting:"yesno",    q:"Any cracking or bleeding? (Yes/No)" };
    default:           return { key:"note", expecting:"free", q:"Anything else important I should know?" };
  }
}

// When is info "enough" to tailor creams safely?
function dermEnough(session){
  const a = session.triage?.answers || {};
  const coreOK = ["duration","severity","location"].every(k => a[k]);
  let yesNoCount = 0; ["itch","scaling","spreading","discharge","bleeding"].forEach(k=>{
    if (k in a) yesNoCount++;
  });
  return coreOK && yesNoCount >= 2; // tweak if you want more/less
}

// --------- Input parsing helpers ---------
function parseNumber(s = "") {
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function parseYesNo(s = "") {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (/\b(yes|y|yeah|yup|true|sure|haan|ha)\b/.test(t)) return "yes";
  if (/\b(no|n|nope|false|nah|na)\b/.test(t)) return "no";
  return null;
}

function parseDurationDays(s = "") {
  const t = s.trim().toLowerCase();
  if (!t) return null;

  // numerals like "3", "10"
  const digit = t.match(/(\d+(?:\.\d+)?)/);
  const word2num = {
    one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
    eleven:11,twelve:12
  };
  let n = null;
  if (digit) n = Number(digit[1]);
  else {
    const word = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
    if (word) n = word2num[word[1]];
  }

  // units (default=days)
  let mult = 1;
  if (/week/.test(t)) mult = 7;
  else if (/month/.test(t)) mult = 30;
  else if (/year/.test(t)) mult = 365;
  else if (/day/.test(t)) mult = 1;

  if (/today/.test(t)) return 0;
  if (/yesterday/.test(t)) return 1;

  if (n != null && !Number.isNaN(n)) return Math.max(0, Math.round(n * mult));
  return null;
}

function validateAnswer(key, rawText) {
  const t = (rawText || "").trim();
  switch (key) {
    case "duration": {
      const days = parseDurationDays(t);
      if (days == null) {
        return {
          ok: false,
          message: "That doesn't look like a duration. Please reply like **3 days**, **1 week**, or **today**."
        };
      }
      return { ok: true, value: `${days} day(s)` };
    }
    case "fever": {
      const yn = parseYesNo(t);
      if (!yn) {
        return { ok: false, message: "Please reply **Yes** or **No** for fever." };
      }
      return { ok: true, value: yn };
    }
    // add more keyed validations if you want:
    // case "impact": ...
    default:
      // accept any free text
      return { ok: true, value: t };
  }
}

// Type-based validation for AI-generated questions
function validateByType(expect, raw){ 
  const t=(raw||"").trim();
  switch((expect||"free").toLowerCase()){
    case "yesno": { 
      const v=parseYesNo(t); 
      if(!v) return {ok:false,msg:"Please reply **Yes** or **No**."}; 
      return {ok:true,val:v}; 
    }
    case "duration": { 
      const d=parseDurationDays(t); 
      if(d==null) return {ok:false,msg:"Give a duration like **3 days**, **1 week**, or **today**."}; 
      return {ok:true,val:`${d} day(s)`}; 
    }
    case "number": { 
      const n=Number(t.match(/-?\d+(?:\.\d+)?/)?.[0]); 
      if(Number.isNaN(n)) return {ok:false,msg:"Please enter a number (e.g., 3)."}; 
      return {ok:true,val:n}; 
    }
    case "location": { 
      if(!t) return {ok:false,msg:"Please mention the body location (e.g., right ear, lower tummy)."}; 
      return {ok:true,val:t}; 
    }
    default: { 
      if(!t) return {ok:false,msg:"Please add a few words so I can help."}; 
      return {ok:true,val:t}; 
    }
  }
}

// AI helper to suggest the next question
async function aiSuggestNextQuestion(session){
  // build a compact transcript for context
  const hist = (session.triage?.history || []).slice(-12); // last 12 turns
  const convo = hist.map(h => (h.role==="user" ? `U: ${h.text}` : `A: ${h.text}`)).join("\n");

  const contents = [
    { role:"user", parts:[{ text: TRIAGE_QUESTION_SYSTEM }] },
    { role:"user", parts:[{ text: "Conversation so far:\n" + (convo || "(empty)") }] }
  ];

  const raw = await geminiGenerate({ contents });
  const j = extractLeadingJSON(raw);
  if (!j || (typeof j !== 'object')) {
    return { done:false, next_question:"What is your MAIN symptom? (few words)", expecting:"free", key:"main" };
  }
  // safe defaults
  return {
    done: !!j.done,
    next_question: (j.next_question || "Can you describe your main symptom?").trim(),
    expecting: (j.expecting || "free").trim(),
    key: (j.key || "answer").trim()
  };
}

// Generate detailed doctor plans using Gemini
async function generateDoctorPlan({ session, focus = "", detail = "detailed" }) {
  const hx = (session.triage?.history || []).slice(-20)
    .map(h => (h.role === "user" ? `U: ${h.text}` : `A: ${h.text}`)).join("\n");

  const caseObj = {
    answers: session.triage?.answers || {},
    last_derma: session.last_derma || null,
    focus, detail,
  };

  const contents = [
    { role: "user", parts: [{ text: DOCTOR_PLAN_SYSTEM }] },
    { role: "user", parts: [{ text: "Conversation (last turns):\n" + (hx || "(empty)") }] },
    { role: "user", parts: [{ text: "CASE:\n" + JSON.stringify(caseObj, null, 2) }] }
  ];

  const raw = await geminiGenerate({ contents });
  const p = extractLeadingJSON(raw) || {};

  // Extract disease/condition for YouTube search
  let diseaseCondition = "";
  if (p.summary) {
    diseaseCondition = p.summary;
  } else if (p.likely_causes && p.likely_causes.length > 0) {
    diseaseCondition = p.likely_causes[0];
  } else if (session.triage?.answers?.main_symptom) {
    diseaseCondition = session.triage.answers.main_symptom;
  } else {
    diseaseCondition = "general health condition";
  }

  // Get YouTube suggestion
  let youtubeData = null;
  try {
    youtubeData = await suggestYoutubeVideo(diseaseCondition);
  } catch (error) {
    console.error("YouTube suggestion failed:", error);
    youtubeData = {
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(diseaseCondition + " treatment")}`,
      title: `Learn more about ${diseaseCondition}`,
      type: "search"
    };
  }

  return {
    done: true,
    summary: p.summary || "Care plan",
    virus_vs_bacteria: p.virus_vs_bacteria || "unclear",
    why_causes: p.why_causes || "",
    likely_causes: Array.isArray(p.likely_causes) ? p.likely_causes : [],
    what_to_do_now: Array.isArray(p.what_to_do_now) ? p.what_to_do_now : [],

    home_remedies: Array.isArray(p.home_remedies) ? p.home_remedies : [],
    hydration: p.hydration || {
      ors_recipe: "WHO home ORS: 6 level tsp sugar + 1/2 level tsp salt in 1L clean water",
      how_much: "Sip small amounts often; ~1–2 L/day unless told otherwise",
      when: "After each loose stool or vomit; pause if fluid-restricted/swelling"
    },

    food_plan: Array.isArray(p.food_plan) ? p.food_plan : [],
    foods_to_eat: Array.isArray(p.foods_to_eat) ? p.foods_to_eat : [],
    foods_to_avoid: Array.isArray(p.foods_to_avoid) ? p.foods_to_avoid : [],

    creams_topicals: Array.isArray(p.creams_topicals) ? p.creams_topicals : [],
    how_to_use_topicals: Array.isArray(p.how_to_use_topicals) ? p.how_to_use_topicals : [],
    tablets_oral_to_discuss: Array.isArray(p.tablets_oral_to_discuss) ? p.tablets_oral_to_discuss
                               : (Array.isArray(p.meds_to_discuss) ? p.meds_to_discuss : []),
    how_to_use_orals: Array.isArray(p.how_to_use_orals) ? p.how_to_use_orals : [],

    prevention: Array.isArray(p.prevention) ? p.prevention : [],
    prevention_detailed: Array.isArray(p.prevention_detailed) ? p.prevention_detailed : [],

    expected_course: p.expected_course || "",
    expected_course_timeline: Array.isArray(p.expected_course_timeline) ? p.expected_course_timeline : [],

    common_mistakes: Array.isArray(p.common_mistakes) ? p.common_mistakes : [],
    faqs: Array.isArray(p.faqs) ? p.faqs : [],

    red_flags: Array.isArray(p.red_flags) ? p.red_flags : [],
    red_flags_thresholds: Array.isArray(p.red_flags_thresholds) ? p.red_flags_thresholds : [],

    // Add YouTube suggestion
    youtube: youtubeData
  };
}

// Generate focused answers for follow-up questions
const QA_BASE_SYSTEM = `
You are a clinician assistant. Answer ONLY the user's question concisely and professionally.
Use short headings + bullet points. No fluff. Include one-line safety note if relevant.
Not medical advice.
`;

function taskByIntent(intent){
  switch (intent){
    case "overview":  return "Return JSON exactly as per schema.";
    case "symptoms":  return "Return JSON sections for Common/ Less common/ Emergency signs.";
    case "cause":     return "Explain likely causes (2–5 bullets).";
    case "prevention":return "4–8 practical prevention tips.";
    case "treatment": return "Safe first-line measures; OTC only if previously advised by a doctor; when to seek care.";
    case "vaccine":   return "High-level vaccine/booster guidance.";
    case "tests":     return "Common tests to confirm/rule out; what each checks.";
    default:          return "Answer directly in 3–6 concise bullets.";
  }
}

// C) Use your Gemini wrapper to answer overview
async function answerFollowUp({ session, userText, intent }) {
  const context = {
    diagnoses: session?.last_plan?.top || [],
    summary:   session?.last_plan?.summary || ""
  };

  const system =
    intent === "overview"  ? OVERVIEW_JSON_SYSTEM :
    intent === "symptoms"  ? SYMPTOMS_JSON_SYSTEM :
    intent === "vaccine"   ? VAX_QA_SYSTEM :
                             QA_BASE_SYSTEM;

  const raw = await geminiGenerate({
    contents: [
      { role: "user", parts: [{ text: system }] },
      { role: "user", parts: [{ text: "RECENT CONTEXT:\n" + JSON.stringify(context) }] },
      { role: "user", parts: [{ text: "QUESTION:\n" + userText }] },
      { role: "user", parts: [{ text: "TASK:\n" + taskByIntent(intent) }] },
    ]
  });

  // We return HTML-ready text (Gemini already formats with headings/bullets).
  return raw;
}

// Legacy function for backward compatibility
async function answerFollowupQuestion({ session, userText = "" }) {
  const hx = (session.triage?.history || []).slice(-20)
    .map(h => (h.role === "user" ? `U: ${h.text}` : `A: ${h.text}`)).join("\n");

  const lastPlan = session.last_plan || null; // store this when you generate plans
  const caseObj = {
    answers: session.triage?.answers || {},
    last_plan: lastPlan
  };

  const contents = [
    { role: "user", parts: [{ text: FOLLOWUP_QA_SYSTEM }] },
    { role: "user", parts: [{ text: "Conversation (last turns):\n" + (hx || "(empty)") }] },
    { role: "user", parts: [{ text: "USER QUESTION:\n" + userText }] },
    { role: "user", parts: [{ text: "CASE:\n" + JSON.stringify(caseObj, null, 2) }] }
  ];

  const raw = await geminiGenerate({ contents });
  const j = extractLeadingJSON(raw) || {};
  
  // Hard strip: if qa_answer contains known headings, collapse to 1–2 lines
  const H = /(summary|likely causes|what to do now|foods|hydration|red flags)/i;
  if (Array.isArray(j.qa_answer) && j.qa_answer.some(x => H.test(String(x)))) {
    j.qa_answer = [ "Here's the direct answer without repeating the plan:", String(j.qa_answer.find(x => !H.test(String(x))) || "").slice(0, 240) ];
  }
  
  return {
    qa_answer: Array.isArray(j.qa_answer) ? j.qa_answer : (j.qa_answer ? [String(j.qa_answer)] : []),
    risk_assessment: j.risk_assessment || "",
    action_now: Array.isArray(j.action_now) ? j.action_now : [],
    if_uncertain: j.if_uncertain || ""
  };
}

// -------------------------------------------------------------------------------------
// Prompts
// -------------------------------------------------------------------------------------
const SKIN_SYSTEM = `
You are a strict dermatology prediction engine.

OUTPUT RULES:
- ALWAYS reply with JSON only (no markdown, no code fences, no prose).
- Schema:
{
  "predictions": [ { "label": "string", "probability": 0.0 } ],
  "next_question": "string",
  "final_assessment": null | "string",
  "advice": "string"
}
- "predictions" are the most likely skin conditions from the single image (max 5; probs 0..1).
- Keep "advice" short (≤ 2 lines). NO dosing, NO long disclaimers.
`;

const DOCTOR_SYSTEM = `
You are a primary-care doctor for India.

HARD RULES
- If NO image is provided, DO NOT mention skin/rash/photos at all.
- Ask ONE focused follow-up at a time (WhatsApp-length).
- Provide: what to do now, diet/fluids, specific food items to eat/avoid, simple home remedies, prevention. Always mention whether the cause is more likely VIRAL or BACTERIAL if applicable. Also include likely side effects/complications if untreated.
- OTC: only say "talk to your doctor/pharmacist" (NO doses).
- Always include red flags.

Return JSON ONLY (no prose), schema:
{
  "doctor_message": "string",
  "next_question": "string",
  "done": boolean,
  "summary": "string",
  "likely_causes": ["string"],
  "why_causes": "string",
  "virus_vs_bacteria": "string",
  "what_to_do_now": ["string"],
  "diet_and_home": ["string"],
  "foods_to_eat": ["string"],
  "foods_to_avoid": ["string"],
  "meds_to_discuss": ["string"],
  "vaccines_related": ["string"],
  "prevention": ["string"],
  "red_flags": ["string"],
  "side_effects_or_complications": ["string"],
  "tags": ["string"],
  "intent": "triage" | "home_remedies" | "diet_foods"
}
`;

const DOCTOR_DERMA_SYSTEM = `
You are a dermatologist for India with expertise in matching skin conditions to specific treatments.

CRITICAL: DISEASE-SPECIFIC DERMATOLOGY TREATMENT

**SKIN CONDITION MATCHING:**

1. **Eczema (Atopic Dermatitis)**: Dry, itchy, red patches
   - Topicals: Hydrocortisone 1% cream, Moisturizing cream (Cetaphil, Cerave)
   - Tablets: Cetirizine 10mg once daily, Prednisolone 20mg (if severe)
   - Vaccines: None specific

2. **Psoriasis**: Thick, scaly, red patches with silvery scales
   - Topicals: Coal tar cream, Salicylic acid 3%, Clobetasol propionate 0.05%
   - Tablets: Methotrexate (severe cases - doctor prescribed)
   - Vaccines: Flu vaccine (immunosuppressed patients)

3. **Acne Vulgaris**: Pimples, blackheads, whiteheads on face
   - Topicals: Benzoyl peroxide 2.5%, Adapalene 0.1%, Clindamycin 1%
   - Tablets: Doxycycline 100mg (if moderate-severe), Isotretinoin (severe - doctor prescribed)
   - Vaccines: None specific

4. **Fungal Infections (Ringworm, Athlete's Foot)**: Circular rash, itchy, red edges
   - Topicals: Clotrimazole 1% cream, Terbinafine 1% cream, Miconazole
   - Tablets: Fluconazole 150mg weekly (if widespread), Terbinafine 250mg daily
   - Vaccines: None specific

5. **Bacterial Skin Infection (Cellulitis, Impetigo)**: Red, swollen, warm, tender
   - Topicals: Mupirocin 2% ointment, Fusidic acid cream
   - Tablets: Cephalexin 500mg 4x daily, Amoxicillin-Clavulanate 625mg
   - Vaccines: Tetanus booster if wound

6. **Contact Dermatitis (Allergic Rash)**: Itchy, red, swollen after contact
   - Topicals: Hydrocortisone 1% cream, Calamine lotion
   - Tablets: Cetirizine 10mg, Prednisolone 20mg (if severe)
   - Vaccines: None specific

7. **Seborrheic Dermatitis**: Flaky, scaly patches on scalp/face
   - Topicals: Ketoconazole 2% shampoo, Hydrocortisone 1% cream
   - Tablets: None usually needed
   - Vaccines: None specific

8. **Urticaria (Hives)**: Raised, itchy welts
   - Topicals: Calamine lotion, Cooling gel
   - Tablets: Cetirizine 10mg twice daily, Prednisolone 20mg (severe)
   - Vaccines: None specific

9. **Scabies**: Intense itching at night, linear burrows
   - Topicals: Permethrin 5% cream (apply whole body)
   - Tablets: Ivermectin 12mg (single dose, repeat after 7 days)
   - Vaccines: None specific

10. **Warts**: Rough, raised bumps (viral)
    - Topicals: Salicylic acid 17% solution
    - Tablets: None specific (consider immune boosters)
    - Vaccines: HPV vaccine (prevents certain warts)

11. **Herpes Simplex (Cold Sores)**: Painful blisters on lips
    - Topicals: Acyclovir 5% cream
    - Tablets: Acyclovir 400mg 5x daily OR Valacyclovir 500mg twice daily
    - Vaccines: None specific

12. **Shingles (Herpes Zoster)**: Painful rash in band pattern
    - Topicals: Lidocaine cream, Calamine lotion
    - Tablets: Valacyclovir 1000mg 3x daily for 7 days, Gabapentin 300mg for pain
    - Vaccines: Shingles Vaccine (Shingrix) for age 50+ (PRIORITY)

RULES:
1. Identify EXACT skin condition from symptoms
2. Provide SPECIFIC creams/ointments for that condition
3. Include SPECIFIC tablets with dosages
4. Mention condition-appropriate vaccines
5. NEVER give generic "antifungal cream" - specify Clotrimazole 1%
6. NEVER say "antibiotics if needed" - specify Cephalexin 500mg
7. Include HOW TO USE for each medicine
8. Duration: "for 7 days", "for 2 weeks", "until clear"

Return JSON ONLY (no prose), schema:
{
  "done": true,
  "summary": "Specific condition diagnosis and treatment approach",
  "virus_vs_bacteria": "viral|bacterial|fungal|allergic|autoimmune",
  "why_causes": "Why this specific condition occurs",
  "likely_causes": ["Specific causes of this skin condition"],
  "what_to_do_now": ["Immediate steps specific to this condition"],
  "diet_and_home": ["Home remedies specific to this condition"],
  "foods_to_eat": ["Foods that help this specific condition"],
  "foods_to_avoid": ["Foods that worsen this condition"],
  "creams_topicals": [
    "Hydrocortisone 1% cream - Apply thin layer twice daily to affected areas for 7 days",
    "Clotrimazole 1% cream - Apply to rash twice daily for 2 weeks (if fungal)"
  ],
  "tablets_oral_to_discuss": [
    "Cetirizine 10mg - Take 1 tablet once daily for itching for 5-7 days",
    "Fluconazole 150mg - Take 1 tablet weekly for 2 weeks (if fungal infection)"
  ],
  "how_to_use_topicals": [
    "Wash affected area gently with mild soap and pat dry",
    "Apply thin layer of cream to affected area only",
    "Avoid contact with eyes and broken skin",
    "Wash hands thoroughly after application"
  ],
  "how_to_use_orals": [
    "Take tablets after food to avoid stomach upset",
    "Complete full course even if symptoms improve",
    "Do not exceed recommended dosage",
    "Avoid alcohol while taking antibiotics"
  ],
  "prevention": ["Specific prevention for this condition"],
  "red_flags": ["Urgent signs specific to this condition"],
  "tags": ["condition-specific tags"]
}
`;

// ===== Detailed Doctor Plan (plain-language, expanded mode supported) =====
const DOCTOR_PLAN_SYSTEM = `
You are a clinician in India. Write a clear, plain-language care plan.
Return STRICT JSON ONLY (no prose outside JSON).

STYLE
- Friendly doctor voice, short bullets, but explain in simple words.
- Each section 4–8 bullets normally. If case.detail === "expanded", use 6–10 bullets and add an extra ELI5 line where helpful.
- IMPORTANT: Provide SPECIFIC medicine names with dosages for common conditions.

MEDICATION GUIDELINES - YOU MUST PROVIDE THESE:
- For FEVER/PAIN: Suggest "Paracetamol 500mg every 6 hours" or "Ibuprofen 400mg twice daily"
- For ALLERGIES: Suggest "Cetirizine 10mg once daily" or "Loratadine 10mg once daily"
- For COUGH: Suggest specific cough syrups with dosages
- For STOMACH: Suggest "Omeprazole 20mg once daily before breakfast"
- For INFECTIONS: If viral, suggest supportive care; if bacterial signs, mention "Doctor may prescribe antibiotics"
- ALWAYS include VACCINES when relevant (Flu vaccine, COVID-19 booster, Pneumococcal, Tetanus, etc.)
- ALWAYS be SPECIFIC with dosages: Use "500mg", "1mg", "10mg" NOT "low dose" or "as needed"
- ALWAYS include duration: "for 3 days", "for 5-7 days", "for 2 weeks"
- ALWAYS include frequency: "twice daily", "every 6 hours", "once at bedtime"

CONTENT RULES
- For each bullet, include brief "why it helps" in the same line.
- Include a short "common mistakes to avoid" list.
- Include a 3–5 item FAQ section, question/answer in simple words.
- Nutrition: if foods are included, give approximate protein_pct (range), key_vitamins/minerals, and portion (typical household measure).

SCHEMA:
{
  "done": true,
  "summary": "1–2 lines recap of symptoms and duration",
  "virus_vs_bacteria": "viral | bacterial | allergic | inflammatory | unclear",
  "why_causes": "2–3 sentences (what could be happening)",
  "likely_causes": [{"name": "string", "why": "string"}],
  "what_to_do_now": [{"step": "string", "why": "string", "eli5": "string"}],

  "home_remedies": [{"remedy":"string","how":"string","caveat":"string"}],
  "hydration": {
    "ors_recipe": "WHO home ORS: 6 level tsp sugar + 1/2 level tsp salt in 1L clean water",
    "how_much": "Sip small amounts often; target 1–2 L/day unless told otherwise",
    "when": "Use ORS after each loose stool or vomit; stop if fluid-restricted or swelling"
  },

  "food_plan": [
    {
      "name": "string",
      "portion": "string",
      "protein_pct": "string",
      "key_vitamins": ["string"],
      "why": "string",
      "alternatives": ["string"]
    }
  ],
  "foods_to_eat": ["string"],
  "foods_to_avoid": ["string"],

  "creams_topicals": ["string - be specific with percentages like 'Hydrocortisone 1% cream'"],
  "how_to_use_topicals": ["Apply [cream name] twice daily to affected area for [duration]"],
  "tablets_oral_to_discuss": [
    "Paracetamol 500mg - Take 1 tablet every 6 hours for fever (max 4 times daily) for 3-5 days",
    "Cetirizine 10mg - Take 1 tablet once daily for allergy symptoms for 5-7 days",
    "Vitamin C 1000mg - Take once daily for immune support for 7 days"
  ],
  "vaccines_recommended": [
    {"name": "Annual Flu Vaccine", "reason": "Prevents influenza infections", "schedule": "Once yearly, preferably before flu season"},
    {"name": "COVID-19 Booster", "reason": "Maintains immunity against COVID-19", "schedule": "Every 6 months or as recommended"},
    {"name": "Pneumococcal Vaccine", "reason": "Prevents pneumonia (for elderly/at-risk)", "schedule": "One-time or booster as advised"}
  ],
  "how_to_use_orals": [
    "Take tablets after food to avoid stomach upset",
    "Complete the full course even if feeling better",
    "Do not exceed recommended dosages",
    "Stop immediately if rash, swelling, or severe side effects occur",
    "Avoid alcohol while taking medications"
  ],

  "prevention": ["string"],
  "prevention_detailed": [
    {"topic":"hygiene","tip":"Wash hands before eating/after restroom; safe water."},
    {"topic":"rest","tip":"7–9h sleep; light activity only until better."},
    {"topic":"vaccination","tip":"Keep vaccines up-to-date (Flu, COVID-19, Pneumococcal as needed)."}
  ],

  "expected_course": "1–2 lines",
  "expected_course_timeline": [
    {"day":"Day 1","note":"Most symptoms; fluids + rest are priority."},
    {"day":"Day 2–3","note":"Should ease; appetite returns slowly."},
    {"day":"Day 4–5","note":"Near baseline if viral; if not improving, reassess."}
  ],

  "common_mistakes": ["string"],

  "faqs": [
    {"q":"string","a":"string"},
    {"q":"string","a":"string"}
  ],

  "red_flags": ["string"],
  "red_flags_thresholds": [
    "Fever > 102°F (38.9°C) for > 48 hours",
    "Vomiting ≥ 6 times in 6 hours or blood in vomit/stool",
    "Unable to keep fluids 6–8 hours; very low urine",
    "Severe one-sided abdominal pain or rigid abdomen",
    "Confusion, severe weakness, chest pain, trouble breathing"
  ]
}

CRITICAL MEDICATION RULES:
- ALWAYS provide specific medicine names with exact dosages (500mg, 1mg, 10mg)
- ALWAYS include frequency (twice daily, every 6 hours, once at bedtime)
- ALWAYS include duration (for 3 days, for 5-7 days, for 2 weeks)
- ALWAYS suggest vaccines when relevant to the condition
- For viral infections: Paracetamol for fever + Vitamin C + rest + Flu vaccine
- For allergies: Antihistamines (Cetirizine 10mg) + topical creams + avoidance tips
- For bacterial infections: Mention "Doctor will prescribe antibiotics if needed" + supportive care
- Include safety disclaimer: "Consult doctor if symptoms worsen or persist beyond expected timeline"
`;

// ===== Follow-up Q&A (answer only the user's question) =====
const FOLLOWUP_QA_SYSTEM = `
You are a clinician in India. Answer ONLY the user's specific follow-up question
based on the current case and the last plan. Do NOT repeat sections or headings.
Be short, precise, and kind. If chest pain or red flags imply risk, say so clearly.

Return STRICT JSON ONLY:
{
  "qa_answer": ["string"],             // 3–8 short bullets or 2 short paragraphs
  "risk_assessment": "low|moderate|high and why (1 line)",
  "action_now": ["string"],            // 2–5 bullets with next steps
  "if_uncertain": "1 short line asking one clarifying question (optional)"
}

Rules:
- No diagnosis; use "likely", "consider".
- No doses, no brand names.
- Avoid repeating content already given; give only the delta: what the user just asked for.
- If the question is "why does this pain come", explain mechanisms in plain words for the TOP 2–3 likely causes, tailored to the case.
- If the user asks "is it good or not", give an honest risk summary + what to do now.
`;

// B) Add a tidy "overview" prompt
const OVERVIEW_SYSTEM = `
You are a clinician assistant. Return a short, clean overview with headings and bullet points.
Sections (in this order): 
1) What it is (1–2 lines) 
2) Key symptoms (5–8 bullets) 
3) Prevention (3–6 bullets) 
4) When to seek care (3–5 bullets)
Write concise bullets, no fluff. End with: "Not medical advice."
`;

// JSON system prompt for overview
const OVERVIEW_JSON_SYSTEM = `
Return STRICT JSON ONLY (no code fences).

Schema:
{
  "sections": [
    {"title":"What it is","items":["1–2 short lines as separate items"]},
    {"title":"Key symptoms","items":["short bullet","..."]},
    {"title":"Prevention","items":["..."]},
    {"title":"When to seek care","items":["..."]}
  ],
  "safety":"Not medical advice."
}

Rules:
- Keep bullets short (2–8 words).
- Include only the sections above, omit empty ones.
- No extra keys, no prose outside JSON.
`;

// -------------------------------------------------------------------------------------
// AI-powered triage system
// -------------------------------------------------------------------------------------

// Friendly, one-by-one triage question writer
const TRIAGE_QUESTION_SYSTEM = `
You are a friendly healthcare triage assistant for India. Your job: ask ONE short, clear, naturally-phrased question at a time to understand symptoms.
Tone: warm, conversational, like a caring doctor. Always use a full, natural sentence — never a command or fragment (e.g., say "Where exactly are you feeling the pain?" not "Where is the pain").

Rules:
- Start with a friendly line once (if it's clearly a greeting), then ask for main symptom.
- After that, ask only ONE specific next question based on what the user said.
- Prefer targeted follow-ups (location, duration, yes/no red flags) over broad repeats.
- Phrase every question as a complete, natural sentence a real doctor would say.
- When user asks for treatment/remedies, set done=true (triage ends) so the app will generate a plan.
- Never give a diagnosis or treatment here. Only ask the next question.

Return STRICT JSON ONLY:
{
  "done": false,
  "next_question": "string",
  "expecting": "free | yesno | duration | number | location",
  "key": "string"  // short snake_case name for the answer you expect (e.g., "duration", "eye_redness")
}
If triage can end, return {"done": true, "next_question": ""}.
`;

// Vaccine Q&A (generic, safe; no dosing/brands; refer to local programme)
const VAX_QA_SYSTEM = `
You are a clinician giving general vaccine information (not medical advice).
Answer the user's vaccine question briefly and clearly using bullet points.

Rules:
- Follow high-level WHO/CDC concepts. Do NOT provide exact dose amounts, brand names, or individualized schedules.
- Acknowledge that schedules and eligibility vary by country/clinic; direct user to local immunization programme.
- Focus on purpose, typical timing windows (age ranges), typical boosters/catch-up conceptually.
- Suggest when to see a clinician or check records.
- If question is ambiguous, ask ONE short clarifying question at the end.

Return STRICT JSON ONLY:
{
  "answer": ["bullet 1", "bullet 2", "..."],
  "safety": "one-line disclaimer",
  "clarify": "one short question if needed or empty string"
}
`;

// Symptoms JSON system prompt
const SYMPTOMS_JSON_SYSTEM = `
You answer ONLY with STRICT JSON. No code fences.

Schema:
{
  "sections": [
    {"title": "Common", "items": ["short phrase", "..."]},
    {"title": "Less common", "items": ["..."]},
    {"title": "Emergency signs", "items": ["..."]}
  ],
  "safety": "one short sentence"
}

Rules:
- Keep each item short (2–6 words).
- Omit a section if you have no items for it.
- Do not add extra keys.
- Not medical advice.
`;

function genericNextTurn(session, userText=""){
  const T = session.triage || (session.triage = {
    expecting: null, key: null, answers: {}, history: []
  });

  const t = (userText||"").trim();
  // keep chat history
  if (t) T.history.push({ role:"user", text:t });

  // if we were waiting for a specific type, validate before moving on
  if (T.expecting){
    const v = validateByType(T.expecting, t);
    if (!v.ok){
      // re-ask same question with friendly nudge
      return { done:false, doctor_message:`⚠️ ${v.msg}`, next_question: session.last_question || "Please answer the previous question." };
    }
    // store normalized answer
    const k = T.key || "answer_" + (Object.keys(T.answers).length+1);
    if (!(k in T.answers)) T.answers[k] = v.val;
    // record assistant echo of what we captured (optional)
    T.history.push({ role:"assistant", text:`Noted: ${k} = ${v.val}` });
    T.expecting = null; T.key = null;
  }

  // finalize if we already have enough context
  const enough = Object.keys(T.answers).length >= 4;
  if (enough) return { done:true, finalize:{ answers: T.answers, profile: session.profile } };

  // ask Gemini for the next question
  return { done:false, delegate_ai:true };
}

// Finalize triage to doctor plan
async function finalizeToDoctorPlan({ session, finalize }) {
  const schema = `
Return JSON ONLY in this schema:
{
  "doctor_message": "string",
  "next_question": "",
  "done": true,
  "summary": "string",
  "likely_causes": ["string"],
  "why_causes": "string",
  "virus_vs_bacteria": "string",
  "what_to_do_now": ["string"],
  "diet_and_home": ["string"],
  "foods_to_eat": ["string"],
  "foods_to_avoid": ["string"],
  "meds_to_discuss": ["string"],
  "vaccines_related": ["string"],
  "prevention": ["string"],
  "red_flags": ["string"],
  "side_effects_or_complications": ["string"],
  "tags": ["string"],
  "intent": "triage"
}`;

  const contents = [
    { role: "user", parts: [{ text: DOCTOR_SYSTEM }] },
    { role: "user", parts: [{ text: "Write a concise doctor plan for this case (India context)." }] },
    { role: "user", parts: [{ text: "CASE SUMMARY:\n" + JSON.stringify(finalize, null, 2) }] },
    { role: "user", parts: [{ text: schema }] },
  ];

  const rawPlan = await geminiGenerate({ contents });
  const parsed = extractLeadingJSON(rawPlan);
  if (!parsed) {
    throw new Error("Bad plan output");
  }

  // Store the plan and switch to Q&A mode
  session.last_plan = parsed;
  session.mode = "qa";

  return {
    path: "triage",
    sessionId: session.id,
    ...parsed,
    done: true,
    next_question: (parsed.next_question && parsed.done === true) ? parsed.next_question : ""
  };
}

// -------------------------------------------------------------------------------------
// Routes
// -------------------------------------------------------------------------------------

// Simple analyze endpoint for quick symptom analysis with YouTube suggestions
app.post("/api/analyze", async (req, res) => {
  try {
    const { symptoms } = req.body;
    
    if (!symptoms || typeof symptoms !== 'string') {
      return res.status(400).json({ error: "Symptoms are required" });
    }

    // Create a temporary session for analysis
    const session = newSession();
    session.triage.answers.main_symptom = symptoms;
    session.triage.history.push({ role: "user", text: symptoms });

    // Generate comprehensive diagnosis with medication suggestions using disease-specific treatment logic
    const systemPrompt = `You are a medical AI assistant with expertise in accurate disease diagnosis. Analyze the symptoms and match them to the SPECIFIC disease.

CRITICAL: Match symptoms to EXACT disease and provide DISEASE-SPECIFIC treatment:

**DISEASE DIAGNOSTIC MATCHING:**

Influenza (Flu): HIGH fever>101°F + severe body aches + chills + dry cough
→ Oseltamivir (Tamiflu) 75mg twice daily + Paracetamol 650mg + Flu Vaccine (PRIORITY)

Strep Throat: SEVERE sore throat + pus on tonsils + fever + sudden onset
→ Amoxicillin 500mg 3x daily for 10 days + Tdap Booster

COVID-19: Fever + dry cough + loss of taste/smell + fatigue
→ Paracetamol + Vitamin D3 2000IU + Vitamin C 1000mg + Zinc 50mg + COVID Vaccine

Viral Gastroenteritis: Diarrhea + vomiting + cramps
→ ORS + Ondansetron 4mg + Probiotics + Rotavirus/Typhoid Vaccines

UTI: Burning urination + frequent urination
→ Nitrofurantoin 100mg twice daily + plenty of water

Pneumonia: Productive cough + chest pain + breathing difficulty + fever
→ Azithromycin 500mg + Pneumococcal Vaccine (PRIORITY)

Chickenpox: Itchy blisters + fever
→ Acyclovir 800mg 5x daily + Calamine lotion + Varicella Vaccine

Dengue: High fever + severe headache + joint pain + rash + low platelets
→ Paracetamol ONLY (NO Ibuprofen!) + Monitor platelets + Dengue Vaccine

Typhoid: Prolonged fever>7 days + rose spots + constipation
→ Azithromycin 500mg daily for 7 days + Typhoid Vaccine (PRIORITY)

Allergic Rhinitis: Sneezing + runny nose + itchy eyes + seasonal
→ Cetirizine 10mg OR Loratadine 10mg + Fluticasone spray + Flu Vaccine

Shingles: Painful rash in band pattern + burning
→ Valacyclovir 1000mg 3x daily + Gabapentin + Shingles Vaccine (Shingrix) for 50+

Bronchitis: Persistent cough with mucus + chest discomfort
→ Ambroxol 30mg 3x daily + Salbutamol + Flu Vaccine

RULES:
1. Identify EXACT disease from symptoms
2. Provide medicines SPECIFIC to that disease
3. Include disease-appropriate vaccines
4. Specify exact dosages and duration
5. NEVER give generic treatment - match treatment to diagnosis

Respond in JSON format:
{
  "disease": "condition name",
  "explanation": "brief explanation of the condition",
  "medicines": {
    "tablets": [{"name": "medicine name", "dosage": "dose", "frequency": "how often", "duration": "how long"}],
    "creams": [{"name": "cream/ointment name", "application": "how to apply"}],
    "vaccines": [{"name": "vaccine name", "reason": "why recommended"}]
  },
  "homeRemedies": ["remedy 1", "remedy 2"],
  "whenToSeeDoctor": "urgent signs to watch for",
  "advice": "brief general advice"
}`;

    const contents = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "user", parts: [{ text: `Symptoms: ${symptoms}` }] }
    ];

  console.log('🔎 /api/analyze start - symptoms length:', (symptoms || '').length);
  const gStart = Date.now();
  const rawResponse = await geminiGenerate({ contents });
  console.log(`🧠 geminiGenerate took ${Date.now() - gStart} ms`);
  const parsed = extractLeadingJSON(rawResponse) || {};
    
    const predictedDisease = parsed.disease || "General Health Condition";
    const explanation = parsed.explanation || "";
    const medicines = parsed.medicines || { tablets: [], creams: [], vaccines: [] };
    const homeRemedies = parsed.homeRemedies || [];
    const whenToSeeDoctor = parsed.whenToSeeDoctor || "If symptoms worsen or persist for more than 3 days";
    const advice = parsed.advice || "Please consult with a healthcare professional for proper diagnosis and treatment.";

    // Get YouTube suggestion (measure time)
    const yStart = Date.now();
    const youtube = await suggestYoutubeVideo(predictedDisease);
    console.log(`📺 suggestYoutubeVideo took ${Date.now() - yStart} ms`);

    // Get detailed FDA information for suggested tablets in parallel (limit to 3)
    let tabletsWithDetails = [];
    const tabletsList = (medicines.tablets || []).slice(0, 3);
    if (tabletsListLength === undefined) {
      // defensive name - not used, just keeping code robust
    }
    if (tabletsList.length > 0) {
      const fdaStart = Date.now();
      const tabletPromises = tabletsList.map(async (tablet) => {
        try {
          const medicineInfo = await getDrugInfoFromFDA(tablet.name);
          if (medicineInfo) {
            return {
              ...tablet,
              fdaInfo: {
                genericName: medicineInfo.genericName,
                brandNames: (medicineInfo.brandNames || []).slice(0, 3),
                warnings: medicineInfo.warnings ? medicineInfo.warnings.substring(0, 200) + '...' : '',
                hasFullInfo: true
              }
            };
          }
          return { ...tablet, fdaInfo: { hasFullInfo: false } };
        } catch (e) {
          return { ...tablet, fdaInfo: { hasFullInfo: false } };
        }
      });

      try {
        tabletsWithDetails = await Promise.all(tabletPromises);
      } catch (e) {
        console.warn('Error resolving FDA promises', e);
        // fallback to original tablet list
        tabletsWithDetails = tabletsList;
      }

      console.log(`💊 FDA lookups for ${tabletsList.length} tablets took ${Date.now() - fdaStart} ms`);
    }

    res.json({
      disease: predictedDisease,
      explanation: explanation,
      medicines: {
        tablets: tabletsWithDetails.length > 0 ? tabletsWithDetails : medicines.tablets,
        creams: medicines.creams || [],
        vaccines: medicines.vaccines || []
      },
      homeRemedies: homeRemedies,
      whenToSeeDoctor: whenToSeeDoctor,
      advice: advice,
      youtube: youtube,
      medicationLookupUrl: "http://localhost:5000/medication-lookup.html"
    });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Analysis failed" });
  }
});

// -------------------------------------------------------------------------------------
// USER AUTHENTICATION ROUTES
// -------------------------------------------------------------------------------------

// Register new user
app.post('/api/auth/register', express.json(), async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered. Please login instead.'
      });
    }

    // Create new user (password will be hashed by pre-save hook)
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash: password, // Will be hashed by pre-save hook
      name,
      phone: phone || ''
    });

    // Generate JWT token
    const token = generateToken(user._id.toString(), user.email);

    console.log(`✅ New user registered: ${user.email} (ID: ${user._id})`);

    res.json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
});

// Login user
app.post('/api/auth/login', express.json(), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
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
    const token = generateToken(user._id.toString(), user.email);

    console.log(`✅ User logged in: ${user.email} (ID: ${user._id})`);

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
      error: 'Login failed. Please try again.'
    });
  }
});

// Get current user profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile'
    });
  }
});

// Simple mock ordering endpoint (for demo/testing)
app.post('/api/order', express.json(), (req, res) => {
  try {
    const { medication, quantity } = req.body || {};
    if (!medication) return res.status(400).json({ ok: false, error: 'medication required' });
    const q = parseInt(quantity, 10) || 1;

    // In a real system: validate stock, user auth, payment gateway, shipping, etc.
    // Here we mock an order id and return success.
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase().slice(-8);

    console.log(`New order received: ${medication} x${q} -> ${orderId}`);

    return res.json({ ok: true, orderId, medication, quantity: q });
  } catch (e) {
    console.error('Order error', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

// Cough Analysis Endpoint - Audio processing and MATLAB integration
app.post("/api/cough/analyze", optionalAuth, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        ok: false, 
        error: "Audio file is required for cough analysis" 
      });
    }

    console.log(`📧 Received audio file: ${req.file.originalname}, size: ${req.file.size} bytes`);

    // Calculate audio file hash for caching
    const audioHash = getAudioHash(req.file.buffer);
    console.log(`🔑 Audio hash: ${audioHash.substring(0, 16)}...`);

    // Check if we have cached results for this exact audio file
    if (ANALYSIS_CACHE.has(audioHash)) {
      console.log('💾 Using cached analysis result (same audio file uploaded before)');
      const cachedResult = ANALYSIS_CACHE.get(audioHash);
      return res.json({
        ok: true,
        analysis: cachedResult.analysis,
        analysisMethod: cachedResult.method,
        cached: true,
        message: 'Analysis retrieved from cache (same audio analyzed before)'
      });
    }

    // Create session for this analysis
    const session = newSession();
    
    // Try MATLAB analysis first, fall back to simulation if MATLAB not available
    let analysisResult;
    let usedMethod = 'simulation';
    
    try {
      console.log('🔬 Attempting MATLAB analysis...');
      
      // Add a race condition with timeout to prevent hanging
      const matlabPromise = callMatlabAnalysis(req.file);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('MATLAB timeout - taking too long')), 8000);
      });
      
      analysisResult = await Promise.race([matlabPromise, timeoutPromise]);
      usedMethod = 'matlab';
      console.log('✅ MATLAB analysis completed successfully');
    } catch (matlabError) {
      console.warn('⚠️ MATLAB analysis failed, using simulation:', matlabError.message);
      analysisResult = await simulateMatlabCoughAnalysis(req.file);
      analysisResult.note = 'MATLAB not available - using simulation for demonstration';
      usedMethod = 'simulation';
    }
    
    // Store analysis in session
    session.cough_analysis = {
      originalFilename: req.file.originalname,
      fileSize: req.file.size,
      analysisTimestamp: new Date().toISOString(),
      results: analysisResult
    };

    // Cache the results for this audio file (so same audio gets same results)
    ANALYSIS_CACHE.set(audioHash, {
      analysis: analysisResult,
      method: usedMethod,
      timestamp: Date.now(),
      filename: req.file.originalname
    });
    console.log(`💾 Cached analysis result for future uploads of this audio`);

    // Save to database (if connected)
    try {
      const dbStatus = getConnectionStatus();
      if (dbStatus.isConnected) {
        const coughAnalysisDoc = new CoughAnalysis({
          sessionId: session.id,
          userId: req.userId || null, // Save userId if user is authenticated
          audioFile: {
            originalName: req.file.originalname,
            size: req.file.size,
            hash: audioHash,
            mimeType: req.file.mimetype
          },
          analysis: {
            dominantFrequency: analysisResult.dominantFrequency,
            pattern: analysisResult.pattern,
            healthStatus: analysisResult.healthStatus,
            possibleConditions: analysisResult.possibleConditions,
            recommendation: analysisResult.recommendation,
            confidence: analysisResult.confidence,
            analysisMethod: usedMethod,
            frequencySpectrum: analysisResult.frequencySpectrum,
            rawMatlabResult: analysisResult
          }
        });
        
        await coughAnalysisDoc.save();
        console.log(`🗄️  Saved cough analysis to database (ID: ${coughAnalysisDoc._id})${req.userId ? ` for user ${req.userId}` : ' (anonymous)'}`);
      }
    } catch (dbError) {
      console.error('⚠️  Failed to save to database:', dbError.message);
      // Don't fail the request if database save fails
    }

    res.json({
      ok: true,
      sessionId: session.id,
      analysis: analysisResult,
      message: "Cough analysis completed successfully",
      analysisMethod: usedMethod,
      warning: usedMethod === 'simulation' ? 'MATLAB not available - using demonstration mode' : null
    });

  } catch (error) {
    console.error("Cough analysis error:", error);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to analyze cough audio", 
      details: error.message 
    });
  }
});

// Helper function to simulate MATLAB analysis (replace with actual MATLAB integration)
async function simulateMatlabCoughAnalysis(audioFile) {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Generate realistic-looking frequency analysis data
  const baseFreq = 200 + Math.random() * 800; // 200-1000 Hz range
  const dominantFreq = Math.round(baseFreq);
  
  // Determine cough pattern based on frequency
  let pattern, healthStatus, possibleConditions, recommendation;
  
  if (dominantFreq < 300) {
    pattern = "Deep, low-frequency cough";
    healthStatus = "Moderate concern";
    possibleConditions = "Possible bronchitis or lower respiratory infection";
    recommendation = "Consider seeing a doctor if symptoms persist for more than 3 days";
  } else if (dominantFreq < 500) {
    pattern = "Normal cough pattern";
    healthStatus = "Mild concern";
    possibleConditions = "Likely cold or minor respiratory irritation";
    recommendation = "Monitor symptoms, stay hydrated, rest well";
  } else if (dominantFreq < 700) {
    pattern = "High-frequency dry cough";
    healthStatus = "Moderate concern";
    possibleConditions = "Possible asthma, allergies, or upper respiratory infection";
    recommendation = "Consider consulting a healthcare professional, especially if accompanied by wheezing";
  } else {
    pattern = "Very high-frequency cough";
    healthStatus = "Requires attention";
    possibleConditions = "Possible whooping cough or severe respiratory condition";
    recommendation = "Recommend immediate medical consultation";
  }
  
  // Generate frequency spectrum data for visualization
  const frequencySpectrum = [];
  for (let i = 0; i < 100; i++) {
    const freq = i * 50; // 0-5000 Hz range
    let amplitude;
    
    // Create a peak around the dominant frequency
    const distance = Math.abs(freq - dominantFreq);
    if (distance < 100) {
      amplitude = 80 + Math.random() * 20 - distance * 0.3;
    } else {
      amplitude = Math.random() * 30 + Math.sin(i / 10) * 15;
    }
    
    frequencySpectrum.push({
      frequency: freq,
      amplitude: Math.max(0, amplitude)
    });
  }
  
  return {
    dominantFrequency: dominantFreq,
    pattern: pattern,
    healthStatus: healthStatus,
    possibleConditions: possibleConditions,
    recommendation: recommendation,
    frequencySpectrum: frequencySpectrum,
    confidence: Math.round(70 + Math.random() * 25), // 70-95% confidence
    analysisMethod: "Frequency Domain Analysis",
    additionalNotes: "This analysis is for informational purposes only. Always consult healthcare professionals for medical advice."
  };
}

// Real MATLAB integration function
async function callMatlabAnalysis(audioFile) {
  const { promises: fsPromises } = await import('fs');
  const { exec } = await import('child_process');
  
  try {
    // Save audio file temporarily - keep original extension
    const tempDir = path.join(__dirname, 'temp');
    await fsPromises.mkdir(tempDir, { recursive: true });
    
    // Determine file extension from original name or mimetype
    let ext = '.wav';
    if (audioFile.originalname) {
      const nameExt = path.extname(audioFile.originalname);
      if (nameExt) ext = nameExt;
    } else if (audioFile.mimetype === 'audio/webm') {
      ext = '.webm';
    }
    
    const tempFilePath = path.join(tempDir, `cough_${Date.now()}${ext}`);
    await fsPromises.writeFile(tempFilePath, audioFile.buffer);
    
    console.log(`📁 Saved temp file: ${tempFilePath}`);
    
    // Use MATLAB path from environment or default
    const matlabExe = MATLAB_PATH;
    console.log(`🔬 Using MATLAB path: ${matlabExe}`);
    
    // Quick check if MATLAB executable exists
    try {
      await fsPromises.access(matlabExe);
      console.log(`✅ MATLAB executable found at: ${matlabExe}`);
    } catch (err) {
      throw new Error(`MATLAB executable not found at: ${matlabExe}. Please check MATLAB_PATH in .env file.`);
    }
    
    // Call MATLAB script - using simpler cough_analysis function
    const backendPath = __dirname;
    
    // Use the simpler cough_analysis.m which is self-contained
    const matlabCommand = `"${matlabExe}" -batch "addpath('${backendPath}'); result = cough_analysis('${tempFilePath}'); exit"`;
    
    console.log(`🔬 Executing MATLAB analysis...`);
    console.log(`📁 MATLAB command: ${matlabCommand.substring(0, 150)}...`);
    
    return new Promise((resolve, reject) => {
      // Set timeout to 30 seconds to allow MATLAB startup time
      const timeoutId = setTimeout(() => {
        console.warn('⏱️ MATLAB timeout - will use simulation instead');
        reject(new Error('MATLAB analysis timeout after 30 seconds'));
      }, 30000);
      
      exec(matlabCommand, { timeout: 30000, maxBuffer: 1024 * 1024 }, async (error, stdout, stderr) => {
        clearTimeout(timeoutId); // Clear the manual timeout
        
        try {
          console.log('📊 MATLAB output:', stdout);
          if (stderr) console.warn('⚠️ MATLAB stderr:', stderr);
          
          // Read results file that MATLAB should create
          const baseFilePath = tempFilePath.replace(ext, '');
          const resultFile = `${baseFilePath}_result.json`;
          
          // Parse MATLAB output - Check if result file exists FIRST
          let results;
          try {
            const resultData = await fsPromises.readFile(resultFile, 'utf8');
            results = JSON.parse(resultData);
            console.log('✅ MATLAB results parsed from file');
          } catch (fileError) {
            console.warn('⚠️ Result file not found, parsing stdout');
            // Fallback: parse from stdout if no file
            try {
              results = parseMatlabOutput(stdout);
            } catch (parseError) {
              console.error('❌ Failed to parse MATLAB output:', parseError);
              await fsPromises.unlink(tempFilePath).catch(() => {});
              reject(new Error(`MATLAB parsing failed: ${parseError.message}`));
              return;
            }
          }
          
          // Only report error if we couldn't get results
          if (error && !results) {
            console.error('❌ MATLAB execution error:', error.message);
            await fsPromises.unlink(tempFilePath).catch(() => {}); // cleanup
            reject(new Error(`MATLAB execution failed: ${error.message}`));
            return;
          }
          
          // Clean up temp files
          await fsPromises.unlink(tempFilePath).catch(() => {});
          try {
            await fsPromises.unlink(resultFile);
          } catch (e) {
            // Result file might not exist
          }
          
          resolve(results);
          
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp files:', cleanupError);
          if (error) reject(error);
          else reject(new Error('Failed to parse MATLAB results'));
        }
      });
    });
    
  } catch (error) {
    throw new Error(`MATLAB analysis setup failed: ${error.message}`);
  }
}

function parseMatlabOutput(matlabOutput) {
  // Parse your MATLAB script output here
  try {
    // Method 1: If MATLAB outputs JSON
    const jsonMatch = matlabOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Method 2: If MATLAB outputs specific format
    // Customize this based on your MATLAB output format
    const lines = matlabOutput.split('\n');
    let dominantFreq = 0;
    let pattern = 'Unknown';
    let confidence = 0;
    
    lines.forEach(line => {
      if (line.includes('Dominant Frequency:')) {
        dominantFreq = parseFloat(line.split(':')[1]);
      }
      if (line.includes('Pattern:')) {
        pattern = line.split(':')[1].trim();
      }
      if (line.includes('Confidence:')) {
        confidence = parseFloat(line.split(':')[1]);
      }
    });
    
    return {
      dominantFrequency: dominantFreq,
      pattern: pattern,
      confidence: confidence,
      healthStatus: 'Analyzed by MATLAB',
      possibleConditions: 'See MATLAB analysis',
      recommendation: 'Consult healthcare professional',
      analysisMethod: 'MATLAB Frequency Domain Analysis'
    };
    
  } catch (error) {
    throw new Error(`Failed to parse MATLAB output: ${error.message}`);
  }
}

app.get("/health", (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({ 
    ok: true, 
    service: "health-backend", 
    port: PORT,
    database: dbStatus.isConnected ? 'connected' : 'disconnected',
    dbName: dbStatus.dbName || null
  });
});

// Smart entry: if image present → skin; else → triage
app.post("/api/generate", upload.single("image"), async (req, res) => {
  try {
    // IMAGE path
    if (req.file) {
      const imageB64 = Buffer.from(req.file.buffer).toString("base64");
      const imageMime = req.file.mimetype || "image/jpeg";

      const contents = [
        { role: "user", parts: [{ text: SKIN_SYSTEM }] },
        { role: "user", parts: [toInlineData(imageMime, imageB64)] },
      ];

      const raw = await geminiGenerate({ contents });
      const parsed = extractLeadingJSON(raw);
      if (!parsed || !Array.isArray(parsed.predictions)) {
        return res.status(502).json({ ok: false, error: "Bad model output", raw: raw.slice(0, 400) });
      }

      const conditions = parsed.predictions
        .slice(0, 5)
        .filter((p) => p && typeof p.label === "string" && Number.isFinite(Number(p.probability)))
        .map((p) => ({ label: p.label.trim(), confidence_pct: Math.max(0, Math.min(100, Math.round(Number(p.probability) * 100))) }));

      // 👇 ADD: remember top condition in the session for follow-ups
      const sid = req.body?.sessionId;
      const s = getOrCreateSession(sid);
      s.last_derma = {
        top: conditions?.[0]?.label || null,
        list: conditions
      };

      return res.json({
        ok: true,
        path: "skin",
        conditions,
        next_question: (parsed.next_question || "").trim(),
        final_assessment: parsed.final_assessment ?? null,
        advice: (parsed.advice || "").trim(),
        sessionId: s.id
      });
    }

    // TEXT path → forward to triage/next
    const { sessionId = "", userText = "" } = req.body || {};
    req.body.sessionId = sessionId;
    req.body.userText = userText;
    req.url = "/api/triage/next";
    app._router.handle(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Triage (AI-powered dynamic questioning + Gemini finalization)
app.post("/api/triage/next", async (req, res) => {
  try {
    const session     = getSession(req);                 // your session getter
    const userTextRaw = (req.body?.userText || "").trim();

    // 👉 D) Most important: short-circuit triage when message is a question
    if (session.mode === "qa" || isQuestionLike(userTextRaw)) {
      try {
        const intent = followupIntentRegex(userTextRaw);
        const raw    = await answerFollowUp({ session, userText: userTextRaw, intent });
        
        // Process JSON responses to HTML on server side
        const j = safeJsonFromBlock(raw);
        const answer_html = j?.sections ? sectionsToHtmlServer(j.sections, j.safety || "")
                                        : raw; // plain text fallback
        
        session.mode = "qa";
        return res.json({ ok: true, path: "qa", intent, answer_html, done: false });
      } catch (e) {
        console.error("QA error:", e);
        return res.json({
          ok: true,
          path: "qa",
          intent: "overview",
          answer_html: "<div class='advice'>Sorry, I couldn't fetch that right now. Please try again.</div>",
          done: false
        });
      }
    }

    // Continue with existing triage logic below...
    const { sessionId = "", userText: raw = "" } = req.body || {};
    const userText = removeSkinMentions(raw);

    // 1) Friendly greeting
    if (isGreeting(raw)) {
      session.triage = session.triage || { history: [] };
      session.triage.history.push({ role:"assistant", text:"Hey! I'm your health buddy 😊 How are you feeling today?" });
      return res.json({
        ok:true, path:"triage", sessionId:session.id,
        doctor_message:"Hey! I'm your health buddy 😊 How are you feeling today?",
        next_question:"What is your MAIN symptom? (few words)", done:false
      });
    }

    // 2) Follow-up Q&A (why/prognosis/risk) — answer precisely, no repetition
    if (followupIntent(userText)) {
      const qa = await answerFollowupQuestion({ session, userText });
      // keep convo history for context
      session.triage = session.triage || { history: [] };
      session.triage.history.push({ role: "assistant", text: qa.qa_answer.join(" • ") });
      return res.json({
        ok: true,
        path: "followup",
        sessionId: session.id,
        done: false,
        ...qa
      });
    }

    // 2.5) User asks for creams/ointment/gel — gate behind dermatology questions
    if (mentionsCreams(userText)) {
      session.triage = session.triage || { history: [], answers: {}, expecting:null, key:null };

      // 1) If we still miss required derm info, ask the NEXT single question.
      const missing = dermMissing(session);
      if (!dermEnough(session)) {
        const { key, expecting, q } = dermQuestionFor(missing[0] || "duration");
        session.triage.expecting = expecting;
        session.triage.key = key;
        session.last_question = q;
        return res.json({
          ok: true,
          path: "triage",
          sessionId: session.id,
          done: false,
          doctor_message: "We can talk creams, but first a quick question to tailor it:",
          next_question: q
        });
      }

      // 2) We have enough info → generate the plan focused on topicals.
      const detailLevel = "detailed";
      const plan = await generateDoctorPlan({ session, focus: "topicals", detail: detailLevel });
      session.last_plan = plan;
      session.mode = "qa"; // switch to Q&A after giving a plan
      return res.json({ ok: true, ...plan, done: true });
    }

    // 3) Remedies intent → generate comprehensive plan
    if (remedyIntent(userText)) {
      const detailLevel = explainIntent(userText) ? "expanded" : "detailed";
      const plan = await generateDoctorPlan({
        session,
        focus: /home|remed/i.test(userText) ? "home_remedies" :
               /food|diet/i.test(userText) ? "diet" :
               /cream|ointment|gel/i.test(userText) ? "topicals" :
               /tablet|medicine|meds/i.test(userText) ? "orals" : "",
        detail: detailLevel
      });
      session.last_plan = plan; // <-- save for follow-up Q&A
      session.mode = "qa"; // switch to Q&A after giving a plan
      return res.json({ ok: true, ...plan, done: true });
    }

    // 3) Regular triage turn
    const out = genericNextTurn(session, userText);

    if (out.delegate_ai){
      const q = await aiSuggestNextQuestion(session);
      // store what we're expecting for next user message
      session.triage.expecting = q.expecting;
      session.triage.key = q.key;
      session.last_question = q.next_question;
      session.triage.history.push({ role:"assistant", text:q.next_question });

      return res.json({ ok:true, path:"triage", sessionId:session.id, done:false,
        doctor_message:"", next_question:q.next_question });
    }

    if (out.done && out.finalize){
      // generate comprehensive doctor plan
      const detailLevel = explainIntent(userText) ? "expanded" : "detailed";
      const plan = await generateDoctorPlan({ session, focus: "", detail: detailLevel });
      session.last_plan = plan; // <-- save for follow-up Q&A
      session.mode = "qa"; // switch to Q&A after giving a plan
      return res.json({ ok:true, ...plan, done:true });
    }

    // (Invalid answer branch)
    return res.json({ ok:true, path:"triage", sessionId:session.id, done:false,
      doctor_message: out.doctor_message || "", next_question: out.next_question || "" });
  } catch (e) {
    console.error("triage/next error:", e);
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

// Fever convenience endpoint (single-shot plan)
app.post("/api/fever/next", async (req, res) => {
  try {
    const { sessionId = "", userText = "" } = req.body || {};
    const session = getOrCreateSession(sessionId);
    if (!session.initialComplaint && userText) session.initialComplaint = userText;

    const msg = [
      "Fever awareness:",
      "• Common causes: viral fever/flu, gastro infections, mosquito-borne (dengue/malaria), sometimes bacterial.",
      "What to do now:",
      "• Rest, hydrate (water/coconut water/ORS), light food (khichdi, curd rice, porridge).",
      "• Cool compress/tepid sponging; monitor temperature every 4–6 hours.",
      "• Discuss with pharmacist/doctor: paracetamol for fever; ORS for dehydration; lozenges if sore throat.",
      "Vaccines (prevention): flu (annual), COVID booster if due, typhoid/ Hep A/B as advised.",
      "Red flags: >103°F; >4 days; severe headache+stiff neck; breathlessness/chest pain; persistent vomiting; confusion; seizures; dehydration.",
    ].join("\n");

    return res.json({
      ok: true,
      path: "triage",
      sessionId: session.id,
      doctor_message: msg,
      next_question: "",
      done: true,
      summary: "Fever management guidance with diet, home remedies, meds to discuss, vaccines & red flags.",
      likely_causes: ["Viral fever", "Flu", "Gastroenteritis", "Dengue/Malaria (depending on area)"],
      why_causes: "Based on common community patterns and symptom clusters.",
      what_to_do_now: ["Rest", "Hydrate", "Monitor temperature"],
      diet_and_home: ["Light diet", "Vitamin C fruits", "Ginger-honey tea", "ORS if dehydration"],
      meds_to_discuss: ["Paracetamol", "ORS", "Lozenges"],
      vaccines_related: ["Flu", "COVID-19", "Typhoid/Hep A/Hep B (as due)"],
      prevention: ["Hand hygiene", "Mosquito control", "Adequate sleep", "Balanced diet"],
      red_flags: [
        "Temp >103°F",
        "Fever >4 days",
        "Severe headache + stiff neck",
        "Breathlessness/chest pain",
        "Persistent vomiting/dehydration",
        "Confusion/seizures",
      ],
      tags: ["fever", "awareness"],
      intent: "triage",
    });
  } catch (e) {
    console.error("[FEVER] Error:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Dermatology-specific treatment plan endpoint
app.post("/api/derma/plan", async (req, res) => {
  const { sessionId, symptoms, duration, severity } = req.body;
  const session = SESSIONS.get(sessionId);
  
  if (!session) {
    return res.status(400).json({ ok: false, error: "Session not found" });
  }

  if (!session.last_derma) {
    return res.status(400).json({ ok: false, error: "No dermatology analysis found. Please upload an image first." });
  }

  try {
    const condition = session.last_derma.top;
    const allConditions = session.last_derma.list || [];
    
    const symptomList = Array.isArray(symptoms) ? symptoms.join(", ") : symptoms || "";
    
    const prompt = `Based on the image analysis showing ${condition} as the primary concern (other possibilities: ${allConditions.map(c => c.label || c).join(", ")}), and the following additional symptoms: ${symptomList} (Duration: ${duration || "not specified"}, Severity: ${severity || "not specified"}), provide a comprehensive dermatology treatment plan.

Include:
1. Detailed condition assessment
2. Topical treatments (with specific product recommendations)
3. Oral medications if needed (with dosage guidance)
4. Lifestyle modifications
5. Follow-up recommendations
6. Warning signs to watch for

Format as structured JSON with clear treatment categories.`;

    const contents = [
      { role: "user", parts: [{ text: DOCTOR_DERMA_SYSTEM }] },
      { role: "user", parts: [{ text: "Patient Query: " + prompt }] }
    ];

    const raw = await geminiGenerate({ contents });
    const cond = condition;
    
    const parsed = extractLeadingJSON(raw) || {};
    const normalized = {
      done: true,
      summary: parsed.summary || (`Dermatology plan for ${cond}`),
      virus_vs_bacteria: parsed.virus_vs_bacteria || "",
      why_causes: parsed.why_causes || "",
      likely_causes: Array.isArray(parsed.likely_causes) ? parsed.likely_causes : [],
      what_to_do_now: Array.isArray(parsed.what_to_do_now) ? parsed.what_to_do_now : [],
      diet_and_home: Array.isArray(parsed.diet_and_home) ? parsed.diet_and_home : [],
      foods_to_eat: Array.isArray(parsed.foods_to_eat) ? parsed.foods_to_eat : [],
      foods_to_avoid: Array.isArray(parsed.foods_to_avoid) ? parsed.foods_to_avoid : [],
      creams_topicals: Array.isArray(parsed.creams_topicals) ? parsed.creams_topicals : [],
      tablets_oral_to_discuss: Array.isArray(parsed.tablets_oral_to_discuss) ? parsed.tablets_oral_to_discuss
                                : (Array.isArray(parsed.meds_to_discuss) ? parsed.meds_to_discuss : []),
      how_to_use_topicals: Array.isArray(parsed.how_to_use_topicals) ? parsed.how_to_use_topicals : [],
      how_to_use_orals: Array.isArray(parsed.how_to_use_orals) ? parsed.how_to_use_orals : [],
      prevention: Array.isArray(parsed.prevention) ? parsed.prevention : [],
      red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : []
    };
    
    // Store derma plan in session
    session.last_derma.treatment_plan = {
      symptoms: symptomList,
      duration,
      severity,
      plan: normalized,
      timestamp: new Date().toISOString()
    };
    
    return res.json({ ok: true, ...normalized });
    
  } catch (e) {
    console.error("Derma plan processing error:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Session helpers (optional for your UI)
app.post("/api/session/start", (req, res) => {
  const s = newSession();
  res.json({ ok: true, sessionId: s.id });
});
app.get("/api/session/:id/recall", (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: "not found" });
  res.json({ ok: true, session: s });
});

// Vax helper: /api/vax/age?dob=YYYY-MM-DD or DD-MM-YYYY
app.get("/api/vax/age", (req, res) => {
  try {
    const iso = normalizeDOB((req.query.dob || "").trim());
    const { years, months, days } = calcAge(iso);
    res.json({ ok: true, dob: iso, years, months, days, ageText: `${years} years, ${months} months, ${days} days` });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});
function normalizeDOB(inp) {
  const dm = inp.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  const ym = inp.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ym) return `${ym[1]}-${ym[2]}-${ym[3]}`;
  throw new Error("Use DD-MM-YYYY or YYYY-MM-DD");
}
function calcAge(dobISO) {
  const dob = new Date(dobISO + "T00:00:00");
  const now = new Date();
  let y = now.getFullYear() - dob.getFullYear();
  let m = now.getMonth() - dob.getMonth();
  let d = now.getDate() - dob.getDate();
  if (d < 0) {
    m--;
    d += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (m < 0) {
    y--;
    m += 12;
  }
  return { years: y, months: m, days: d };
}

// -------------------------------------------------------------------------------------
// Vaccination Q&A Endpoint
// -------------------------------------------------------------------------------------
app.post("/api/vax/ask", express.json(), async (req, res) => {
  try {
    const { name = "", dob = "", sex = "", question = "" } = req.body || {};
    if (!question) return res.status(400).json({ ok:false, error:"Missing question" });

    const who = `${name||"User"} ${dob?`(DOB ${dob})`:""} ${sex?`[${sex}]`:""}`.trim();

    const contents = [
      { role: "user", parts: [{ text: VAX_QA_SYSTEM }] },
      { role: "user", parts: [{ text: "USER CONTEXT:\n" + who }] },
      { role: "user", parts: [{ text: "QUESTION:\n" + question }] }
    ];

    const raw = await geminiGenerate({ contents });
    const j = extractLeadingJSON(raw) || {};
    const answer = Array.isArray(j.answer) ? j.answer : (j.answer ? [String(j.answer)] : []);
    return res.json({ ok:true, answer, safety: j.safety || "General information only. Follow your local immunization schedule and clinician advice.", clarify: j.clarify || "" });
  } catch (e) {
    console.error("vax/ask error:", e);
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

// -------------------------------------------------------------------------------------
// AI DOCTOR CONSULTATION - Intelligent conversation flow with treatment recommendations
// -------------------------------------------------------------------------------------

// New endpoint: Get drug information from FDA
app.post('/api/drug/info', async (req, res) => {
  try {
    const { drugName } = req.body;
    
    if (!drugName) {
      return res.status(400).json({ ok: false, error: 'Drug name is required' });
    }
    
    const drugInfo = await getDrugInfoFromFDA(drugName);
    
    if (!drugInfo) {
      return res.json({ 
        ok: false, 
        error: 'Drug information not found in FDA database',
        suggestion: 'Try generic name (e.g., "paracetamol" instead of "Tylenol")'
      });
    }
    
    return res.json({
      ok: true,
      drug: drugInfo
    });
  } catch (error) {
    console.error('Drug info error:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch drug information' });
  }
});

// Enhanced AI Doctor consultation with FDA drug verification
app.post('/api/ai-doctor/consult', async (req, res) => {
  try {
    const { message, conversationHistory = [], currentStep = 'symptoms' } = req.body;

    if (!message) {
      return res.status(400).json({ ok: false, error: 'Message is required' });
    }

    // Build conversation context
    const systemPrompt = `You are Dr. Sarah Mitchell, a licensed General Physician with 15 years of experience in internal medicine. You are conducting a professional medical consultation.

CONSULTATION APPROACH:
You must conduct this like a real doctor's appointment:
1. Greet professionally and show empathy
2. Take detailed medical history systematically
3. Ask clinical questions like a real physician would
4. Use medical terminology appropriately but explain in simple terms
5. Be thorough before providing diagnosis

QUESTIONING STYLE (Sound like a real doctor):
- Use phrases like: "I see...", "Let me understand...", "That's helpful information..."
- Ask specific clinical questions: "How many days has this been going on?", "Do you have any other symptoms like...?", "Have you noticed any pattern?"
- Follow medical examination protocol: Chief Complaint → History → Associated Symptoms → Medical History → Diagnosis → Treatment

IMPORTANT MEDICAL GUIDELINES:
- Be professional yet warm and reassuring
- Ask ONE focused question at a time
- Gather: Chief complaint, Duration, Severity (1-10), Associated symptoms, Past medical history, Current medications, Allergies
- After 4-5 key questions, provide comprehensive treatment plan
- Always mention when to seek urgent care
- Include disclaimer about consulting in-person doctor for serious conditions

CRITICAL FORMATTING RULES FOR RESPONSES:
1. Use clean, readable text - NO asterisks (****), NO excessive symbols
2. Use proper line breaks for readability
3. For IMPORTANT information: Simply write in CAPITAL LETTERS or start with "Important:" or "Warning:"
4. Keep responses conversational and professional
5. Structure treatment plans clearly with headings
6. Avoid markdown symbols in regular text
7. Write naturally as a doctor would speak

Current consultation stage: ${currentStep}
Patient's latest response: ${message}

Previous conversation:
${conversationHistory.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

CONSULTATION FLOW:
- First contact: Acknowledge chief complaint professionally, ask about duration
- Duration known: Ask about severity and specific characteristics of symptoms
- Severity known: Ask about associated symptoms (fever, other complaints)
- Associated symptoms known: Ask about past medical history, allergies, current medications
- All information gathered: Provide detailed diagnosis and treatment plan

CRITICAL: DISEASE-SPECIFIC TREATMENT GUIDELINES
You must provide ACCURATE, SPECIFIC medicines based on the EXACT diagnosis:

DIAGNOSTIC CRITERIA - Match symptoms to correct disease:

**RESPIRATORY CONDITIONS:**

1. **Common Cold/Upper Respiratory Infection (URI):**
   Symptoms: Runny nose, sneezing, mild sore throat, low/no fever
   Medicines:
   - Cetirizine 10mg - once daily for 5 days (for runny nose)
   - Paracetamol 500mg - as needed for mild discomfort
   - Vitamin C 500mg - once daily
   Vaccines:
   - Annual Influenza Vaccine
   - COVID-19 Booster

2. **Influenza (Flu):**
   Symptoms: HIGH fever (>101°F), body aches, chills, fatigue, headache, dry cough
   Medicines:
   - Oseltamivir (Tamiflu) 75mg - twice daily for 5 days (start within 48hrs)
   - Paracetamol 650mg - every 6 hours for fever
   - Plenty of fluids
   Vaccines:
   - Annual Influenza Vaccine (PRIORITY)
   - COVID-19 Booster
   - Pneumococcal Vaccine (if >65 or chronic disease)

3. **COVID-19:**
   Symptoms: Fever, dry cough, loss of taste/smell, fatigue, shortness of breath
   Medicines:
   - Paracetamol 500mg - for fever
   - Vitamin D3 2000IU + Vitamin C 1000mg + Zinc 50mg - daily for 10 days
   - Azithromycin 500mg (only if bacterial co-infection suspected)
   Vaccines:
   - COVID-19 Vaccine/Booster (PRIORITY)
   - Pneumococcal Vaccine (for prevention)

4. **Bronchitis:**
   Symptoms: Persistent cough with mucus, chest discomfort, mild fever
   Medicines:
   - Ambroxol 30mg - 3 times daily for 5-7 days (mucus clearance)
   - Salbutamol inhaler - if wheezing present
   - Paracetamol for fever
   Vaccines:
   - Annual Flu Vaccine
   - Pneumococcal Vaccine

5. **Pneumonia:**
   Symptoms: High fever, productive cough, chest pain, difficulty breathing
   Medicines:
   - Azithromycin 500mg Day 1, then 250mg for 4 days
   - OR Amoxicillin-Clavulanate (Augmentin) 625mg - 3 times daily for 7 days
   - Paracetamol for fever
   **URGENT: Hospital admission if severe breathing difficulty**
   Vaccines:
   - Pneumococcal Vaccine PCV13 + PPSV23 (PRIORITY)
   - Annual Flu Vaccine

**THROAT CONDITIONS:**

6. **Viral Pharyngitis (Sore Throat - Viral):**
   Symptoms: Sore throat, mild fever, no pus on tonsils, gradual onset
   Medicines:
   - Paracetamol 500mg - for pain/fever
   - Warm salt water gargles
   - Lozenges (Strepsils)
   Vaccines:
   - Flu Vaccine
   - COVID-19 Booster

7. **Bacterial Pharyngitis (Strep Throat):**
   Symptoms: SEVERE sore throat, fever, pus on tonsils, swollen lymph nodes, sudden onset
   Medicines:
   - Amoxicillin 500mg - 3 times daily for 10 days
   - OR Azithromycin 500mg - once daily for 3 days
   - Paracetamol for fever/pain
   Vaccines:
   - None specific, but maintain Tdap booster

**GASTROINTESTINAL CONDITIONS:**

8. **Viral Gastroenteritis (Stomach Flu):**
   Symptoms: Diarrhea, vomiting, nausea, abdominal cramps, mild fever
   Medicines:
   - ORS (Oral Rehydration Solution) - after each loose stool
   - Ondansetron 4mg - for severe vomiting
   - Probiotics (Saccharomyces boulardii)
   - Zinc 20mg - daily for 10 days
   Vaccines:
   - Rotavirus (for children)
   - Annual Flu Vaccine

9. **Food Poisoning:**
   Symptoms: Sudden vomiting/diarrhea after eating, abdominal pain
   Medicines:
   - ORS frequently
   - Ondansetron 4mg if needed
   - Avoid antibiotics unless severe
   Vaccines:
   - Typhoid Vaccine (if travel to endemic areas)
   - Hepatitis A Vaccine

**FEVER-RELATED CONDITIONS:**

10. **Viral Fever (Non-specific):**
    Symptoms: Fever without clear source, general malaise, mild body aches
    Medicines:
    - Paracetamol 650mg - every 6 hours
    - Plenty of fluids
    - Rest
    Vaccines:
    - Annual Flu Vaccine
    - COVID-19 Booster

11. **Dengue Fever:**
    Symptoms: High fever, severe headache (behind eyes), joint/muscle pain, rash, low platelets
    Medicines:
    - Paracetamol 500mg ONLY (NO Ibuprofen/Aspirin - bleeding risk!)
    - IV fluids if severe
    - Monitor platelet count daily
    **URGENT: Hospital if platelets <50,000, bleeding, severe abdominal pain**
    Vaccines:
    - Dengue Vaccine (Dengvaxia) - only if previous dengue infection

12. **Typhoid Fever:**
    Symptoms: Prolonged fever (>7 days), rose spots, constipation, headache, abdominal pain
    Medicines:
    - Azithromycin 500mg - once daily for 7 days
    - OR Ceftriaxone injection (hospital)
    - Paracetamol for fever
    Vaccines:
    - Typhoid Vaccine (Typbar-TCV) - PRIORITY
    - Hepatitis A Vaccine

**SKIN CONDITIONS:**

13. **Chickenpox (Varicella):**
    Symptoms: Fever + itchy rash with fluid-filled blisters
    Medicines:
    - Acyclovir 800mg - 5 times daily for 7 days
    - Calamine lotion - for itching
    - Paracetamol for fever (NO aspirin - Reye's syndrome risk)
    Vaccines:
    - Varicella Vaccine (for prevention in close contacts)

14. **Herpes Zoster (Shingles):**
    Symptoms: Painful rash in band/strip pattern, burning sensation
    Medicines:
    - Valacyclovir 1000mg - 3 times daily for 7 days
    - Gabapentin 300mg - for nerve pain
    - Topical lidocaine cream
    Vaccines:
    - Shingles Vaccine (Shingrix) - 2 doses for age 50+

15. **Bacterial Skin Infection (Cellulitis):**
    Symptoms: Red, swollen, warm, tender skin area
    Medicines:
    - Cephalexin 500mg - 4 times daily for 7 days
    - Topical Mupirocin ointment
    Vaccines:
    - Tetanus Booster if wound present

**URINARY CONDITIONS:**

16. **Urinary Tract Infection (UTI):**
    Symptoms: Burning urination, frequent urination, lower abdominal pain
    Medicines:
    - Nitrofurantoin 100mg - twice daily for 5-7 days
    - OR Cefixime 200mg - twice daily for 5 days
    - Plenty of water (3-4 liters/day)
    Vaccines:
    - None specific

**ALLERGIC CONDITIONS:**

17. **Allergic Rhinitis (Hay Fever):**
    Symptoms: Sneezing, runny nose, itchy eyes, seasonal pattern
    Medicines:
    - Cetirizine 10mg - once daily
    - OR Loratadine 10mg - once daily
    - Nasal spray: Fluticasone propionate
    - Montelukast 10mg - for chronic cases
    Vaccines:
    - Annual Flu Vaccine (allergies increase flu risk)

18. **Urticaria (Hives):**
    Symptoms: Itchy, raised, red welts on skin
    Medicines:
    - Cetirizine 10mg - twice daily for 5-7 days
    - Prednisolone 20mg - if severe (3-5 days)
    Vaccines:
    - None specific

**HEADACHE CONDITIONS:**

19. **Migraine:**
    Symptoms: One-sided throbbing headache, nausea, light sensitivity
    Medicines:
    - Sumatriptan 50mg - at onset of migraine
    - Paracetamol 1000mg + Domperidone 10mg
    - Propranolol 40mg - for prevention (if frequent)
    Vaccines:
    - None specific

20. **Tension Headache:**
    Symptoms: Band-like pressure around head, neck stiffness
    Medicines:
    - Paracetamol 500mg
    - Ibuprofen 400mg
    - Muscle relaxants if needed
    Vaccines:
    - None specific

**CRITICAL DIAGNOSTIC MATCHING RULES:**
1. Identify PRIMARY symptom cluster (respiratory, GI, fever, skin, etc.)
2. Match EXACT disease based on symptom pattern
3. Provide medicines SPECIFIC to that disease
4. Include vaccines RELEVANT to that condition
5. If symptoms match MULTIPLE diseases, provide differential diagnosis
6. Always warn about serious conditions requiring urgent care
**CRITICAL DIAGNOSTIC MATCHING RULES:**
1. Identify PRIMARY symptom cluster (respiratory, GI, fever, skin, etc.)
2. Match EXACT disease based on symptom pattern
3. Provide medicines SPECIFIC to that disease
4. Include vaccines RELEVANT to that condition
5. If symptoms match MULTIPLE diseases, provide differential diagnosis
6. Always warn about serious conditions requiring urgent care

**EXAMPLE DIAGNOSTIC MATCHING:**

Symptoms: "Fever 102°F, severe body aches, chills, dry cough for 2 days"
→ DIAGNOSIS: Influenza (Flu)
→ MEDICINES: Oseltamivir 75mg, Paracetamol 650mg, Vitamin C
→ VACCINES: Annual Flu Vaccine (PRIORITY), COVID-19 Booster

Symptoms: "Diarrhea 5 times, vomiting, stomach cramps since yesterday"
→ DIAGNOSIS: Viral Gastroenteritis
→ MEDICINES: ORS, Ondansetron 4mg, Probiotics, Zinc
→ VACCINES: Rotavirus (children), Typhoid (if travel)

Symptoms: "Burning urination, frequent need to pee, lower belly pain"
→ DIAGNOSIS: Urinary Tract Infection
→ MEDICINES: Nitrofurantoin 100mg, lots of water
→ VACCINES: None specific

Symptoms: "Itchy rash with blisters, fever, child age 8"
→ DIAGNOSIS: Chickenpox
→ MEDICINES: Acyclovir 800mg, Calamine lotion, Paracetamol
→ VACCINES: Varicella Vaccine (for siblings/contacts)

**FOR ALLERGIC CONDITIONS:**
- Cetirizine 10mg OR Loratadine 10mg - once daily
- Montelukast 10mg - for chronic allergies
- Nasal spray: Fluticasone
- Vaccines: Annual Flu Vaccine (allergies increase risk)

**FOR FUNGAL INFECTIONS:**
- Fluconazole 150mg - single dose (vaginal yeast)
- Terbinafine 250mg - daily for nail fungus
- Topical Clotrimazole cream
- Vaccines: None specific

CRITICAL: IF USER ASKS SPECIFICALLY FOR VACCINES OR MEDICATION SUGGESTIONS
- If user asks "suggest vaccines", "what vaccines", "vaccine recommendations", etc.
- IMMEDIATELY provide the FULL treatment JSON format with vaccines array populated
- DO NOT refuse or say "consult a healthcare professional"
- Provide SPECIFIC vaccine names with schedules based on their DIAGNOSED CONDITION
- Example user asks: "Can you suggest some vaccines?"
  - You MUST respond with the full treatment JSON including populated vaccines array
  - Include vaccines MATCHING their diagnosed condition (see disease-specific vaccines above)

IMPORTANT RULES:
1. **Match medicine EXACTLY to the diagnosed condition** - Use disease-specific medicines from list above
2. Include SPECIFIC brand names when helpful (Tamiflu, Augmentin, Strepsils, etc.)
3. Specify EXACT duration (not just "few days")
4. **Add relevant VACCINES based on EXACT condition diagnosed** - See disease-specific vaccines above
5. Include dosing schedule (e.g., "8 AM, 2 PM, 8 PM")
6. Warn about drug interactions and contraindications
7. If SERIOUS condition detected (dengue, pneumonia, etc.) - recommend URGENT hospital visit
8. **NEVER refuse vaccine suggestions** - Always provide specific vaccine recommendations matching the disease
9. **NEVER give generic treatment** - Always match treatment to specific diagnosed condition

Respond in this JSON format if providing treatment:
{
  "response": "Summary text for patient",
  "isTreatment": true,
  "treatment": {
    "diagnosis": "Most likely condition based on symptoms",
    "medicines": [
      {
        "name": "Medicine name (Generic and Brand names)",
        "dosage": "Dosage amount (e.g., 500mg, 10ml)",
        "instructions": "Detailed instructions: when, how often, duration, with/without food"
      }
    ],
    "vaccines": [
      {
        "name": "Vaccine name",
        "reason": "Why this vaccine is recommended",
        "schedule": "When to take (e.g., single dose, yearly, etc.)"
      }
    ],
    "precautions": ["Detailed precautions and warnings"],
    "homeRemedies": ["Evidence-based home remedies"],
    "dietAdvice": ["Specific dietary recommendations"],
    "followUp": "When to follow up or seek urgent care"
  },
  "nextStep": "complete"
}

IMPORTANT FOR TREATMENT PLANS:
- Include at least 2-3 specific medicines with EXACT dosages
- **ALWAYS include vaccines array** if condition warrants it (flu vaccine, COVID booster, pneumonia vaccine for elderly, etc.)
- If user specifically asks for vaccines, populate vaccines array with 3-4 relevant vaccines
- Mention brand names alongside generic names when helpful
- Include DURATION for each medicine (e.g., "for 3 days", "for 5-7 days")
- Be specific with timing (e.g., "Take 1 tablet at 8 AM and 8 PM after meals")
- Always include when to seek urgent medical care
- **NEVER say "I cannot suggest vaccines"** - ALWAYS provide specific vaccine recommendations

VACCINE RECOMMENDATIONS BY CONDITION:
**Flu-like illness (fever, cough, sore throat):** 
  - Annual Influenza vaccine (Flu shot)
  - COVID-19 booster dose
  - Pneumococcal vaccine (if age >65 or chronic conditions)

**Pneumonia/Respiratory:** 
  - Pneumococcal vaccine (PCV13, PPSV23)
  - Annual Influenza vaccine
  - COVID-19 vaccine/booster

**Fever with travel history:** 
  - Typhoid vaccine
  - Hepatitis A vaccine
  - Yellow Fever vaccine (based on region)

**Elderly patients (>65 years):** 
  - Pneumococcal vaccine (PPSV23)
  - Annual Influenza vaccine
  - Shingles vaccine (Herpes Zoster - Shingrix)
  - Tdap booster

**Chronic conditions (diabetes, heart disease, COPD):** 
  - Annual Influenza vaccine
  - Pneumococcal vaccine
  - COVID-19 vaccine/booster

**Skin wounds/injuries:** 
  - Tetanus booster (Tdap) if >10 years since last dose

**Children:** 
  - Age-appropriate vaccines per immunization schedule

**Pregnant women:** 
  - Tdap vaccine (after 27 weeks)
  - Annual Influenza vaccine

**ALL PATIENTS (General Prevention):**
  - Annual Influenza vaccine
  - COVID-19 vaccine (primary series + boosters)
  - Tetanus booster every 10 years

Or if asking follow-up question:
{
  "response": "Your follow-up question here",
  "isTreatment": false,
  "nextStep": "duration|severity|history|diagnosis"
}`;

    const contents = [
      { role: "user", parts: [{ text: systemPrompt }] }
    ];

    let raw;
    try {
      raw = await geminiGenerate({ contents });
    } catch (aiErr) {
      console.warn('AI Doctor: both AI providers failed, using fallback', aiErr.message);
      // Return a warm fallback so the user never sees a cold error
      return res.json({
        ok: true,
        isTreatment: false,
        response: "I'm sorry, I'm having a little trouble connecting right now. Could you please repeat what you said? I'm here and ready to help you.",
        nextStep: 'symptoms'
      });
    }
    
    // Try to extract JSON from response
    let response;
    try {
      response = extractLeadingJSON(raw) || { response: raw, isTreatment: false };
    } catch (e) {
      response = { response: raw, isTreatment: false };
    }

    return res.json({
      ok: true,
      ...response
    });

  } catch (error) {
    console.error('AI Doctor consultation error:', error);
    // Still return ok:true with a graceful fallback so frontend never shows a raw error
    res.json({
      ok: true,
      isTreatment: false,
      response: "I'm sorry, I'm having a little trouble connecting right now. Could you please repeat your question? I'm here to help.",
      nextStep: 'symptoms'
    });
  }
});

// -------------------------------------------------------------------------------------
// OFFLINE DOCTOR SEARCH - Location-based doctor finder
// -------------------------------------------------------------------------------------

// Sample doctors database (In production, use actual database)
const DOCTORS_DATABASE = [
  // Kerala Doctors (near Palakkad - 10.99, 76.95)
  {
    id: 'doc_kerala1',
    name: 'Dr. Krishnan Nair',
    specialization: 'General Physician',
    avatar: '👨‍⚕️',
    rating: 4.7,
    reviews: 156,
    experience: 18,
    address: 'Nair Medical Center, Palakkad Town, Kerala',
    phone: '+91 98765 11001',
    fee: 400,
    timing: '9:00 AM - 7:00 PM',
    location: { city: 'Palakkad', area: 'Town', lat: 10.7747, lon: 76.6537 }
  },
  {
    id: 'doc_kerala2',
    name: 'Dr. Lakshmi Menon',
    specialization: 'Pediatrician',
    avatar: '👩‍⚕️',
    rating: 4.9,
    reviews: 234,
    experience: 14,
    address: 'Children Care Clinic, Ottapalam, Kerala',
    phone: '+91 98765 11002',
    fee: 500,
    timing: '8:00 AM - 8:00 PM',
    location: { city: 'Palakkad', area: 'Ottapalam', lat: 10.7733, lon: 76.3775 }
  },
  {
    id: 'doc_kerala3',
    name: 'Dr. Suresh Kumar',
    specialization: 'Cardiologist',
    avatar: '👨‍⚕️',
    rating: 4.8,
    reviews: 298,
    experience: 22,
    address: 'Heart Care Hospital, Palakkad, Kerala',
    phone: '+91 98765 11003',
    fee: 1000,
    timing: '10:00 AM - 6:00 PM',
    location: { city: 'Palakkad', area: 'Town', lat: 10.7833, lon: 76.6544 }
  },
  {
    id: 'doc_kerala4',
    name: 'Dr. Radhika Pillai',
    specialization: 'Gynecologist',
    avatar: '👩‍⚕️',
    rating: 4.7,
    reviews: 187,
    experience: 16,
    address: 'Women Health Center, Palakkad, Kerala',
    phone: '+91 98765 11004',
    fee: 600,
    timing: '9:00 AM - 7:00 PM',
    location: { city: 'Palakkad', area: 'Town', lat: 10.7767, lon: 76.6558 }
  },
  {
    id: 'doc_kerala5',
    name: 'Dr. Aravind Nambiar',
    specialization: 'Orthopedic',
    avatar: '👨‍⚕️',
    rating: 4.6,
    reviews: 145,
    experience: 20,
    address: 'Bone & Joint Clinic, Shoranur, Kerala',
    phone: '+91 98765 11005',
    fee: 750,
    timing: '10:00 AM - 5:00 PM',
    location: { city: 'Palakkad', area: 'Shoranur', lat: 10.7603, lon: 76.2734 }
  },
  {
    id: 'doc_kerala6',
    name: 'Dr. Priya Warrier',
    specialization: 'Dermatologist',
    avatar: '👩‍⚕️',
    rating: 4.8,
    reviews: 201,
    experience: 12,
    address: 'Skin Care Clinic, Palakkad, Kerala',
    phone: '+91 98765 11006',
    fee: 650,
    timing: '9:30 AM - 6:30 PM',
    location: { city: 'Palakkad', area: 'Town', lat: 10.7780, lon: 76.6520 }
  },
  {
    id: 'doc_kerala7',
    name: 'Dr. Vijay Chandran',
    specialization: 'ENT Specialist',
    avatar: '👨‍⚕️',
    rating: 4.7,
    reviews: 167,
    experience: 15,
    address: 'ENT Care Center, Palakkad, Kerala',
    phone: '+91 98765 11007',
    fee: 550,
    timing: '11:00 AM - 7:00 PM',
    location: { city: 'Palakkad', area: 'Town', lat: 10.7761, lon: 76.6571 }
  },
  {
    id: 'doc_kerala8',
    name: 'Dr. Anjali Nair',
    specialization: 'Dentist',
    avatar: '👩‍⚕️',
    rating: 4.9,
    reviews: 312,
    experience: 10,
    address: 'Dental Care Clinic, Palakkad, Kerala',
    phone: '+91 98765 11008',
    fee: 450,
    timing: '9:00 AM - 8:00 PM',
    location: { city: 'Palakkad', area: 'Town', lat: 10.7755, lon: 76.6548 }
  },
  {
    id: 'doc_kerala9',
    name: 'Dr. Ramesh Iyer',
    specialization: 'General Physician',
    avatar: '👨‍⚕️',
    rating: 4.6,
    reviews: 178,
    experience: 25,
    address: 'Primary Health Center, Chittur, Kerala',
    phone: '+91 98765 11009',
    fee: 350,
    timing: '8:00 AM - 9:00 PM',
    location: { city: 'Palakkad', area: 'Chittur', lat: 10.6970, lon: 76.7467 }
  },
  {
    id: 'doc_kerala10',
    name: 'Dr. Divya Krishnan',
    specialization: 'Ophthalmologist',
    avatar: '👩‍⚕️',
    rating: 4.8,
    reviews: 189,
    experience: 13,
    address: 'Eye Care Hospital, Palakkad, Kerala',
    phone: '+91 98765 11010',
    fee: 700,
    timing: '10:00 AM - 6:00 PM',
    location: { city: 'Palakkad', area: 'Town', lat: 10.7790, lon: 76.6565 }
  },
  
  // Mumbai Doctors (kept for testing)
  {
    id: 'doc1',
    name: 'Dr. Rajesh Kumar',
    specialization: 'General Physician',
    avatar: '👨‍⚕️',
    rating: 4.8,
    reviews: 245,
    experience: 15,
    address: 'Apollo Clinic, Andheri West, Mumbai',
    phone: '+91 98765 43210',
    fee: 500,
    timing: '9:00 AM - 8:00 PM',
    location: { city: 'Mumbai', area: 'Andheri', lat: 19.1136, lon: 72.8697 }
  },
  {
    id: 'doc2',
    name: 'Dr. Priya Sharma',
    specialization: 'Dermatologist',
    avatar: '👩‍⚕️',
    rating: 4.9,
    reviews: 389,
    experience: 12,
    address: 'SkinCare Clinic, Bandra West, Mumbai',
    phone: '+91 98765 43211',
    fee: 800,
    timing: '10:00 AM - 7:00 PM',
    location: { city: 'Mumbai', area: 'Bandra', lat: 19.0596, lon: 72.8295 }
  },
  {
    id: 'doc3',
    name: 'Dr. Amit Patel',
    specialization: 'Cardiologist',
    avatar: '👨‍⚕️',
    rating: 4.7,
    reviews: 456,
    experience: 20,
    address: 'Heart Care Center, Powai, Mumbai',
    phone: '+91 98765 43212',
    fee: 1200,
    timing: '11:00 AM - 6:00 PM',
    location: { city: 'Mumbai', area: 'Powai', lat: 19.1197, lon: 72.9065 }
  },
  {
    id: 'doc4',
    name: 'Dr. Sneha Reddy',
    specialization: 'Pediatrician',
    avatar: '👩‍⚕️',
    rating: 4.9,
    reviews: 567,
    experience: 10,
    address: 'Child Care Hospital, Malad West, Mumbai',
    phone: '+91 98765 43213',
    fee: 600,
    timing: '9:00 AM - 9:00 PM',
    location: { city: 'Mumbai', area: 'Malad', lat: 19.1868, lon: 72.8483 }
  },
  {
    id: 'doc5',
    name: 'Dr. Vikram Singh',
    specialization: 'Orthopedic',
    avatar: '👨‍⚕️',
    rating: 4.6,
    reviews: 234,
    experience: 18,
    address: 'Bone & Joint Clinic, Juhu, Mumbai',
    phone: '+91 98765 43214',
    fee: 900,
    timing: '10:00 AM - 5:00 PM',
    location: { city: 'Mumbai', area: 'Juhu', lat: 19.0969, lon: 72.8264 }
  },
  {
    id: 'doc6',
    name: 'Dr. Anjali Mehta',
    specialization: 'Gynecologist',
    avatar: '👩‍⚕️',
    rating: 4.8,
    reviews: 678,
    experience: 14,
    address: 'Women Health Clinic, Dadar, Mumbai',
    phone: '+91 98765 43215',
    fee: 700,
    timing: '9:30 AM - 7:30 PM',
    location: { city: 'Mumbai', area: 'Dadar', lat: 19.0176, lon: 72.8561 }
  },
  {
    id: 'doc7',
    name: 'Dr. Suresh Gupta',
    specialization: 'ENT Specialist',
    avatar: '👨‍⚕️',
    rating: 4.7,
    reviews: 345,
    experience: 16,
    address: 'ENT Care Center, Goregaon, Mumbai',
    phone: '+91 98765 43216',
    fee: 650,
    timing: '11:00 AM - 8:00 PM',
    location: { city: 'Mumbai', area: 'Goregaon', lat: 19.1663, lon: 72.8526 }
  },
  {
    id: 'doc8',
    name: 'Dr. Kavita Iyer',
    specialization: 'Dentist',
    avatar: '👩‍⚕️',
    rating: 4.9,
    reviews: 892,
    experience: 11,
    address: 'Smile Dental Clinic, Churchgate, Mumbai',
    phone: '+91 98765 43217',
    fee: 500,
    timing: '10:00 AM - 8:00 PM',
    location: { city: 'Mumbai', area: 'Churchgate', lat: 18.9322, lon: 72.8264 }
  }
];

// ===================================================================
// REAL DOCTORS SEARCH - Google Places API Integration
// ===================================================================

// Helper function: Calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper function: Format opening hours
function formatOpeningHours(openingHours) {
  if (!openingHours) return 'Call for timings';
  
  if (openingHours.weekday_text) {
    const today = new Date().getDay();
    const dayIndex = today === 0 ? 6 : today - 1;
    return openingHours.weekday_text[dayIndex] || 'Call for timings';
  }
  
  return 'Call for timings';
}

// Helper function: Get avatar based on type
function getAvatarForType(types) {
  if (!types) return '👨‍⚕️';
  if (types.includes('hospital')) return '🏥';
  if (types.includes('dentist')) return '🦷';
  if (types.includes('pharmacy')) return '💊';
  return '👨‍⚕️';
}

app.post('/api/doctors/search', async (req, res) => {
  try {
    const { 
      location, 
      specialization = 'all', 
      sortBy = 'distance', 
      latitude, 
      longitude,
      radius = 5000 // 5km default
    } = req.body;

    // If Google Places API is available and we have user location, use it
    if (GOOGLE_PLACES_API_KEY && latitude && longitude) {
      console.log(`🔍 Searching real doctors near ${latitude}, ${longitude} using Google Places`);
      
      try {
        // Build search query
        let searchQuery = 'doctor';
        if (specialization && specialization !== 'all') {
          searchQuery = `${specialization} doctor`;
        }

        // Search for nearby doctors
        const response = await googleMapsClient.placesNearby({
          params: {
            location: { lat: latitude, lng: longitude },
            radius: radius,
            type: 'doctor',
            keyword: searchQuery,
            key: GOOGLE_PLACES_API_KEY
          }
        });

        if (!response.data.results || response.data.results.length === 0) {
          console.log('⚠️  No doctors found on Google Places, falling back to sample data');
          // Fall back to sample data
        } else {
          // Get detailed info for each place (limit to 20)
          const doctors = await Promise.all(
            response.data.results.slice(0, 20).map(async (place) => {
              try {
                // Get place details
                const details = await googleMapsClient.placeDetails({
                  params: {
                    place_id: place.place_id,
                    fields: [
                      'name',
                      'formatted_phone_number',
                      'opening_hours',
                      'website',
                      'rating',
                      'user_ratings_total',
                      'formatted_address'
                    ],
                    key: GOOGLE_PLACES_API_KEY
                  }
                });

                const placeDetails = details.data.result;

                // Calculate distance
                const distance = calculateDistance(
                  latitude,
                  longitude,
                  place.geometry.location.lat,
                  place.geometry.location.lng
                );

                return {
                  id: place.place_id,
                  name: place.name,
                  specialization: specialization !== 'all' ? specialization : 'General Physician',
                  avatar: getAvatarForType(place.types),
                  rating: place.rating || 5.0,
                  reviews: place.user_ratings_total || 0,
                  experience: null,
                  address: placeDetails.formatted_address || place.vicinity,
                  phone: placeDetails.formatted_phone_number || 'Not available',
                  fee: null,
                  timing: formatOpeningHours(placeDetails.opening_hours),
                  location: {
                    city: location || 'Your area',
                    area: place.vicinity,
                    lat: place.geometry.location.lat,
                    lon: place.geometry.location.lng
                  },
                  website: placeDetails.website,
                  distance: distance.toFixed(1) + ' km',
                  isOpen: placeDetails.opening_hours?.open_now,
                  googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
                  source: 'Google Places'
                };
              } catch (detailError) {
                console.error(`Error fetching details for ${place.name}:`, detailError.message);
                return null;
              }
            })
          );

          // Filter out nulls and sort by distance
          const validDoctors = doctors
            .filter(doc => doc !== null)
            .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

          console.log(`✅ Found ${validDoctors.length} real doctors from Google Places`);

          return res.json({
            ok: true,
            doctors: validDoctors,
            count: validDoctors.length,
            location: location,
            source: 'Google Places API'
          });
        }
      } catch (googleError) {
        console.error('Google Places API error:', googleError.message);
        console.log('⚠️  Falling back to sample doctors');
        // Fall through to sample data below
      }
    }

    // FALLBACK: Use sample data if Google Places not available or failed
    if (!location) {
      return res.status(400).json({ ok: false, error: 'Location is required' });
    }

    let doctors = DOCTORS_DATABASE.filter(doc => {
      const locationMatch = doc.location.city.toLowerCase().includes(location.toLowerCase()) ||
                           doc.location.area.toLowerCase().includes(location.toLowerCase());
      
      const specializationMatch = specialization === 'all' || 
                                  doc.specialization.toLowerCase() === specialization.toLowerCase();
      
      return locationMatch && specializationMatch;
    });

    // Sort doctors
    if (sortBy === 'rating') {
      doctors.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === 'experience') {
      doctors.sort((a, b) => b.experience - a.experience);
    } else if (sortBy === 'distance' && latitude && longitude) {
      doctors.forEach(doc => {
        const distance = calculateDistance(latitude, longitude, doc.location.lat, doc.location.lon);
        doc.distance = distance.toFixed(1) + ' km';
      });
      doctors.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    }

    const results = doctors.slice(0, 20);

    console.log(`✅ Found ${results.length} doctors from sample database`);

    return res.json({
      ok: true,
      doctors: results,
      count: results.length,
      location: location,
      source: 'Sample Database'
    });

  } catch (error) {
    console.error('Doctor search error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to search doctors. Please try again.' 
    });
  }
});

// -------------------------------------------------------------------------------------
// Health Check Endpoint
// -------------------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Pranava Health AI Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// -------------------------------------------------------------------------------------
// View Database Records (NEW - for viewing saved data)
// -------------------------------------------------------------------------------------

// Get all cough analyses (filtered by user if authenticated)
app.get('/api/cough-analyses', authenticateToken, async (req, res) => {
  try {
    // Filter by userId to show only the authenticated user's analyses
    const analyses = await CoughAnalysis.find({ userId: req.userId })
      .sort({ createdAt: -1 })  // Most recent first
      .limit(100);  // Limit to 100 records
    
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

// Get specific cough analysis by ID
app.get('/api/cough-analyses/:id', async (req, res) => {
  try {
    const analysis = await CoughAnalysis.findById(req.params.id);
    
    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found'
      });
    }
    
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('❌ Error fetching analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all chat conversations (filtered by user if authenticated)
app.get('/api/chat-conversations', authenticateToken, async (req, res) => {
  try {
    // Filter by userId to show only the authenticated user's conversations
    const conversations = await ChatConversation.find({ userId: req.userId })
      .sort({ createdAt: -1 })  // Most recent first
      .limit(100);  // Limit to 100 records
    
    res.json(conversations);
  } catch (error) {
    console.error('❌ Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Pranava Health AI API',
    status: 'online',
    endpoints: [
      '/health - Health check',
      '/chat - Text-based medical consultation',
      '/analyze-image - Medical image analysis',
      '/vax/ask - Vaccination information',
      '/api/ai-doctor/consult - AI Doctor consultation',
      '/api/doctors/search - Search offline doctors by location',
      '/api/cough/analyze - Cough frequency analysis using MATLAB'
    ]
  });
});

// -------------------------------------------------------------------------------------
// Start Server & Connect to Database
// -------------------------------------------------------------------------------------
async function startServer() {
  // Connect to MongoDB
  await connectToDatabase();
  
  app.listen(PORT, () => {
    console.log(`✅ Pranava Health AI listening on http://localhost:${PORT}`);
    console.log(`📊 Health check available at http://localhost:${PORT}/health`);
    console.log(`🏠 API info available at http://localhost:${PORT}/`);
    
    // Show database connection status
    const dbStatus = getConnectionStatus();
    if (dbStatus.isConnected) {
      console.log(`🗄️  MongoDB connected: ${dbStatus.dbName}`);
    } else {
      console.log(`⚠️  MongoDB not connected - using in-memory storage`);
    }
  });
}

startServer().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
