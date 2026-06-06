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

    // High availability public instance array
    const MIRRORS = [
      "https://pipedapi.moomoo.me",
      "https://pipedapi.leptons.xyz",
      "https://piped-api.garudalinux.org",
      "https://pipedapi.tokhmi.xyz"
    ];

    async function autoFetch(endpoint) {
      let errorState = null;
      for (const base of MIRRORS) {
        try {
          const res = await fetch(`${base}${endpoint}`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
          });
          if (res.ok) return res;
        } catch (e) {
          errorState = e;
        }
      }
      throw errorState || new Error("All data pipelines timed out.");
    }

    // SEARCH ENDPOINT
    if (url.pathname === "/api/search") {
      const query = url.searchParams.get("q");
      if (!query) return new Response("[]", { headers: corsHeaders });

      try {
        const response = await autoFetch(`/search?q=${encodeURIComponent(query)}&filter=videos`);
        const data = await response.text();
        return new Response(data, {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify([]), { headers: corsHeaders });
      }
    }

    // STREAM PIPELINE ENDPOINT
    if (url.pathname === "/api/stream") {
      const videoId = url.searchParams.get("id");
      if (!videoId) return new Response("Missing video parameter ID", { status: 400, headers: corsHeaders });

      try {
        const apiResponse = await autoFetch(`/videos/${videoId}`);
        const videoData = await apiResponse.json();
        
        // Find streams containing both audio and video tracks synchronously
        const chosenStream = videoData.videoStreams?.find(s => s.videoOnly === false) || videoData.videoStreams?.[0];
        
        if (!chosenStream || !chosenStream.url) {
          return new Response("No unblocked format track available", { status: 404, headers: corsHeaders });
        }

        // Direct stream bridge request via cloud flare proxies
        const mediaRequest = await fetch(chosenStream.url);
        
        return new Response(mediaRequest.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": mediaRequest.headers.get("Content-Type") || "video/mp4",
            "Content-Length": mediaRequest.headers.get("Content-Length"),
            "Cache-Control": "public, max-age=3600"
          }
        });
      } catch (err) {
        return new Response("Pipeline Error: " + err.message, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Netlii Core Up", { headers: corsHeaders });
  }
};
