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
    const [description, setDescription] = useState("");
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
            <div className="rounded-[10px] bg-emerald-50 border border-emerald-200 p-[1.2rem]">
                <div className="flex items-center gap-2 mb-1.5">
                    <svg
                        className="h-[1rem] w-[1rem] text-emerald-600"
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
                    <p className="text-[0.8rem] font-medium text-emerald-700">
                        Video Uploaded (Unlisted)
                    </p>
                </div>
                <p className="text-[0.7rem] text-[#777]">
                    Video ID:{" "}
                    <span className="font-mono text-[#232323]">
                        {result.videoId}
                    </span>
                </p>
                <a
                    href={`https://youtube.com/watch?v=${result.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-[0.7rem] text-[#E62058] hover:text-[#c10f45]"
                >
                    Preview on YouTube &rarr;
                </a>
            </div>
        );
    }

    // Uploading
    if (isUploading) {
        return (
            <div className="rounded-[10px] border border-[#c4c4c4] bg-[#f6f6f6] p-[1.2rem]">
                <div className="flex items-center justify-between text-[0.8rem] mb-2">
                    <span className="text-[#232323]">
                        Uploading to YouTube...
                    </span>
                    <span className="text-[#777]">{uploadProgress}%</span>
                </div>
                <div className="h-[0.4rem] rounded-full bg-[#c4c4c4]">
                    <div
                        className="h-[0.4rem] rounded-full bg-[#E62058] transition-all"
                        style={{ width: `${uploadProgress}%` }}
                    />
                </div>
                {file && (
                    <p className="mt-2 text-[0.7rem] text-[#a0a0a0]">
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
                className="w-full flex items-center justify-center gap-2 rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.8rem] text-[0.8rem] font-bold text-[#232323] transition-colors hover:border-[#E62058] hover:bg-white disabled:opacity-50"
            >
                <svg
                    className="h-[1.6rem] w-[1.6rem] text-[#E62058]"
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
                className={`flex flex-col items-center justify-center rounded-[10px] border-2 border-dashed p-[2rem] cursor-pointer transition-all ${
                    isDragging
                        ? "border-[#E62058] bg-[#fff1f3]"
                        : file
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-[#a0a0a0] bg-[#f6f6f6] hover:border-[#E62058]"
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
                            className="h-[1.6rem] w-[1.6rem] text-emerald-500 mb-2"
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
                        <p className="text-[0.8rem] font-medium text-[#232323]">
                            {file.name}
                        </p>
                        <p className="text-[0.7rem] text-[#a0a0a0]">
                            {formatFileSize(file.size)}
                        </p>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setFile(null);
                            }}
                            className="mt-2 text-[0.7rem] text-[#a0a0a0] hover:text-[#232323]"
                        >
                            Change file
                        </button>
                    </>
                ) : (
                    <>
                        <svg
                            className="h-[1.6rem] w-[1.6rem] text-[#a0a0a0] mb-2"
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
                        <p className="text-[0.8rem] text-[#777]">
                            Drag & drop your video here
                        </p>
                        <p className="text-[0.7rem] text-[#a0a0a0]">
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
                className="w-full rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.6rem] text-[0.8rem] text-[#232323] placeholder-[#a0a0a0] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058]"
            />
            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Video description"
                rows={2}
                className="w-full rounded-[6px] border border-[#a0a0a0] bg-[#f6f6f6] px-[1rem] py-[0.6rem] text-[0.8rem] text-[#232323] placeholder-[#a0a0a0] focus:border-[#E62058] focus:outline-none focus:ring-1 focus:ring-[#E62058] resize-none"
            />

            {file && (
                <button
                    onClick={handleUpload}
                    className="w-full rounded-[6px] bg-[#E62058] px-[1rem] py-[0.8rem] text-[0.8rem] font-bold text-white transition-colors hover:bg-[#c10f45]"
                >
                    Upload to YouTube (Unlisted)
                </button>
            )}
        </div>
    );
}
