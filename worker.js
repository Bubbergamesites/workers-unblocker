// worker.js

const DEFAULT_HOST = "https://www.youtube.com";

export default {
  async fetch(request, env, ctx) {
    const workerUrl = new URL(request.url);
    let targetUrl;

    // 1. Determine the target URL
    // If the user is just visiting the base worker URL (e.g., your-worker.dev/)
    if (workerUrl.pathname === "/" || workerUrl.pathname === "") {
      targetUrl = new URL(DEFAULT_HOST);
    } 
    // If a specific URL path is requested via the proxy prefix
    else if (workerUrl.pathname.startsWith("/proxy/")) {
      const targetUrlString = workerUrl.pathname.replace("/proxy/", "") + workerUrl.search;
      try {
        targetUrl = new URL(targetUrlString);
      } catch (e) {
        return new Response("Invalid target URL provided.", { status: 400 });
      }
    } 
    // If it's a relative asset path (e.g., /s/player/... or /results) fallback to the last known host or default to YouTube
    else {
      // Check the Referer header to see what site requested this asset
      const referer = request.headers.get("Referer");
      if (referer && referer.includes("/proxy/")) {
        const parts = referer.split("/proxy/");
        const actualRefUrl = new URL(parts[1]);
        targetUrl = new URL(workerUrl.pathname + workerUrl.search, actualRefUrl.origin);
      } else {
        targetUrl = new URL(workerUrl.pathname + workerUrl.search, DEFAULT_HOST);
      }
    }

    // 2. Prepare headers for the target server
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Host", targetUrl.host);
    
    if (newHeaders.has("Referer")) {
      newHeaders.set("Referer", targetUrl.origin);
    }
    if (newHeaders.has("Origin")) {
      newHeaders.set("Origin", targetUrl.origin);
    }

    try {
      // 3. Fetch from the target server
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "manual"
      });

      // 4. Modify response headers for CORS compliance
      const modifiedHeaders = new Headers(response.headers);
      modifiedHeaders.set("Access-Control-Allow-Origin", "*");
      modifiedHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      modifiedHeaders.set("Access-Control-Allow-Headers", "*");
      
      modifiedHeaders.delete("content-security-policy");
      modifiedHeaders.delete("content-security-policy-report-only");

      // 5. Handle HTTP redirects (3xx responses)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = modifiedHeaders.get("Location");
        if (location) {
          const absoluteRedirect = new URL(location, targetUrl.origin).toString();
          modifiedHeaders.set("Location", `${workerUrl.origin}/proxy/${absoluteRedirect}`);
        }
      }

      // 6. Rewrite links in HTML responses so all navigation stays proxied
      const contentType = response.headers.get("Content-Type") || "";
      if (contentType.includes("text/html")) {
        let htmlText = await response.text();
        
        // Rewrite absolute links (href="http...") to go through the proxy route
        htmlText = htmlText.replace(/(href|src)=["'](https?:\/\/[^"']+)["']/g, (match, attribute, url) => {
          return `${attribute}="${workerUrl.origin}/proxy/${url}"`;
        });

        // Rewrite relative links (href="/path") to absolute proxy links
        htmlText = htmlText.replace(/(href|src)=["'](\/[^"']+)["']/g, (match, attribute, path) => {
          const absoluteUrl = new URL(path, targetUrl.origin).toString();
          return `${attribute}="${workerUrl.origin}/proxy/${absoluteUrl}"`;
        });

        return new Response(htmlText, {
          status: response.status,
          headers: modifiedHeaders
        });
      }

      // Return images, styles, scripts, and video fragments normally
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: modifiedHeaders
      });

    } catch (error) {
      return new Response(`Proxy Error: ${error.message}`, { status: 500 });
    }
  }
};
