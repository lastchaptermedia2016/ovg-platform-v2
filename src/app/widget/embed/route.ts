import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenant");

  if (!tenantId) {
    return new NextResponse('console.error("OVG Widget: Missing tenant ID");', {
      headers: { "Content-Type": "application/javascript" },
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  // The "Loader" script that clients paste into their HTML
  const script = `
    (function() {
      function init() {
        const container = document.createElement('div');
        container.id = 'ovg-widget-root';

        const target = document.body || document.documentElement;
        target.appendChild(container);

        const iframe = document.createElement('iframe');
        iframe.src = '${appUrl}/widget/${tenantId}';
        iframe.style.position = 'fixed';
        iframe.style.bottom = '20px';
        iframe.style.right = '20px';
        iframe.style.width = '450px';
        iframe.style.height = '700px';
        iframe.style.border = 'none';
        iframe.style.zIndex = '999999';
        iframe.style.colorScheme = 'none';
        iframe.allow = 'microphone';

        container.appendChild(iframe);

        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'ovg-widget-resize') {
            iframe.style.width = event.data.width;
            iframe.style.height = event.data.height;
          }
        });
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  `;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
