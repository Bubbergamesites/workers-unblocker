export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Allow the frontend to bypass Cross-Origin restrictions
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Route 1: Search Proxy
    if (url.pathname === "/api/search") {
      const query = url.searchParams.get("q");
      const targetUrl = `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`;
      
      try {
        const response = await fetch(targetUrl);
        const data = await response.text();
        return new Response(data, {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Proxy failed" }), { status: 500, headers: corsHeaders });
      }
    }

    // Route 2: Video Stream Proxy (This does the actual unblocking)
    if (url.pathname === "/api/stream") {
      const videoId = url.searchParams.get("id");
      if (!videoId) return new Response("Missing ID", { status: 400 });

      try {
        // Fetch raw streams from the API backend
        const apiResponse = await fetch(`https://pipedapi.kavin.rocks/videos/${videoId}`);
        const videoData = await apiResponse.json();
        
        // Grab the direct video file link (MP4/HLS)
        const directStreamUrl = videoData.videoStreams?.[0]?.url;
        if (!directStreamUrl) return new Response("Stream not found", { status: 404 });

        // Fetch the raw video data stream from the target source
        const mediaStream = await fetch(directStreamUrl);
        
        // Pipe the video back to the user through Cloudflare's IP network
        return new Response(mediaStream.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": mediaStream.headers.get("Content-Type") || "video/mp4",
            "Content-Length": mediaStream.headers.get("Content-Length")
          }
        });
      } catch (err) {
        return new Response("Streaming error", { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Netlii Worker Proxy API Operational", { headers: corsHeaders });
  }
};
