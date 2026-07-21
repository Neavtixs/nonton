"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

const S3Url = process.env.NEXT_PUBLIC_S3_URL;

function formatSpeed(bits: number) {
  const mbps = bits / 1024 / 1024;
  if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
  return `${(bits / 1024).toFixed(0)} Kbps`;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [resolution, setResolution] = useState("");
  const [speed, setSpeed] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const src = `${S3Url}/citizenofakind/output/master.m3u8`;
    if (Hls.isSupported()) {
      const hls = new Hls({
        abrEwmaFastVoD: 2.0,
        abrEwmaSlowVoD: 4.0,
        maxBufferLength: 10,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const idx = hls.currentLevel === -1 ? 0 : hls.currentLevel;
        const level = hls.levels[idx];
        if (level) setResolution(`${level.height}p`);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const level = hls.levels[data.level];
        if (level) setResolution(`${level.height}p`);
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      const id = setInterval(() => {
        const bw = hls.bandwidthEstimate;
        setSpeed(formatSpeed(bw));
      }, 1000);

      return () => {
        hls.destroy();
        clearInterval(id);
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    }
  }, []);

  return (
    <div>
      <video ref={videoRef} />
      <h1>{resolution}</h1>
      <h1>{speed}</h1>
    </div>
  );
}
