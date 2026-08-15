import { ewkt, type OrgType } from "../lib/types";

export type DemoAccount = {
  key: "donor" | "startup";
  label: string;
  role: string;
  email: string;
  password: string;
  orgName: string;
  orgType: OrgType;
  nearestStation: string;
  areaLabel: string;
  location: string;
  exactAddress: string;
  contactName: string;
  contactPhone: string;
  accessNote: string;
};

// デモアカウントのパスワードは環境変数で注入する。ローカル開発では
// supabase/seed/00_orgs.sql の既定値にフォールバックし、未設定の本番ビルドでは
// DEMO_LOGIN_ENABLED = false になり即ログインボタンを出さない。
const DEMO_PASSWORD =
  (import.meta.env.VITE_DEMO_PASSWORD ?? "").trim() || (import.meta.env.DEV ? "officerelay" : "");

export const DEMO_LOGIN_ENABLED = DEMO_PASSWORD.length > 0;

export const DEMO_ACCOUNTS: DemoAccount[] = DEMO_LOGIN_ENABLED ? [
  {
    key: "donor",
    label: "NEXTMOVE株式会社",
    role: "譲渡企業 (donor)",
    email: "donor@officerelay.demo",
    password: DEMO_PASSWORD,
    orgName: "NEXTMOVE株式会社",
    orgType: "donor",
    nearestStation: "JR渋谷駅",
    areaLabel: "東京都渋谷区",
    location: ewkt(139.701636, 35.658034),
    exactAddress: "東京都渋谷区渋谷2-1-1 NEXTMOVE ビル 8F",
    contactName: "総務部 田中",
    contactPhone: "03-0000-0001",
    accessNote: "搬出は平日 10:00-17:00、業務用エレベータを使用",
  },
  {
    key: "startup",
    label: "AI Seed株式会社",
    role: "受取スタートアップ (startup)",
    email: "startup@officerelay.demo",
    password: DEMO_PASSWORD,
    orgName: "AI Seed株式会社",
    orgType: "startup",
    nearestStation: "JR五反田駅",
    areaLabel: "東京都品川区",
    location: ewkt(139.723486, 35.626446),
    exactAddress: "東京都品川区西五反田1-2-3 SEED HOUSE 3F",
    contactName: "代表 佐藤",
    contactPhone: "03-0000-0002",
    accessNote: "搬入は 18:00 以降も可。エレベータ幅 90cm",
  },
] : [];
