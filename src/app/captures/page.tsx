"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/GlassCard";

interface LabelSummary {
  label: string;
  sessionCount: number;
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

  useEffect(() => {
    fetch("/api/captures/list")
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
          </p>
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
                  세션 {item.sessionCount}개 · 최근 {formatDate(item.lastCapturedAt)}
                </p>
              </div>
              <a
                href={`/api/captures/export?label=${encodeURIComponent(item.label)}`}
                className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20"
              >
                다운로드
              </a>
            </div>
          </GlassCard>
        ))}
      </div>
    </main>
  );
}
