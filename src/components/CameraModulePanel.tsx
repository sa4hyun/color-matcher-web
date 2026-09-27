"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlassCard } from "./GlassCard";
import { LED_CHANNEL_HEX, LED_CHANNEL_LABELS_KO, LED_CHANNEL_NAMES } from "@/lib/types";

/**
 * 카메라 모듈 촬영 화면.
 * 버튼 한 번 → /api/camera/request (촬영 요청) → LTE 보드가 가져가서 LED 6단계 촬영 + 업로드
 * → 이 화면이 /api/camera/session 을 2초마다 확인하며 사진을 하나씩 보여줌
 * → 끝나면 /api/camera/import 로 분석 데이터(captures)에 자동 저장.
 * 폰 카메라는 안 쓴다 (사진은 카메라 보드가 찍고 LTE로 올림).
 */

type CamStatus = "pending" | "running" | "done" | "error";

interface CamShot {
  stepIndex: number;
  r: number;
  g: number;
  b: number;
  pdMv: number | null;
  jpegBytes: number;
}

interface CamSessionInfo {
  id: number;
  label: string;
  status: CamStatus;
  message: string | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

const TOTAL_STEPS = LED_CHANNEL_NAMES.length + 1;
const STEP_LABELS = ["배경", ...LED_CHANNEL_LABELS_KO];
const STEP_COLORS = ["#94A3B8", ...LED_CHANNEL_NAMES.map((n) => LED_CHANNEL_HEX[n])];
const POLL_MS = 2000;
const PICKUP_WARN_MS = 25000; // 이 시간이 지나도 보드가 요청을 안 가져가면 안내

export function CameraModulePanel({
  connected,
  lastSeenText,
  onSaved,
}: {
  connected: boolean;
  lastSeenText: string;
  onSaved?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [session, setSession] = useState<CamSessionInfo | null>(null);
  const [shots, setShots] = useState<CamShot[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importState, setImportState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const importStarted = useRef(false);

  const saveToAnalysis = useCallback(
    async (id: number) => {
      setImportState("saving");
      setImportMessage(null);
      try {
        const res = await fetch("/api/camera/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setImportState("error");
          setImportMessage(data.error ?? (data.errors ?? []).join("; ") ?? `HTTP ${res.status}`);
          return;
        }
        setImportState("done");
        setImportMessage(`"${data.label}" 이름으로 분석 데이터에 ${data.imported}장 저장했습니다`);
        onSaved?.();
      } catch (e) {
        setImportState("error");
        setImportMessage(e instanceof Error ? e.message : String(e));
      }
    },
    [onSaved],
  );

  // 진행 상황 폴링
  useEffect(() => {
    if (sessionId === null) return;
    let stopped = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/camera/session?id=${sessionId}`, { cache: "no-store" });
        const data = await res.json();
        if (stopped) return;
        if (!data.ok) {
          setErrorMessage(data.error ?? "진행 상황을 불러오지 못했습니다");
          return;
        }
        setSession(data.session);
        setShots(data.shots);
        if (data.importedCount > 0 && !importStarted.current) {
          importStarted.current = true;
          setImportState("done");
          setImportMessage("이미 분석 데이터에 저장된 세션입니다");
        }
        // 촬영이 끝나면 자동으로 분석 데이터에 저장
        if (data.session.status === "done" && !importStarted.current) {
          importStarted.current = true;
          saveToAnalysis(sessionId);
        }
      } catch (e) {
        if (!stopped) setErrorMessage(e instanceof Error ? e.message : String(e));
      }
    };

    tick();
    const id = setInterval(() => {
      setNow(Date.now());
      if (session?.status === "done" || session?.status === "error") return;
      tick();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId, session?.status, saveToAnalysis]);

  const start = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setRequesting(true);
    setErrorMessage(null);
    setImportState("idle");
    setImportMessage(null);
    importStarted.current = false;
    setSession(null);
    setShots([]);
    try {
      const res = await fetch("/api/camera/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      const data = await res.json();
      if (!data.ok) {
        // 이미 진행 중인 촬영이 있으면 그 세션을 이어서 보여준다
        if (res.status === 409 && data.sessionId) {
          setSessionId(data.sessionId);
          setErrorMessage(data.error);
        } else {
          setErrorMessage(data.error ?? "촬영 요청에 실패했습니다");
        }
        return;
      }
      setSessionId(data.sessionId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRequesting(false);
    }
  };

  const reset = () => {
    setSessionId(null);
    setSession(null);
    setShots([]);
    setErrorMessage(null);
    setImportState("idle");
    setImportMessage(null);
    importStarted.current = false;
  };

  const busy = session?.status === "pending" || session?.status === "running";
  const waitedMs = session ? now - new Date(session.requestedAt).getTime() : 0;

  const statusText = (() => {
    if (!session) return requesting ? "촬영 요청 보내는 중..." : null;
    switch (session.status) {
      case "pending":
        return waitedMs > PICKUP_WARN_MS
          ? "보드가 아직 요청을 안 가져갔어요 — LTE 보드 전원과 LTE 연결을 확인하세요"
          : "보드가 요청을 가져가길 기다리는 중... (몇 초 걸려요)";
      case "running":
        return shots.length === 0
          ? "LED를 순서대로 켜면서 촬영 중... (약 20초)"
          : `사진 업로드 중... (${shots.length}/${TOTAL_STEPS}장)`;
      case "done":
        return `촬영 완료 — ${session.message ?? ""}`;
      case "error":
        return `촬영 실패 — ${session.message ?? "알 수 없는 오류"}`;
    }
  })();

  return (
    <>
      <GlassCard>
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-accentCyan" : "bg-white/30"}`} />
          <span className={connected ? "text-white/80" : "text-white/40"}>
            LTE 보드 {connected ? "연결됨" : "응답 없음"} · {lastSeenText}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-white/30">
          사진은 폰이 아니라 카메라 모듈이 찍습니다. LED 노출은 보드에 LED별로 고정돼 있어요.
        </p>
      </GlassCard>

      <GlassCard>
        <label className="mb-1 block text-[11px] text-white/40">시료 이름 (라벨)</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy || requesting}
          placeholder="예: 딸기잼 A"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-accentCyan disabled:opacity-50"
        />
        <button
          onClick={start}
          disabled={!label.trim() || busy || requesting || !connected}
          className="pulse-btn mt-3 w-full rounded-xl bg-gradient-to-r from-accentCyan to-accentViolet px-4 py-3 text-sm font-semibold text-black shadow-glow transition disabled:animate-none disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? "촬영 중..." : `카메라 모듈로 촬영 (배경 + LED ${LED_CHANNEL_NAMES.length}장)`}
        </button>
        {!connected && (
          <p className="mt-2 text-center text-[11px] text-white/40">LTE 보드가 응답해야 촬영할 수 있어요</p>
        )}

        {statusText && <p className="mt-3 text-center text-sm font-medium">{statusText}</p>}
        {errorMessage && <p className="mt-2 text-center text-xs text-danger">{errorMessage}</p>}

        {importState === "saving" && (
          <p className="mt-2 text-center text-xs text-white/60">분석 데이터에 저장하는 중...</p>
        )}
        {importMessage && (
          <p className={`mt-2 text-center text-xs ${importState === "error" ? "text-danger" : "text-accentCyan"}`}>
            {importMessage}
          </p>
        )}
        {session?.status === "error" && shots.length > 0 && importState !== "done" && (
          <button
            onClick={() => sessionId !== null && saveToAnalysis(sessionId)}
            className="mt-2 w-full rounded-xl border border-white/10 px-4 py-2 text-xs text-white/70 transition hover:bg-white/5"
          >
            받은 사진 {shots.length}장만이라도 분석 데이터에 저장
          </button>
        )}
        {importState === "error" && session?.status === "done" && (
          <button
            onClick={() => sessionId !== null && saveToAnalysis(sessionId)}
            className="mt-2 w-full rounded-xl border border-white/10 px-4 py-2 text-xs text-white/70 transition hover:bg-white/5"
          >
            분석 데이터 저장 다시 시도
          </button>
        )}
        {(session?.status === "done" || session?.status === "error") && (
          <button
            onClick={reset}
            className="mt-2 w-full rounded-xl border border-white/10 px-4 py-2 text-xs text-white/60 transition hover:bg-white/5"
          >
            새로 촬영
          </button>
        )}
      </GlassCard>

      {sessionId !== null && (
        <GlassCard>
          <p className="mb-3 text-xs text-white/50">
            세션 {sessionId}
            {session?.label ? ` · ${session.label}` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
              const shot = shots.find((s) => s.stepIndex === i);
              return (
                <div key={i} className="overflow-hidden rounded-lg bg-white/5">
                  <div className="aspect-[4/3] w-full bg-black">
                    {shot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/camera/shot?session=${sessionId}&step=${i}&v=${shot.jpegBytes}`}
                        alt={STEP_LABELS[i]}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] text-white/25">대기 중</div>
                    )}
                  </div>
                  <div className="p-2 text-[11px] leading-5">
                    <div className="flex items-center gap-1.5 font-medium text-white/85">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STEP_COLORS[i] }} />
                      {i}. {STEP_LABELS[i]}
                    </div>
                    {shot && (
                      <>
                        <div className="text-white/60">
                          R {shot.r.toFixed(1)} · G {shot.g.toFixed(1)} · B {shot.b.toFixed(1)}
                        </div>
                        <div className="text-white/40">
                          포토다이오드 {shot.pdMv === null ? "-" : `${shot.pdMv.toFixed(1)} mV`}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {importState === "done" && (
            <Link
              href="/captures"
              className="mt-3 block text-center text-xs text-white/50 underline underline-offset-2 hover:text-white/80"
            >
              분석 데이터에서 보기 / 다운로드 →
            </Link>
          )}
        </GlassCard>
      )}
    </>
  );
}
