export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 1. Setup CORS headers so your Cloudflare Pages frontend is allowed to talk to this backend
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // A reliable, privacy-respecting public open API wrapper for YouTube data
    const PIPED_API = "https://pipedapi.kavin.rocks";

    // 2. ROUTE: Search Proxy
    if (url.pathname === "/api/search") {
      const query = url.searchParams.get("q");
      if (!query) {
        return new Response(JSON.stringify({ error: "Query required" }), { status: 400, headers: corsHeaders });
      }

      try {
        const targetUrl = `${PIPED_API}/search?q=${encodeURIComponent(query)}&filter=videos`;
        const response = await fetch(targetUrl);
        const data = await response.text();
        
        return new Response(data, {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to fetch search data" }), { status: 500, headers: corsHeaders });
      }
    }

    // 3. ROUTE: Video Stream Proxy (The Actual Unblocker Core)
    if (url.pathname === "/api/stream") {
      const videoId = url.searchParams.get("id");
      if (!videoId) {
        return new Response("Video ID required", { status: 400, headers: corsHeaders });
      }

      try {
        // Fetch raw stream endpoints from the alternative backend architecture
        const apiResponse = await fetch(`${PIPED_API}/videos/${videoId}`);
        const videoData = await apiResponse.json();
        
        // Find the first working direct MP4 or video stream URL
        const directStreamUrl = videoData.videoStreams?.[0]?.url;
        if (!directStreamUrl) {
          return new Response("No unblocked stream source found", { status: 404, headers: corsHeaders });
        }

        // Fetch the raw binary data chunks of the video directly using Cloudflare's server infrastructure
        const mediaStream = await fetch(directStreamUrl);
        
        // Pass the raw media chunks directly down the network line back to the user's HTML5 video container
        return new Response(mediaStream.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": mediaStream.headers.get("Content-Type") || "video/mp4",
            "Content-Length": mediaStream.headers.get("Content-Length")
          }
        });
      } catch (err) {
        return new Response("Streaming extraction pipeline error", { status: 500, headers: corsHeaders });
      }
    }

    // Default Fallback
    return new Response("Netlii | Watch Engine Online", { headers: corsHeaders });
  }
};
