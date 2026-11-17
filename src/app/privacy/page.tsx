import type { Metadata } from "next";
import { LegalHeader } from "@/features/mobile/legal-header";

export const metadata: Metadata = {
  title: "개인정보처리방침 | Trip Chain",
  description: "Trip Chain이 어떤 정보를 어떻게 다루는지 안내합니다.",
};

const CONTACT = "dosi0zae@gmail.com";
const UPDATED = "2026-11-17";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[40rem] px-5 pb-10 text-[0.9375rem] leading-7 text-foreground">
      <LegalHeader title="개인정보처리방침" />
      <h1 className="mt-6 text-3xl font-extrabold leading-tight" data-legal-title>개인정보처리방침</h1>
      <p className="mt-2 text-sm text-muted">시행일 {UPDATED} · Privacy Policy (English below)</p>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">1. 한눈에 보기</h2>
        <p className="mt-2">
          Trip Chain은 서울 여행 코스를 추천하고 공유하는 서비스입니다. 회원 데이터를 저장하는 자체 서버나 데이터베이스가 없으며,
          좋아요·저장·북마크·댓글·내가 게시한 코스는 모두 이용자의 기기(브라우저 localStorage)에만 저장됩니다. 광고를 싣지 않고,
          개인정보를 판매하지 않습니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">2. 수집하는 정보와 사용 목적</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            <strong>Google 로그인 시</strong>: 이름, 이메일 주소, 프로필 사진(Google 계정의 공개 프로필). 로그인한 계정을 화면에 표시하는 데만
            쓰며, 서버는 Google에 토큰이 유효한지 확인한 뒤 바로 폐기합니다. 서버에 저장하지 않습니다.
          </li>
          <li>
            <strong>코스 추천 요청 시</strong>: 입력한 문장, 선택한 언어, (허용한 경우) 현재 위치 좌표, 북마크한 장소 번호. 코스를 만들기 위해
            서버를 거쳐 Google Gemini API로 전달됩니다. 요청 내용은 코스 생성 후 저장하지 않습니다.
          </li>
          <li>
            <strong>위치 정보</strong>: &quot;내 주변&quot; 기능을 눌렀을 때만 브라우저가 허용을 묻고, 허용한 경우에만 가까운 장소를 찾는 데 씁니다.
          </li>
          <li>
            <strong>이용자 기기에 저장되는 정보</strong>: 좋아요, 저장, 북마크, 댓글, 게시한 코스, 언어 설정, 튜토리얼 완료 여부(localStorage /
            sessionStorage). 브라우저의 사이트 데이터를 지우면 함께 삭제됩니다.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">3. 외부 서비스</h2>
        <p className="mt-2">서비스를 제공하려고 다음 외부 서비스를 이용합니다. 각 서비스는 자체 개인정보 정책을 따릅니다.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Google (로그인, Gemini API) — 이름·이메일·프로필 사진, 추천 요청 문장</li>
          <li>Kakao (지도, 카카오톡 공유, 장소 정보) — 지도를 표시하고 공유 메시지를 만들 때</li>
          <li>Open-Meteo (날씨) — 위치 좌표 없이 서울 고정 좌표로만 조회</li>
          <li>Vercel (호스팅) — 접속 기록(IP 주소, 요청 시각 등 서버 로그)이 서비스 운영 목적으로 일시 보관될 수 있습니다.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">4. 보관과 삭제</h2>
        <p className="mt-2">
          이용자의 기기에 저장된 정보는 브라우저의 사이트 데이터를 삭제하면 지워지고, 프로필 화면에서 로그아웃하면 로그인 정보가 지워집니다.
          Google 계정에 부여된 권한은 Google 계정의 &quot;보안 &gt; 타사 앱 및 서비스&quot;에서 언제든 해제할 수 있습니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">5. 어린이</h2>
        <p className="mt-2">만 14세 미만 어린이를 대상으로 하지 않으며, 어린이의 정보를 의도적으로 수집하지 않습니다.</p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">6. 문의</h2>
        <p className="mt-2">
          개인정보와 관련한 문의·요청은 <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> 로 보내 주세요. 방침이 바뀌면 이
          페이지에 시행일과 함께 게시합니다.
        </p>
      </section>

      <hr className="my-10 border-border" />

      <h2 className="text-2xl font-extrabold">Privacy Policy</h2>
      <p className="mt-2 text-sm text-muted">Effective {UPDATED}</p>
      <p className="mt-4">
        Trip Chain recommends and shares Seoul travel courses. It has no server-side user database: likes, saves, bookmarks, comments and
        the courses you publish are stored only in your own browser (localStorage). We show no ads and do not sell personal data.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong>Google sign-in</strong>: your name, email address and profile picture, used only to show who is signed in. The server asks
          Google whether the token is valid and discards it; nothing is stored on our servers.
        </li>
        <li>
          <strong>Course requests</strong>: the sentence you type, your language, your location (only if you allow it) and your bookmarked place
          ids are sent through our server to the Google Gemini API to build the course. They are not kept afterwards.
        </li>
        <li>
          <strong>Location</strong> is asked for only when you tap the nearby feature, and used only to find close places.
        </li>
        <li>
          <strong>Third parties</strong>: Google (sign-in, Gemini), Kakao (maps, KakaoTalk sharing, place data), Open-Meteo (weather for a fixed
          Seoul point) and Vercel (hosting, which may keep server logs such as IP address and time of request).
        </li>
        <li>
          <strong>Deleting data</strong>: clear the site data in your browser, or sign out in the profile screen. You can revoke Google access in your
          Google Account under Security &gt; Third-party apps &amp; services.
        </li>
        <li>The service is not directed at children under 14.</li>
      </ul>
      <p className="mt-4">
        Contact: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </main>
  );
}
