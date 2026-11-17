import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeader } from "@/features/mobile/legal-header";

export const metadata: Metadata = {
  title: "이용약관 | Trip Chain",
  description: "Trip Chain 서비스 이용 조건을 안내합니다.",
};

const CONTACT = "dosi0zae@gmail.com";
const UPDATED = "2026-11-17";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-[40rem] px-5 pb-10 text-[0.9375rem] leading-7 text-foreground">
      <LegalHeader title="이용약관" />
      <h1 className="mt-6 text-3xl font-extrabold leading-tight" data-legal-title>이용약관</h1>
      <p className="mt-2 text-sm text-muted">시행일 {UPDATED} · Terms of Service (English below)</p>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">1. 서비스</h2>
        <p className="mt-2">
          Trip Chain(이하 &quot;서비스&quot;)은 서울의 장소를 엮어 하루 코스를 추천하고, 이용자가 코스를 만들고 공유하도록 돕는 웹 서비스입니다.
          Google 계정으로 로그인하면 프로필 화면에서 내 계정을 표시합니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">2. 이용 조건</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>서비스는 무료로 제공되며, 사전 안내 후 기능을 바꾸거나 중단할 수 있습니다.</li>
          <li>타인의 권리를 침해하거나 불법·유해한 내용을 코스 제목, 설명, 댓글로 게시해서는 안 됩니다. 그런 내용은 예고 없이 숨기거나 삭제할 수 있습니다.</li>
          <li>서비스를 비정상적인 방법(자동화된 대량 요청 등)으로 사용해 다른 이용자의 이용을 방해해서는 안 됩니다.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">3. 추천과 장소 정보</h2>
        <p className="mt-2">
          추천 코스와 장소 설명, 소요 시간, 동선은 공공 데이터, 지도 서비스, 블로그 언급량, AI 분석을 바탕으로 만든 참고 정보입니다. 영업 시간, 요금,
          휴무, 행사 일정은 바뀔 수 있으니 방문 전에 확인해 주세요. 정보의 정확성과 최신성을 보장하지 않으며, 이를 믿고 한 행동의 결과에 대해
          책임을 지지 않습니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">4. 이용자 콘텐츠</h2>
        <p className="mt-2">
          이용자가 만든 코스와 댓글의 권리는 이용자에게 있습니다. 공개로 게시한 코스는 다른 이용자에게 보이고 공유될 수 있으며, 이를 위해 서비스 안에서
          표시·번역하는 데 동의한 것으로 봅니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">5. 책임의 제한</h2>
        <p className="mt-2">서비스는 있는 그대로 제공되며, 법이 허용하는 범위에서 서비스 이용으로 생긴 손해에 대해 책임을 지지 않습니다.</p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">6. 문의</h2>
        <p className="mt-2">
          <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> · 개인정보 관련 내용은{" "}
          <Link className="underline" href="/privacy">개인정보처리방침</Link>을 참고해 주세요.
        </p>
      </section>

      <hr className="my-10 border-border" />

      <h2 className="text-2xl font-extrabold">Terms of Service</h2>
      <p className="mt-2 text-sm text-muted">Effective {UPDATED}</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Trip Chain is a free web service that links places in Seoul into day courses and lets you make and share them. Signing in with Google shows your account in the profile screen.</li>
        <li>Do not post unlawful, harmful or rights-infringing content in course titles, descriptions or comments; it may be hidden or removed without notice. Do not misuse the service with automated bulk requests.</li>
        <li>Recommendations, place descriptions, durations and routes are reference information built from public data, map services, blog mentions and AI analysis. Opening hours, fees, closures and event dates change; please check before you go. We do not guarantee accuracy.</li>
        <li>You keep the rights to the courses and comments you create. Courses you publish publicly can be seen and shared by others, and may be displayed and translated inside the service.</li>
        <li>The service is provided as is. To the extent the law allows, we are not liable for loss arising from its use.</li>
      </ul>
      <p className="mt-4">
        Contact: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </main>
  );
}
