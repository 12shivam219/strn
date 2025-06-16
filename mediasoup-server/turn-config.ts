// TURN/STUN configuration
export const TURN_CONFIG = {
  // Azure Media Services TURN/STUN configuration
  azure: {
    enabled: process.env.USE_AZURE_TURN === 'true',
    accountName: process.env.AZURE_MEDIA_ACCOUNT_NAME,
    accountKey: process.env.AZURE_MEDIA_ACCOUNT_KEY,
    location: process.env.AZURE_MEDIA_ACCOUNT_LOCATION,
    region: process.env.AZURE_MEDIA_ACCOUNT_REGION,
    endpoint: process.env.AZURE_MEDIA_ACCOUNT_ENDPOINT,
    servers: [
      'turn:turn.bistri.com:80',
      'turn:turn.bistri.com:443'
    ]
  },

  // Free TURN/STUN servers (for development/testing)
  free: {
    enabled: true,  // Default to true for free servers
    servers: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302',
      'turn:numb.viagenie.ca',
      'turn:192.158.29.39:3478?transport=udp',
      'turn:192.158.29.39:3478?transport=tcp'
    ]
  },

  // Custom TURN/STUN servers (for production)
  custom: {
    enabled: process.env.USE_CUSTOM_TURN === 'true',
    servers: process.env.CUSTOM_TURN_SERVERS?.split(',') || [],
    username: process.env.TURN_USERNAME,
    password: process.env.TURN_PASSWORD,
    ttl: parseInt(process.env.TURN_TTL || '86400')
  }
};

// Default to free TURN/STUN servers if no other configuration is enabled
if (!TURN_CONFIG.azure.enabled && !TURN_CONFIG.custom.enabled) {
  TURN_CONFIG.free.enabled = true;
}

// Helper function to get TURN credentials
export async function getTurnCredentials(): Promise<{ username: string; password: string; ttl: number }> {
  if (TURN_CONFIG.azure.enabled) {
    // Get credentials from Azure Media Services
    const response = await fetch(`https://${TURN_CONFIG.azure.endpoint}/api/turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAzureAccessToken()}`
      }
    });
    const data = await response.json();
    return {
      username: data.username,
      password: data.password,
      ttl: data.ttl
    };
  } else if (TURN_CONFIG.custom.enabled) {
    // Use custom TURN server credentials
    return {
      username: TURN_CONFIG.custom.username || 'guest',
      password: TURN_CONFIG.custom.password || 'guest',
      ttl: TURN_CONFIG.custom.ttl
    };
  } else {
    // For free TURN servers, generate temporary credentials
    return {
      username: `guest-${Date.now()}`,
      password: Math.random().toString(36).substring(2, 15),
      ttl: 86400
    };
  }
}

// Helper function to get Azure Media Services access token
async function getAzureAccessToken(): Promise<string> {
  const endpoint = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope: 'https://management.azure.com/.default',
      grant_type: 'client_credentials'
    })
  });
  const data = await response.json();
  return data.access_token;
}

// Export default configuration
export default TURN_CONFIG;
