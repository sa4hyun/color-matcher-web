"use client";

import { CaptureSession } from "./types";

/**
 * 데이터셋 저장소 (IndexedDB).
 *
 * 처음엔 localStorage를 썼는데, 실제 촬영 사진(JPEG Blob)까지 같이 저장하기로
 * 하면서 localStorage(전체 5~10MB 제한)로는 금방 한계가 와서 IndexedDB로
 * 옮겼다 — 용량이 훨씬 크고, Blob을 base64로 안 바꾸고 그대로 저장할 수 있어
 * 더 효율적이다. (이건 Claude 아티팩트가 아니라 사용자의 PC에서 직접
 * npm run dev로 실제 돌리는 앱이라 브라우저 저장소 사용 제약이 적용되지 않는다.)
 *
 * 여러 기기에서 데이터를 공유하거나 서버에 영구 보관하려면, seminar-booking
 * 프로젝트처럼 Supabase(+ Storage)로 옮기는 게 다음 단계로 자연스럽다 —
 * 지금은 범위 밖으로 남겨둔다.
 */

const DB_NAME = "color-matcher-db";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 브라우저는 IndexedDB를 지원하지 않습니다"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSessionToDb(session: CaptureSession): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllSessions(): Promise<CaptureSession[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const sessions = (req.result as CaptureSession[]) ?? [];
      sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(sessions);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSessionFromDb(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
