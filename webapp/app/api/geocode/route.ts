import { NextRequest, NextResponse } from 'next/server';

/**
 * Geocoding API proxy for PDOK Locatieserver
 *
 * This endpoint proxies requests to the PDOK (Publieke Dienstverlening Op de Kaart)
 * Locatieserver API, which provides geocoding and address lookup services for
 * the Netherlands.
 *
 * Benefits of using a proxy:
 * - Hides API details from client
 * - Bypasses CSP restrictions
 * - Allows server-side rate limiting
 * - Can add caching if needed
 */

// Simple in-memory rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

interface PDOKSuggestion {
  weergavenaam: string;  // Display name (e.g., "Kalverstraat 1, Amsterdam")
  id: string;
  type: string;          // Type (e.g., "adres", "weg", "plaats")
  score: number;
  centroide_ll?: string; // "POINT(lon lat)"
  gemeentenaam?: string; // Municipality name
}

interface PDOKLookupResult {
  weergavenaam: string;
  centroide_ll: string;
  gemeentenaam: string;
  straatnaam?: string;
  huisnummer?: string;
  postcode?: string;
  woonplaatsnaam?: string;
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // Check rate limit
    if (!checkRateLimit(ip)) {
      return new NextResponse(
        JSON.stringify({
          error: 'Rate limit exceeded',
          message: `Maximum ${RATE_LIMIT} requests per minute`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(RATE_LIMIT_WINDOW / 1000),
          },
        }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const id = searchParams.get('id'); // For lookup after selection
    const lat = searchParams.get('lat'); // For reverse geocoding
    const lon = searchParams.get('lon');

    if (!query && !id && !(lat && lon)) {
      return new NextResponse(
        JSON.stringify({
          error: 'Missing parameter',
          message: 'Provide "q" (query), "id" (lookup), or "lat"+"lon" (reverse)',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Reverse geocoding: nearest address for a coordinate
    if (lat && lon) {
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
        return new NextResponse(
          JSON.stringify({ error: 'Invalid coordinates' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const reverseUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?lat=${latNum}&lon=${lonNum}&rows=1&type=adres&fl=*`;
      const response = await fetch(reverseUrl, { headers: { Accept: 'application/json' } });

      if (!response.ok) {
        throw new Error(`PDOK reverse API error: ${response.status}`);
      }

      const data = await response.json();
      const doc = data.response?.docs?.[0];

      if (!doc) {
        return new NextResponse(
          JSON.stringify({ error: 'Not found', message: 'No address near this location' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const centroidMatch = doc.centroide_ll?.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const coordinates = centroidMatch
        ? {
            longitude: parseFloat(centroidMatch[1]),
            latitude: parseFloat(centroidMatch[2]),
          }
        : { longitude: lonNum, latitude: latNum };

      return NextResponse.json({
        id: doc.id,
        displayName: doc.weergavenaam,
        municipality: doc.gemeentenaam,
        street: doc.straatnaam,
        houseNumber: doc.huisnummer,
        postalCode: doc.postcode,
        city: doc.woonplaatsnaam,
        coordinates,
      });
    }

    // If ID provided, do a lookup (get full details for selected suggestion)
    if (id) {
      const lookupUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${encodeURIComponent(id)}&fl=*`;

      const response = await fetch(lookupUrl, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`PDOK API error: ${response.status}`);
      }

      const data = await response.json();
      const doc = data.response?.docs?.[0];

      if (!doc) {
        return new NextResponse(
          JSON.stringify({
            error: 'Not found',
            message: 'Address not found',
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }

      // Parse centroid coordinates
      const centroidMatch = doc.centroide_ll?.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const coordinates = centroidMatch
        ? {
            longitude: parseFloat(centroidMatch[1]),
            latitude: parseFloat(centroidMatch[2]),
          }
        : null;

      return NextResponse.json({
        id: doc.id,
        displayName: doc.weergavenaam,
        municipality: doc.gemeentenaam,
        street: doc.straatnaam,
        houseNumber: doc.huisnummer,
        postalCode: doc.postcode,
        city: doc.woonplaatsnaam,
        coordinates,
      });
    }

    // Otherwise, do a suggest (autocomplete search)
    const suggestUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(
      query!
    )}&rows=10`;

    const response = await fetch(suggestUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`PDOK API error: ${response.status}`);
    }

    const data = await response.json();
    const suggestions = data.response?.docs || [];

    // Transform PDOK response to simpler format
    const results = suggestions.map((doc: PDOKSuggestion) => ({
      id: doc.id,
      displayName: doc.weergavenaam,
      type: doc.type,
      municipality: doc.gemeentenaam,
      score: doc.score,
    }));

    return NextResponse.json({
      query: query,
      results,
    });
  } catch (error) {
    console.error('Geocoding error:', error);
    return new NextResponse(
      JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to fetch geocoding results',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
