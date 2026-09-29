import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json() as { url?: string };
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Normalize URL
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;

    // Fetch target website HTML
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OVG-BrandScraper/1.0',
      },
      signal: AbortSignal.timeout(8000), // 8s timeout
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch target website: ${response.statusText}` }, { status: 400 });
    }

    const html = await response.text();

    // Basic regex extractions for metadata
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const brandName = titleMatch ? titleMatch[1].trim() : new URL(targetUrl).hostname;

    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const logoUrl = ogImageMatch ? ogImageMatch[1] : '';

    // Fallback favicon extraction
    const faviconMatch = html.match(/<link[^>]*rel=["'](shortcut icon|icon)["'][^>]*href=["']([^"']+)["']/i);
    let faviconUrl = faviconMatch ? faviconMatch[2] : '';
    if (faviconUrl && !faviconUrl.startsWith('http')) {
      const parsed = new URL(targetUrl);
      faviconUrl = `${parsed.protocol}//${parsed.host}${faviconUrl.startsWith('/') ? '' : '/'}${faviconUrl}`;
    }

    // Construct preliminary branding payload matching our tenant schema
    const scrapedBranding = {
      brandName: brandName.split('|')[0].split('-')[0].trim(),
      logoUrl: logoUrl || faviconUrl || '',
      primaryColor: '#307fbb', // Default fallback accent
      widgetBody: {
        type: 'gradient',
        value: 'linear-gradient(135deg, #81b3f3, #307fbb)',
        opacity: 0.9,
        backdropBlur: true,
      },
      header: {
        type: 'solid',
        value: '#050A14',
      },
      footer: {
        type: 'solid',
        value: '#050A14',
      }
    };

    return NextResponse.json({
      success: true,
      data: {
        brandName: scrapedBranding.brandName,
        logoUrl: scrapedBranding.logoUrl,
        brandingColors: '#307fbb',
        branding: scrapedBranding,
      }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error during scraping';
    console.error('[BrandScraper Error]:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}