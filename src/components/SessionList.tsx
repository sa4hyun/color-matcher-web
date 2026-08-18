"use client";

import { useEffect, useState } from "react";
import { CaptureSession } from "@/lib/types";
import { downloadCsv, downloadSessionImagesZip } from "@/lib/dataset";
import { deleteSessionFromDb, loadAllSessions } from "@/lib/db";
import { GlassCard } from "./GlassCard";

/** shot.imageBlob들을 미리보기용 object URL로 변환하고, 언마운트 시 정리한다. */
function useThumbnails(session: CaptureSession): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const sorted = [...session.shots].sort((a, b) => a.stepIndex - b.stepIndex);
    const created = sorted
      .filter((s) => s.imageBlob)
      .map((s) => URL.createObjectURL(s.imageBlob as Blob));
    setUrls(created);
    return () => {
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  return urls;
}

function SessionRow({
  session,
  onDeleted,
}: {
  session: CaptureSession;
  onDeleted: (id: string) => void;
}) {
  const thumbnails = useThumbnails(session);
  const [busy, setBusy] = useState(false);

  return (
    <li className="rounded-lg bg-white/5 px-3 py-2 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-white/90">{session.label || "(라벨 없음)"}</div>
          <div className="text-white/40">
            {new Date(session.createdAt).toLocaleString("ko-KR")}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await downloadSessionImagesZip(session);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || thumbnails.length === 0}
            className="text-white/50 transition hover:text-accentCyan disabled:opacity-30"
          >
            사진 다운로드
          </button>
          <button
            onClick={async () => {
              await deleteSessionFromDb(session.id);
              onDeleted(session.id);
            }}
            className="text-white/40 transition hover:text-danger"
            aria-label="삭제"
          >
            삭제
          </button>
        </div>
      </div>
      {thumbnails.length > 0 && (
        <div className="mt-2 flex gap-1.5">
          {thumbnails.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt={`촬영 ${i}`}
              className="h-12 w-12 rounded-md object-cover"
            />
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * 저장된 세션 목록(사진 썸네일 포함) + CSV/사진 내보내기.
 * refreshKey가 바뀔 때마다 IndexedDB를 다시 읽는다 (저장 직후 갱신용).
 */
export function SessionList({ refreshKey }: { refreshKey: number }) {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAllSessions()
      .then((s) => {
        if (!cancelled) setSessions(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleDeleted = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-white/80">
          저장된 데이터셋 ({sessions.length}개)
        </h2>
        <button
          onClick={() => downloadCsv(sessions)}
          disabled={sessions.length === 0}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/20 disabled:opacity-40"
        >
          CSV로 내보내기
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-white/40">불러오는 중...</p>
      ) : sessions.length === 0 ? (
        <p className="mt-3 text-xs text-white/40">아직 저장된 촬영이 없습니다.</p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {[...sessions].reverse().map((s) => (
            <SessionRow key={s.id} session={s} onDeleted={handleDeleted} />
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
