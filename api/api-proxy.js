import crypto from 'crypto';

// In-memory rate limiting stores (reset when serverless instance restarts)
const ipLimits = new Map();
const userLimits = new Map();

// Caching Google's public certificates for JWT signature verification
let cachedCerts = null;
let certsExpiry = 0;

async function getGoogleCerts() {
  const now = Date.now();
  if (cachedCerts && now < certsExpiry) {
    return cachedCerts;
  }
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!res.ok) {
    throw new Error('Failed to fetch Google public certificates');
  }
  const certs = await res.json();
  cachedCerts = certs;
  // Cache for 1 hour
  certsExpiry = now + 3600 * 1000;
  return certs;
}

function base64urlToBuffer(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  return Buffer.from(b64, 'base64');
}

async function verifyFirebaseToken(token, projectId) {
  if (!token) throw new Error('Token is empty');
  
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  
  const [headerB64, payloadB64, signatureB64] = parts;
  
  const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
  
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Token expired');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Invalid issuer');
  }
  if (payload.aud !== projectId) {
    throw new Error('Invalid audience');
  }
  
  const kid = header.kid;
  if (!kid) {
    throw new Error('Missing kid');
  }
  
  const certs = await getGoogleCerts();
  const cert = certs[kid];
  if (!cert) {
    throw new Error('Public key not found for kid');
  }
  
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(`${headerB64}.${payloadB64}`);
  
  const signature = base64urlToBuffer(signatureB64);
  const isValid = verify.verify(cert, signature);
  if (!isValid) {
    throw new Error('Signature verification failed');
  }
  
  return payload;
}

function checkRateLimit(limitMap, key, limit, windowMs) {
  const now = Date.now();
  const limitData = limitMap.get(key) || { count: 0, resetTime: now + windowMs };
  
  if (now > limitData.resetTime) {
    limitData.count = 1;
    limitData.resetTime = now + windowMs;
  } else {
    limitData.count++;
  }
  
  limitMap.set(key, limitData);
  return limitData.count <= limit;
}

const ALLOWED_ORIGINS = [
  'https://go.reandaily.dev',
  'https://reandaily.dev'
];

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow localhost and local loopback origins for local development
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  return false;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const isAllowed = isOriginAllowed(origin);
  
  // Set CORS headers
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-goog-api-client');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Enforce allowed origins for proxy requests (block unauthorized origins)
  if (!isAllowed && origin) {
    return res.status(403).json({ error: 'Forbidden: CORS origin not allowed' });
  }

  try {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!projectId || !geminiApiKey) {
      return res.status(500).json({ error: 'Server configuration error: Missing environment variables' });
    }

    // 1. Enforce Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    
    const token = authHeader.substring(7);
    let userPayload;
    try {
      userPayload = await verifyFirebaseToken(token, projectId);
    } catch (authError) {
      return res.status(401).json({ error: `Unauthorized: ${authError.message}` });
    }

    // 2. IP-based and User-based Rate Limiting
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userId = userPayload.sub;
    
    // IP Limit: 30 requests/minute
    if (!checkRateLimit(ipLimits, ip, 30, 60 * 1000)) {
      return res.status(429).json({ error: 'Rate limit exceeded: Too many requests from this IP' });
    }
    // User Limit: 60 requests/minute
    if (!checkRateLimit(userLimits, userId, 60, 60 * 1000)) {
      return res.status(429).json({ error: 'Rate limit exceeded: Too many requests from this user' });
    }

    // 3. Path & Action Whitelisting
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = parsedUrl.pathname.replace(/^\/api-proxy/, '');
    
    const pathRegex = /^\/v1(beta)?\/models\/gemini-2.5-flash:generateContent$/;
    if (!pathRegex.test(path)) {
      return res.status(403).json({ error: 'Forbidden: Action/model not whitelisted' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // 4. Payload Validation
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Bad Request: Invalid JSON body' });
    }
    if (!body.contents) {
      return res.status(400).json({ error: 'Bad Request: Missing contents' });
    }
    
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyString.length > 100 * 1024) { // 100KB Limit
      return res.status(400).json({ error: 'Bad Request: Payload size limit exceeded' });
    }

    // 5. Forward Request to upstream Gemini API
    const upstreamUrl = `https://generativelanguage.googleapis.com${path}?key=${geminiApiKey}`;
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-client': req.headers['x-goog-api-client'] || ''
      },
      body: bodyString
    });

    const data = await upstreamResponse.json();
    return res.status(upstreamResponse.status).json(data);
    
  } catch (error) {
    console.error('API proxy error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
