export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const videoId = url.searchParams.get("videoId");

        if (!videoId) {
            return Response.json({ error: "Missing ?videoId= query parameter" }, { status: 400 });
        }

        const apiKey = env.YOUTUBE_API_KEY;
        if (!apiKey) {
            return Response.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 500 });
        }

        const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${encodeURIComponent(videoId)}&key=${apiKey}`;

        const ytResponse = await fetch(ytUrl);
        if (!ytResponse.ok) {
            return Response.json({ error: `YouTube API error: ${ytResponse.status}` }, { status: 502 });
        }

        const ytData = await ytResponse.json();

        if (!ytData.items || ytData.items.length === 0) {
            return Response.json({ error: "Video not found" }, { status: 404 });
        }

        const item = ytData.items[0];
        const result = {
            videoId: item.id,
            etag: item.etag,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            viewCount: parseInt(item.statistics.viewCount, 10),
            likeCount: parseInt(item.statistics.likeCount, 10),
            commentCount: parseInt(item.statistics.commentCount || "0", 10),
        };

        return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
        });
    },
};
