declare global {
    interface Window {
        google?: {
            accounts: {
                oauth2: {
                    initTokenClient(config: {
                        client_id: string;
                        scope: string;
                        callback: (response: { access_token?: string; error?: string }) => void;
                    }): {
                        requestAccessToken(): void;
                    };
                };
            };
        };
    }
}

const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube";

export function loadGoogleIdentityServices(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
        document.head.appendChild(script);
    });
}

export function requestAccessToken(clientId: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!window.google?.accounts) {
            reject(new Error("Google Identity Services not loaded"));
            return;
        }
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else if (response.access_token) {
                    resolve(response.access_token);
                } else {
                    reject(new Error("No access token received"));
                }
            },
        });
        client.requestAccessToken();
    });
}

export async function uploadVideo(
    accessToken: string,
    file: File,
    title: string,
    description: string,
    onProgress?: (percent: number) => void
): Promise<{ videoId: string; etag: string }> {
    // Step 1: Initialize resumable upload
    const metadata = {
        snippet: { title, description, categoryId: "22" },
        status: {
            privacyStatus: "unlisted",
            selfDeclaredMadeForKids: false,
        },
    };

    const initRes = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "X-Upload-Content-Type": file.type,
                "X-Upload-Content-Length": String(file.size),
            },
            body: JSON.stringify(metadata),
        }
    );

    if (!initRes.ok) {
        const err = await initRes.text();
        throw new Error(`Failed to initialize upload: ${err}`);
    }

    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) throw new Error("No upload URL received");

    // Step 2: Upload file via XHR for progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        });

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText);
                resolve({
                    videoId: data.id,
                    etag: data.etag.replace(/"/g, ""),
                });
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload network error")));

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
    });
}

export async function updateVideoPrivacy(
    accessToken: string,
    videoId: string,
    privacyStatus: "public" | "unlisted" | "private"
): Promise<void> {
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            id: videoId,
            status: { privacyStatus },
        }),
    });

    if (!res.ok) throw new Error("Failed to update video privacy");
}
