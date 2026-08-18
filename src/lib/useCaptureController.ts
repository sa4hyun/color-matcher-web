"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStatus, setChannelAndWait } from "./ledClient";
import { captureFrame } from "./colorAnalysis";
import { CaptureSession, LED_CHANNEL_NAMES, RawShot, isSessionComplete } from "./types";
import { saveSessionToDb } from "./db";

export type FlowState = "idle" | "capturing" | "done" | "error";

const SETTLE_MS = 200; // LED가 켜졌다고 확인된 뒤에도 카메라 노출/화이트밸런스가 안정될 때까지 잠깐 대기
const DEVICE_STALE_MS = 45_000; // 이 시간 안에 ESP32가 한 번도 폴링을 안 했으면 "연결 끊김"으로 표시

export function useCaptureController() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  // ESP32는 더 이상 로컬 IP로 직접 연결하지 않는다 — 클라우드(Supabase)를 통해
  // LTE로 폴링하는 구조라서, "연결됨"은 "ESP32가 최근에 폴링했다"는 뜻이다.
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  const [state, setState] = useState<FlowState>("idle");
  const [shots, setShots] = useState<RawShot[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSession, setLastSession] = useState<CaptureSession | null>(null);
  const [waitMessage, setWaitMessage] = useState<string | null>(null);

  const totalSteps = LED_CHANNEL_NAMES.length + 1; // 배경 1 + LED N

  const refreshCameraList = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setCameras(videoInputs);
      return videoInputs;
    } catch {
      return [];
    }
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      setCameraError(null);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const track = stream.getVideoTracks()[0];
        setActiveDeviceId(track?.getSettings().deviceId ?? deviceId ?? null);
        setCameraReady(true);
        await refreshCameraList();
      } catch (e) {
        setCameraError(
          e instanceof Error
            ? `카메라를 열 수 없습니다: ${e.message} (HTTPS로 접속했는지, 카메라 권한을 허용했는지 확인하세요)`
            : "카메라를 열 수 없습니다",
        );
        setCameraReady(false);
      }
    },
    [refreshCameraList],
  );

  const switchCamera = useCallback(
    (deviceId: string) => {
      startCamera(deviceId);
    },
    [startCamera],
  );

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const refreshDeviceStatus = useCallback(async () => {
    try {
      const status = await getStatus();
      setLastSeenAt(status.lastSeenAt);
      const seenMs = status.lastSeenAt
        ? Date.now() - new Date(status.lastSeenAt).getTime()
        : Number.POSITIVE_INFINITY;
      setConnected(seenMs < DEVICE_STALE_MS);
      setConnectError(null);
    } catch (e) {
      setConnected(false);
      setConnectError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // 백그라운드에서 주기적으로 ESP32 연결 상태를 갱신 (촬영 중에는 굳이 겹쳐 돌 필요 없음)
  useEffect(() => {
    refreshDeviceStatus();
    const id = setInterval(() => {
      if (state !== "capturing") refreshDeviceStatus();
    }, 5000);
    return () => clearInterval(id);
  }, [refreshDeviceStatus, state]);

  const connect = useCallback(async () => {
    setConnecting(true);
    await refreshDeviceStatus();
    setConnecting(false);
  }, [refreshDeviceStatus]);

  const captureStep = useCallback(async (stepIndex: number): Promise<RawShot> => {
    if (!videoRef.current) throw new Error("카메라가 준비되지 않았습니다");
    const frame = await captureFrame(videoRef.current);
    return { stepIndex, r: frame.r, g: frame.g, b: frame.b, imageBlob: frame.blob };
  }, []);

  /**
   * 배경 1장 + LED N장을 순서대로 촬영.
   * 단계마다 "채널을 켜라"고 클라우드에 명령을 보낸 뒤, ESP32가 LTE로 그 명령을
   * 실제로 적용했다고 확인해줄 때까지 기다렸다가(수 초~십수 초 걸릴 수 있음)
   * 카메라 프레임을 캡처한다.
   */
  const startCapture = useCallback(async () => {
    if (!connected) {
      setErrorMessage("ESP32에 먼저 연결하세요 (기기가 LTE로 응답한 지 오래됐습니다)");
      setState("error");
      return;
    }
    if (!cameraReady) {
      setErrorMessage("카메라가 준비되지 않았습니다");
      setState("error");
      return;
    }

    setState("capturing");
    setErrorMessage(null);
    setLastSession(null);
    const collected: RawShot[] = [];
    setShots([]);

    try {
      for (let step = 0; step < totalSteps; step++) {
        const channel = step === 0 ? -1 : step - 1; // -1 = 전체 OFF(배경)
        const label = step === 0 ? "배경(전체 OFF)" : `LED ${LED_CHANNEL_NAMES[channel]}`;
        await setChannelAndWait(channel, {
          onTick: (elapsed) =>
            setWaitMessage(`${label} 준비 중... (${Math.round(elapsed / 1000)}초 경과 — LTE라 조금 걸려요)`),
        });
        setWaitMessage(null);
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        const shot = await captureStep(step);
        collected.push(shot);
        setShots([...collected]);
      }
      await setChannelAndWait(-1);

      if (!isSessionComplete(collected)) {
        throw new Error(`촬영이 완전하지 않습니다 (${collected.length}/${totalSteps}장)`);
      }

      const session: CaptureSession = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        label: "",
        shots: collected,
      };
      setLastSession(session);
      setState("done");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      setState("error");
      try {
        await setChannelAndWait(-1, { timeoutMs: 20000 });
      } catch {
        // 정리 실패는 무시 — 원래 에러 메시지를 덮어쓰지 않는다.
      }
    } finally {
      setWaitMessage(null);
    }
  }, [cameraReady, captureStep, connected, totalSteps]);

  const [saving, setSaving] = useState(false);

  const saveWithLabel = useCallback(
    async (label: string) => {
      if (!lastSession) return;
      const trimmed = label.trim();
      if (!trimmed) return;
      setSaving(true);
      try {
        const finalSession: CaptureSession = { ...lastSession, label: trimmed };
        await saveSessionToDb(finalSession);
        setLastSession(finalSession);
      } finally {
        setSaving(false);
      }
    },
    [lastSession],
  );

  const reset = useCallback(() => {
    setState("idle");
    setShots([]);
    setErrorMessage(null);
    setLastSession(null);
  }, []);

  return {
    videoRef,
    cameraReady,
    cameraError,
    cameras,
    activeDeviceId,
    startCamera,
    switchCamera,
    connected,
    connecting,
    connectError,
    lastSeenAt,
    connect,
    state,
    shots,
    totalSteps,
    errorMessage,
    waitMessage,
    lastSession,
    startCapture,
    saveWithLabel,
    saving,
    reset,
  };
}
