// worker.js

const TARGET_HOST = "www.youtube.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 1. Change the hostname from your Worker's URL to YouTube's URL
    url.hostname = TARGET_HOST;
    url.protocol = "https:";

    // 2. Clone the original request headers
    const newHeaders = new Headers(request.headers);

    // Update host and referrer headers so YouTube thinks the request came directly
    newHeaders.set("Host", TARGET_HOST);
    newHeaders.set("Origin", `https://${TARGET_HOST}`);
    if (newHeaders.has("Referer")) {
      newHeaders.set("Referer", `https://${TARGET_HOST}/`);
    }

    // 3. Create the modified request to fetch from YouTube
    const modifiedRequest = new Request(url.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual", // Handle redirects manually to prevent dropping cookies/headers
    });

    try {
      // 4. Send the request to YouTube's servers
      const response = await fetch(modifiedRequest);

      // 5. Clone the response headers to modify them for your browser
      const modifiedHeaders = new Headers(response.headers);

      // Inject CORS headers so your custom HTML front-ends can read the data
      modifiedHeaders.set("Access-Control-Allow-Origin", "*");
      modifiedHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      modifiedHeaders.set("Access-Control-Allow-Headers", "*");

      // Remove restrictive Content Security Policies (CSP) so the page can load assets smoothly
      modifiedHeaders.delete("content-security-policy");
      modifiedHeaders.delete("content-security-policy-report-only");

      // Handle redirects: If YouTube redirects the browser, rewrite the redirect target to use your worker domain
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = modifiedHeaders.get("Location");
        if (location) {
          try {
            const redirectUrl = new URL(location, `https://${TARGET_HOST}`);
            if (redirectUrl.hostname === TARGET_HOST) {
              redirectUrl.hostname = new URL(request.url).hostname;
              redirectUrl.protocol = new URL(request.url).protocol;
              modifiedHeaders.set("Location", redirectUrl.toString());
            }
          } catch (e) {
            // Leave location intact if parsing fails
          }
        }
      }

      // 6. Return the proxied response back to the client browser
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: modifiedHeaders,
      });

    } catch (error) {
      return new Response(`Worker Proxy Error: ${error.message}`, { status: 500 });
    }
  },
};
