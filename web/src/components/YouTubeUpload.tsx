"use client";

import { useState, useRef, useCallback } from "react";
import {
    loadGoogleIdentityServices,
    requestAccessToken,
    uploadVideo,
} from "@/lib/youtube";
import toast from "react-hot-toast";
import { saveYouTubeToken } from "@/lib/applications";

interface YouTubeUploadProps {
    dealId: number;
    onUploadComplete: (videoId: string, etag: string) => void;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function YouTubeUpload({ dealId, onUploadComplete }: YouTubeUploadProps) {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [title, setTitle] = useState(
        `TrustTube Sponsorship - Order #${dealId}`
    );
    const [description, setDescription] = useState(
        "Sponsored content via TrustTube"
    );
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [result, setResult] = useState<{
        videoId: string;
        etag: string;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // If no Google Client ID configured, don't render
    if (!clientId) return null;

    const handleSignIn = async () => {
        setIsAuthenticating(true);
        try {
            await loadGoogleIdentityServices();
            const token = await requestAccessToken(clientId);
            setAccessToken(token);
        } catch (error) {
            console.error("OAuth error:", error);
            toast.error("Failed to sign in with YouTube");
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.type.startsWith("video/")) {
            setFile(droppedFile);
        } else {
            toast.error("Please drop a video file");
        }
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected && selected.type.startsWith("video/")) {
            setFile(selected);
        } else {
            toast.error("Please select a video file");
        }
    };

    const handleUpload = async () => {
        if (!accessToken || !file) return;
        setIsUploading(true);
        setUploadProgress(0);
        try {
            const res = await uploadVideo(
                accessToken,
                file,
                title,
                description,
                setUploadProgress
            );
            setResult(res);
            onUploadComplete(res.videoId, res.etag);
            // Save token so the client can make the video public after approval
            saveYouTubeToken(dealId, accessToken).catch(() => {});
            toast.success("Video uploaded to YouTube!");
        } catch (error) {
            console.error("Upload error:", error);
            toast.error("Failed to upload video");
        } finally {
            setIsUploading(false);
        }
    };

    // Upload complete
    if (result) {
        return (
            <div className="rounded-lg bg-emerald-900/10 border border-emerald-800/50 p-4">
                <div className="flex items-center gap-2 mb-1.5">
                    <svg
                        className="h-4 w-4 text-emerald-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <p className="text-sm font-medium text-emerald-300">
                        Video Uploaded (Unlisted)
                    </p>
                </div>
                <p className="text-xs text-zinc-400">
                    Video ID:{" "}
                    <span className="font-mono text-zinc-300">
                        {result.videoId}
                    </span>
                </p>
                <a
                    href={`https://youtube.com/watch?v=${result.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                >
                    Preview on YouTube &rarr;
                </a>
            </div>
        );
    }

    // Uploading
    if (isUploading) {
        return (
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-zinc-300">
                        Uploading to YouTube...
                    </span>
                    <span className="text-zinc-400">{uploadProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-700">
                    <div
                        className="h-2 rounded-full bg-blue-600 transition-all"
                        style={{ width: `${uploadProgress}%` }}
                    />
                </div>
                {file && (
                    <p className="mt-2 text-xs text-zinc-500">
                        {file.name} ({formatFileSize(file.size)})
                    </p>
                )}
            </div>
        );
    }

    // Not authenticated — show sign-in button
    if (!accessToken) {
        return (
            <button
                onClick={handleSignIn}
                disabled={isAuthenticating}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-700 disabled:opacity-50"
            >
                <svg
                    className="h-5 w-5 text-red-500"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                {isAuthenticating
                    ? "Signing in..."
                    : "Sign in with YouTube"}
            </button>
        );
    }

    // Authenticated — show drop zone + metadata
    return (
        <div className="space-y-3">
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-all ${
                    isDragging
                        ? "border-blue-500 bg-blue-900/10"
                        : file
                          ? "border-emerald-700 bg-emerald-900/10"
                          : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-500"
                }`}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                />
                {file ? (
                    <>
                        <svg
                            className="h-8 w-8 text-emerald-400 mb-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        <p className="text-sm font-medium text-zinc-200">
                            {file.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                            {formatFileSize(file.size)}
                        </p>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setFile(null);
                            }}
                            className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
                        >
                            Change file
                        </button>
                    </>
                ) : (
                    <>
                        <svg
                            className="h-8 w-8 text-zinc-500 mb-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                            />
                        </svg>
                        <p className="text-sm text-zinc-400">
                            Drag & drop your video here
                        </p>
                        <p className="text-xs text-zinc-600">
                            or click to browse
                        </p>
                    </>
                )}
            </div>

            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Video title"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Video description"
                rows={2}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />

            {file && (
                <button
                    onClick={handleUpload}
                    className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-500"
                >
                    Upload to YouTube (Unlisted)
                </button>
            )}
        </div>
    );
}
