"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { ProgressDots } from "@/components/ProgressDots";
import { SessionList } from "@/components/SessionList";
import { LED_CHANNEL_NAMES } from "@/lib/types";
import { useCaptureController } from "@/lib/useCaptureController";

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "아직 통신 기록 없음";
  const seconds = Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}초 전 응답`;
  return `${Math.round(seconds / 60)}분 전 응답`;
}

export default function Home() {
  const c = useCaptureController();
  const [labelInput, setLabelInput] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    c.startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (c.state === "idle" || c.state === "capturing") {
      setSavedMessage(null);
      setLabelInput("");
    }
  }, [c.state]);

  const statusLabel = (() => {
    switch (c.state) {
      case "idle":
        return c.connected ? "ESP32 연결됨 (LTE) — 촬영 준비 완료" : "ESP32 응답 대기 중 (LTE로 연결됐는지 확인하세요)";
      case "capturing":
        return c.waitMessage ?? `촬영 중... (${c.shots.length}/${c.totalSteps}장)`;
      case "done":
        return "촬영 완료";
      case "error":
        return "오류가 발생했습니다";
    }
  })();

  const handleSave = async () => {
    if (!labelInput.trim()) return;
    const label = labelInput.trim();
    await c.saveWithLabel(label);
    if (c.uploadStatus === "error") {
      setSavedMessage(
        `"${label}" 라벨로 이 기기에는 저장했지만, Supabase 업로드는 실패했습니다: ${c.uploadError ?? ""}`,
      );
    } else {
      setSavedMessage(`"${label}" 라벨로 사진과 함께 저장하고 Supabase에도 자동 업로드했습니다`);
    }
    setRefreshKey((k) => k + 1);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-5">
      <header className="pt-2 text-center">
        <h1 className="text-xl font-semibold tracking-tight">ColorMatcher</h1>
        <p className="mt-1 text-xs text-white/40">
          ESP32 LED {LED_CHANNEL_NAMES.length}개 (GPIO 14/13/12) · Wi-Fi 촬영
        </p>
      </header>

      <GlassCard>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-white/80">ESP32 연결 상태 (LTE)</h2>
          <button
            onClick={c.connect}
            disabled={c.connecting}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20 disabled:opacity-40"
          >
            {c.connecting ? "확인 중..." : "새로고침"}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${c.connected ? "bg-accentCyan" : "bg-white/30"}`}
          />
          <span className={c.connected ? "text-white/80" : "text-white/40"}>
            {c.connected ? "기기 연결됨" : "기기 응답 없음"} · {formatLastSeen(c.lastSeenAt)}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-white/30">
          ESP32는 로컬 Wi-Fi가 아니라 LTE로 클라우드를 폴링합니다 — IP 입력이 필요 없고,
          같은 네트워크에 있지 않아도 됩니다. 다만 왕복이 평균 5~6초라 명령 하나에도
          시간이 걸립니다.
        </p>
        {c.connectError && <p className="mt-2 text-xs text-danger">{c.connectError}</p>}
      </GlassCard>

      <GlassCard className="!p-0 overflow-hidden">
        <div className="relative aspect-[3/4] w-full bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={c.videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {!c.cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 text-center text-xs text-white/70">
              {c.cameraError ?? "카메라 준비 중..."}
            </div>
          )}
        </div>
        {c.cameras.length > 1 && (
          <div className="border-t border-white/10 p-3">
            <label className="mb-1 block text-[11px] text-white/40">
              카메라 선택 (원하는 후면 카메라가 아니면 여기서 바꿔주세요)
            </label>
            <select
              value={c.activeDeviceId ?? ""}
              onChange={(e) => c.switchCamera(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 outline-none focus:border-accentCyan"
            >
              {c.cameras.map((cam, i) => (
                <option key={cam.deviceId} value={cam.deviceId} className="bg-bg1">
                  {cam.label || `카메라 ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </GlassCard>

      <ProgressDots
        totalSteps={c.totalSteps}
        currentStep={c.state === "capturing" ? c.shots.length : -1}
      />

      <GlassCard>
        <p className="text-center text-sm font-medium">{statusLabel}</p>
        {c.errorMessage && (
          <p className="mt-2 text-center text-xs text-danger">{c.errorMessage}</p>
        )}

        {c.state === "done" && c.lastSession && !c.lastSession.label && (
          <div className="mt-4 flex gap-2">
            <input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="색상 이름 (예: 딸기잼 A)"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-accentCyan"
            />
            <button
              onClick={handleSave}
              disabled={!labelInput.trim() || c.saving}
              className="shrink-0 rounded-lg bg-accentViolet/90 px-3 py-2 text-sm font-medium text-black transition hover:bg-accentViolet disabled:opacity-40"
            >
              {c.saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}

        {savedMessage && (
          <p className="mt-3 text-center text-xs text-accentCyan">{savedMessage}</p>
        )}

        <button
          onClick={c.startCapture}
          disabled={!c.connected || !c.cameraReady || c.state === "capturing"}
          className="pulse-btn mt-4 w-full rounded-xl bg-gradient-to-r from-accentCyan to-accentViolet px-4 py-3 text-sm font-semibold text-black shadow-glow transition disabled:animate-none disabled:opacity-40 disabled:shadow-none"
        >
          {c.state === "capturing"
            ? "촬영 중..."
            : `촬영 시작 (배경 + LED ${LED_CHANNEL_NAMES.length}장)`}
        </button>

        {(c.state === "done" || c.state === "error") && (
          <button
            onClick={c.reset}
            className="mt-2 w-full rounded-xl border border-white/10 px-4 py-2 text-xs text-white/60 transition hover:bg-white/5"
          >
            다시 촬영
          </button>
        )}
      </GlassCard>

      <SessionList refreshKey={refreshKey} />

      <footer className="pb-4 text-center text-[10px] text-white/25">
        이 페이지는 반드시 <strong>HTTPS</strong>로 접속해야 카메라를 쓸 수 있습니다.
        <br />
        docs/ARCHITECTURE.md 참고
      </footer>
    </main>
  );
}
