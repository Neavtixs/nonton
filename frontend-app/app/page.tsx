"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import Hls from "hls.js";
import {
  ChevronsLeftIcon,
  ChevronsRightIcon,
  PlayIcon,
  VideoIcon,
  WifiIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const S3Url = process.env.NEXT_PUBLIC_S3_URL;
const ApiUrl = process.env.NEXT_PUBLIC_API_URL;

function formatSpeed(bits: number) {
  const mbps = bits / 1024 / 1024;
  if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
  return `${(bits / 1024).toFixed(0)} Kbps`;
}

export default function Home() {
  const searchParams = useSearchParams();
  const admin = searchParams.get("admin");

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const serverPlaying = useRef(false);

  const [resolution, setResolution] = useState("");
  const [speed, setSpeed] = useState("");
  const [loading, setLoading] = useState(true);
  const [controlLoading, setControlLoading] = useState(true);

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

  useEffect(() => {
    if (loading) return;

    const es = new EventSource(`${ApiUrl}/api/state`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log(data);

      videoRef.current!.currentTime = data.currentTime;
      serverPlaying.current = data.playing;

      if (data.playing) {
        videoRef.current!.play().catch((err) => {
          console.log(err);
        });
      } else {
        videoRef.current!.pause();
      }

      setControlLoading(false);
    };

    return () => es.close();
  }, [loading]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const playHandle = () => {
      if (!serverPlaying.current) {
        video.pause();
      }
    };
    const pauseHandle = () => {
      if (serverPlaying.current) {
        video.play().catch(() => {});
      }
    };

    const handleSeeking = () => {
      fetch(`${ApiUrl}/api/state/current`).then(async (resp) => {
        const data = await resp.json();
        const diff = Math.abs(video.currentTime - data.currentTime);
        if (diff > 0.2) video.currentTime = data.currentTime;
      });
    };

    const handleRateChange = () => {
      if (video.playbackRate !== 1) {
        video.playbackRate = 1;
      }
    };

    video.addEventListener("pause", pauseHandle);
    video.addEventListener("play", playHandle);
    video.addEventListener("seeking", handleSeeking);
    video.addEventListener("ratechange", handleRateChange);

    return () => {
      video.removeEventListener("pause", pauseHandle);
      video.removeEventListener("play", playHandle);
      video.removeEventListener("seeking", handleSeeking);
      video.removeEventListener("ratechange", handleRateChange);
    };
  }, []);

  function playHandle() {
    setControlLoading(true);

    fetch(`${ApiUrl}/api/state/play`, {
      method: "PUT",
      body: JSON.stringify({
        currentTime: videoRef.current!.currentTime,
      }),
    });
  }

  function pauseHandle() {
    setControlLoading(true);

    fetch(`${ApiUrl}/api/state/pause`, {
      method: "PUT",
      body: JSON.stringify({
        currentTime: videoRef.current!.currentTime,
      }),
    });
  }

  function seekBackwardHandle() {
    setControlLoading(true);

    fetch(`${ApiUrl}/api/state/seek`, {
      method: "PUT",
      body: JSON.stringify({
        delta: -10,
      }),
    });
  }

  function seekForwardHandle() {
    setControlLoading(true);

    fetch(`${ApiUrl}/api/state/seek`, {
      method: "PUT",
      body: JSON.stringify({
        delta: 10,
      }),
    });
  }

  return (
    <div className="mx-25 p-2 flex flex-col gap-2">
      <Card className="bg-black/80 aspect-video relative flex justify-center items-center">
        {loading && (
          <div className="absolute">
            <Spinner className="size-8 text-white" />
          </div>
        )}
        <video
          ref={videoRef}
          style={{ display: !loading ? "block" : "none" }}
          onCanPlay={() => setLoading(false)}
          className="size-full"
        />
      </Card>
      {!loading && (
        <div className="grid grid-cols-[1fr_auto_1fr] ">
          <div className="justify-self-start flex flex-col gap-1.5">
            <Badge variant={serverPlaying.current ? "default" : "destructive"}>
              Current: {serverPlaying.current ? "Playing" : "Paused"}
            </Badge>
            <Badge variant={"secondary"}>
              <VideoIcon data-icon="inline-start" />
              <span>{resolution}</span>
            </Badge>
            <Badge variant={"secondary"}>
              <WifiIcon data-icon="inline-start" />
              <span>{speed}</span>
            </Badge>
          </div>

          <div className="justify-self-center flex">
            {admin && (
              <>
                <Button
                  size={"lg"}
                  disabled={controlLoading}
                  onClick={seekBackwardHandle}
                >
                  <ChevronsLeftIcon />
                  <span>10s</span>
                </Button>
                <Button
                  size={"lg"}
                  disabled={controlLoading}
                  onClick={serverPlaying.current ? pauseHandle : playHandle}
                >
                  <PlayIcon />
                  <span>{serverPlaying.current ? "Pause" : "Play"}</span>
                </Button>
                <Button
                  size={"lg"}
                  disabled={controlLoading}
                  onClick={seekForwardHandle}
                >
                  <span>10s</span>
                  <ChevronsRightIcon />
                </Button>
              </>
            )}
          </div>

          <div className="justify-self-end">
            <Button
              size={"lg"}
              onClick={() => videoRef.current!.requestFullscreen()}
            >
              Fullscreen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
