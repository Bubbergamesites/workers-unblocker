export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // A list of redundant public backup APIs to ensure uptime
    const BACKEND_MIRRORS = [
      "https://pipedapi.leptons.xyz",
      "https://pipedapi.moomoo.me",
      "https://piped-api.garudalinux.org",
      "https://pipedapi.kavin.rocks"
    ];

    // Helper function that rotates mirrors automatically if one throws an error
    async function fetchFromMirrors(endpoint) {
      let lastError = null;
      for (const mirror of BACKEND_MIRRORS) {
        try {
          const res = await fetch(`${mirror}${endpoint}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (res.ok) return res;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError || new Error("All proxy extraction engines are offline");
    }

    // 1. SEARCH ROUTE
    if (url.pathname === "/api/search") {
      const query = url.searchParams.get("q");
      if (!query) return new Response("Missing q parameter", { status: 400, headers: corsHeaders });

      try {
        const response = await fetchFromMirrors(`/search?q=${encodeURIComponent(query)}&filter=videos`);
        const data = await response.text();
        return new Response(data, {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 2. STREAM ROUTE
    if (url.pathname === "/api/stream") {
      const videoId = url.searchParams.get("id");
      if (!videoId) return new Response("Missing video ID", { status: 400, headers: corsHeaders });

      try {
        const apiResponse = await fetchFromMirrors(`/videos/${videoId}`);
        const videoData = await apiResponse.json();
        
        // Find a high-quality video stream endpoint
        const directStreamUrl = videoData.videoStreams?.find(s => s.videoOnly === false)?.url || videoData.videoStreams?.[0]?.url;
        
        if (!directStreamUrl) {
          return new Response("No unblocked source found", { status: 404, headers: corsHeaders });
        }

        // Fetch video file binary segments directly via Cloudflare's server IP
        const mediaStream = await fetch(directStreamUrl);
        
        return new Response(mediaStream.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": mediaStream.headers.get("Content-Type") || "video/mp4",
            "Content-Length": mediaStream.headers.get("Content-Length"),
            "Cache-Control": "public, max-age=3600"
          }
        });
      } catch (err) {
        return new Response("Media sync error: " + err.message, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Netlii Engine Operational", { headers: corsHeaders });
  }
};
