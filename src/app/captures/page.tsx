"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/GlassCard";
import { LED_CHANNEL_LABELS_KO } from "@/lib/types";

const STEP_LABELS = ["배경", ...LED_CHANNEL_LABELS_KO];

interface ShotDetail {
  stepIndex: number;
  r: number;
  g: number;
  b: number;
  pdMv: number | null;
}

interface SessionDetail {
  sessionId: string;
  source: string;
  createdAt: string;
  shots: ShotDetail[];
}

/** 라벨 하나를 펼쳤을 때: 세션별로 사진 6장의 RGB와 포토다이오드 값을 표로 보여준다. */
function LabelDetail({ label }: { label: string }) {
  const [sessions, setSessions] = useState<SessionDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/captures/sessions?label=${encodeURIComponent(label)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => (data.ok ? setSessions(data.sessions) : setError(data.error ?? "불러오지 못했습니다")))
      .catch((e) => setError(String(e)));
  }, [label]);

  if (error) return <p className="mt-3 text-[11px] text-danger">{error}</p>;
  if (!sessions) return <p className="mt-3 text-[11px] text-white/40">불러오는 중...</p>;

  return (
    <div className="mt-3 flex flex-col gap-3">
      {sessions.map((s) => (
        <div key={s.sessionId} className="rounded-lg bg-white/5 p-2">
          <p className="mb-1 text-[11px] text-white/50">
            {s.source === "camera" ? "카메라 모듈" : "폰"} · {s.sessionId} · {formatDate(s.createdAt)}
          </p>
          <table className="w-full text-[11px] tabular-nums">
            <thead className="text-white/40">
              <tr>
                <th className="text-left font-normal">단계</th>
                <th className="text-right font-normal">R</th>
                <th className="text-right font-normal">G</th>
                <th className="text-right font-normal">B</th>
                <th className="text-right font-normal">PD (mV)</th>
              </tr>
            </thead>
            <tbody className="text-white/80">
              {s.shots.map((shot) => (
                <tr key={shot.stepIndex}>
                  <td>{STEP_LABELS[shot.stepIndex] ?? `step${shot.stepIndex}`}</td>
                  <td className="text-right">{shot.r.toFixed(1)}</td>
                  <td className="text-right">{shot.g.toFixed(1)}</td>
                  <td className="text-right">{shot.b.toFixed(1)}</td>
                  <td className="text-right">{shot.pdMv === null ? "-" : shot.pdMv.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

interface LabelSummary {
  label: string;
  sessionCount: number;
  cameraSessionCount?: number;
  lastCapturedAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Supabase에 이미 올라간 촬영 데이터를 라벨(이름)별로 훑어보고, 한 번에
 * zip으로 내려받는 화면. Storage 대시보드에서 사진 파일을 하나씩 열어
 * 확인하는 게 너무 번거롭다는 요청으로 추가했다.
 * 실제 다운로드는 /api/captures/export가 zip을 만들어 스트리밍하고,
 * 여기 화면은 단순히 <a href> 링크로 브라우저 기본 다운로드를 트리거한다.
 */
export default function CapturesPage() {
  const [labels, setLabels] = useState<LabelSummary[] | null>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [importNote, setImportNote] = useState<string | null>(null);
  const [openLabel, setOpenLabel] = useState<string | null>(null);

  useEffect(() => {
    const loadList = () =>
      fetch("/api/captures/list", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!data.ok) {
            setErrorMessage(data.error ?? "목록을 불러오지 못했습니다");
            return;
          }
          setLabels(data.labels);
          setTotalSessions(data.totalSessions ?? 0);
        })
        .catch((err) => setErrorMessage(String(err)));

    // 시리얼 's'로 찍었거나 촬영 중 앱을 닫아서 아직 분석 데이터로 안 옮겨진
    // 카메라 모듈 세션을 먼저 가져온 뒤 목록을 불러온다 (남은 게 있으면 몇 번 반복).
    const importPending = async () => {
      let total = 0;
      for (let i = 0; i < 10; i++) {
        try {
          const res = await fetch("/api/camera/import-pending", { method: "POST" });
          const data = await res.json();
          total += (data.imported ?? []).length;
          if (data.errors?.length) setImportNote(`가져오기 일부 실패: ${data.errors.join("; ")}`);
          if (!data.remaining) break;
        } catch {
          break;
        }
      }
      if (total > 0) setImportNote((prev) => prev ?? `빠져 있던 카메라 모듈 세션 ${total}개를 분석 데이터로 가져왔습니다`);
    };

    importPending().finally(loadList);
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-5">
      <header className="pt-2">
        <Link href="/" className="text-xs text-white/40 hover:text-white/70">
          ← 촬영 화면으로
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">저장된 촬영 데이터</h1>
        <p className="mt-1 text-xs text-white/40">
          Supabase에 업로드된 세션을 이름(라벨)별로 묶어서 zip으로 한 번에 내려받습니다.
        </p>
      </header>

      {errorMessage && (
        <GlassCard>
          <p className="text-xs text-danger">{errorMessage}</p>
        </GlassCard>
      )}

      {labels && labels.length > 0 && (
        <GlassCard>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white/80">
              전체 {labels.length}개 라벨 · {totalSessions}개 세션
            </p>
            <a
              href="/api/captures/export"
              className="rounded-lg bg-accentCyan/90 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-accentCyan"
            >
              전체 다운로드 (zip)
            </a>
          </div>
          <p className="mt-2 text-[11px] text-white/30">
            전체 다운로드는 라벨별 폴더로 나뉘고, 각 폴더 안에 dataset.csv(RGB/fingerprint 요약)도 같이 들어갑니다.
            CSV 맨 뒤에 촬영 방식(source: phone/camera)과 단계별 포토다이오드 값(bg_pd_mv, ch0_pd_mv~)이 붙어 있습니다.
          </p>
        </GlassCard>
      )}

      {importNote && (
        <GlassCard>
          <p className="text-xs text-accentCyan">{importNote}</p>
        </GlassCard>
      )}

      {labels === null && !errorMessage && (
        <GlassCard>
          <p className="text-center text-xs text-white/40">불러오는 중...</p>
        </GlassCard>
      )}

      {labels && labels.length === 0 && (
        <GlassCard>
          <p className="text-center text-xs text-white/40">아직 업로드된 촬영 데이터가 없습니다</p>
        </GlassCard>
      )}

      <div className="flex flex-col gap-2">
        {labels?.map((item) => (
          <GlassCard key={item.label} className="!p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/90">{item.label}</p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  세션 {item.sessionCount}개
                  {item.cameraSessionCount ? ` (폰 ${item.sessionCount - item.cameraSessionCount} · 카메라 모듈 ${item.cameraSessionCount})` : ""} · 최근{" "}
                  {formatDate(item.lastCapturedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => setOpenLabel(openLabel === item.label ? null : item.label)}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20"
                >
                  {openLabel === item.label ? "접기" : "값 보기"}
                </button>
                <a
                  href={`/api/captures/export?label=${encodeURIComponent(item.label)}`}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20"
                >
                  다운로드
                </a>
              </div>
            </div>
            {openLabel === item.label && <LabelDetail label={item.label} />}
          </GlassCard>
        ))}
      </div>
    </main>
  );
}
