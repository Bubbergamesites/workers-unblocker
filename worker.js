// worker.js

export default {
  async fetch(request, env, ctx) {
    const workerUrl = new URL(request.url);
    
    // We expect the URL format to be: https://your-worker.dev/proxy/https://target-site.com/path
    if (!workerUrl.pathname.startsWith("/proxy/")) {
      return new Response(
        `<h1>Universal Proxy</h1><p>To use, append the target URL to the path. Example:</p>
         <code>${workerUrl.origin}/proxy/https://example.com</code>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Extract the destination URL from the path
    const targetUrlString = workerUrl.pathname.replace("/proxy/", "") + workerUrl.search;
    
    let targetUrl;
    try {
      targetUrl = new URL(targetUrlString);
    } catch (e) {
      return new Response("Invalid target URL provided.", { status: 400 });
    }

    // Clone and prepare headers for the destination server
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Host", targetUrl.host);
    
    if (newHeaders.has("Referer")) {
      newHeaders.set("Referer", targetUrl.origin);
    }
    if (newHeaders.has("Origin")) {
      newHeaders.set("Origin", targetUrl.origin);
    }

    try {
      // Fetch the requested resource
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "manual"
      });

      // Clone response headers and modify CORS policy
      const modifiedHeaders = new Headers(response.headers);
      modifiedHeaders.set("Access-Control-Allow-Origin", "*");
      modifiedHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      modifiedHeaders.set("Access-Control-Allow-Headers", "*");
      
      // Strip restrictive security policies so assets render properly through the proxy
      modifiedHeaders.delete("content-security-policy");
      modifiedHeaders.delete("content-security-policy-report-only");

      // Handle Redirects (3xx responses)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = modifiedHeaders.get("Location");
        if (location) {
          const absoluteRedirect = new URL(location, targetUrl.origin).toString();
          // Force the redirect to go back through this worker proxy route
          modifiedHeaders.set("Location", `${workerUrl.origin}/proxy/${absoluteRedirect}`);
        }
      }

      // If the content is HTML, rewrite links so subsequent clicks stay in the proxy
      const contentType = response.headers.get("Content-Type") || "";
      if (contentType.includes("text/html")) {
        let htmlText = await response.text();
        
        // Rewrite absolute links (href="http...") to go through the proxy
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

      // For non-HTML assets (images, stylesheets, scripts), return the stream raw
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: modifiedHeaders
      });

    } catch (error) {
      return new Response(`Universal Proxy Error: ${error.message}`, { status: 500 });
    }
  }
};
