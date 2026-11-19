const API_BASE = 'http://localhost:3000/api';

let cachedToken = process.env.TEST_AUTH_TOKEN || '';

async function getTestToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'Authentication required for API tests. Set TEST_AUTH_TOKEN or TEST_USERNAME and TEST_PASSWORD.'
    );
  }

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.token !== 'string') {
    throw new Error(`Test login failed (HTTP ${response.status}): ${body?.error || 'No token returned'}`);
  }

  cachedToken = body.token;
  return cachedToken;
}

export async function authenticatedRequest(endpoint: string, options: RequestInit = {}) {
  const token = await getTestToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const raw = await response.text();
  let data: any = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`API returned non-JSON response (HTTP ${response.status}) for ${endpoint}`);
    }
  }
  return { status: response.status, ok: response.ok, data };
}
