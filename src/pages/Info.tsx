import { Link } from "react-router-dom";
import { AlertTriangle, BookOpenCheck, ShieldAlert } from "lucide-react";
import { useSystemSettings, useUser } from "../hooks/useFirebase";
import { usePlayerSession } from "../hooks/usePlayerSession";
import { Card, CardContent } from "../components/ui/Card";
import { buttonClassNames } from "../components/ui/buttonStyles";
import { SESSION_STORAGE_KEYS, STORAGE_KEYS } from "../lib/storageKeys";
import { DEFAULT_INFO_PAGE_MARKDOWN, MarkdownContent } from "../components/info/infoPageContent";

export default function Info() {
  const session = usePlayerSession(localStorage.getItem(STORAGE_KEYS.USER_ID));
  const uid = session.status === "authenticated" ? session.uid : null;
  const user = useUser(uid);
  const systemSettings = useSystemSettings();
  const isInsider = user?.courseType === "INSIDER";
  const infoPageMarkdown = systemSettings?.infoPageMarkdown?.trim() || DEFAULT_INFO_PAGE_MARKDOWN;

  return (
    <div className="min-h-dvh bg-surface-variant px-4 py-8 text-on-surface">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Card className={isInsider ? "border-error/40" : "border-primary/30"}>
          <CardContent className="p-6 md:p-8">
            <div className="mb-6 flex items-start gap-3">
              <div className={`rounded-full p-3 ${isInsider ? "bg-error-container text-error" : "bg-primary-container text-primary"}`}>
                {isInsider ? <ShieldAlert size={28} /> : <BookOpenCheck size={28} />}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">株価にドキリ！</p>
                <h1 className="mt-1 text-2xl font-black md:text-3xl">
                  {isInsider ? "コンプライアンス違反を検知" : "この企画の目的について"}
                </h1>
              </div>
            </div>

            {isInsider ? (
              <div className="space-y-5 text-sm font-bold leading-8 text-on-surface-variant md:text-base">
                <p>
                  エージェント {user?.nickname || "Unknown"} は、一般に公開されていない「機密情報」を悪用した形跡が認められました。
                </p>
                <p>
                  今回のイベントでは、謎解きミッションをクリアしたあなたに、他の参加者にはまだ届いていない企業の未公開ニュースが特別に共有されていました。その情報をもとに株を売買していた場合、それは通常の取引とは異なる、著しく有利な立場からの取引だったことになります。
                </p>
                <p>
                  現実の社会では、これを「インサイダー取引」と呼びます。会社の内部関係者だけが知りうる未公開の重要事実をもとに売買を行うことは、金融商品取引法で固く禁じられている重大な違法行為です。発覚した場合は、5年以下の懲役、もしくは500万円以下の罰金という厳しい罰則が科せられます。
                </p>
                <p>
                  今回はゲーム上の設定として「インサイダー」という特別な役割を体験してもらいましたが、これはあくまで学校祭の演出です。現実の投資の世界でこうした行為に手を染めることは絶対にあってはなりません。
                </p>
                <p>
                  謎を解き明かした観察力と行動力は、本物でした。その力を、これからはぜひ正々堂々とした形で活かしてください。ご参加ありがとうございました。
                </p>
              </div>
            ) : (
              <MarkdownContent
                markdown={infoPageMarkdown}
                className="space-y-5 text-sm font-bold leading-8 text-on-surface-variant md:text-base"
              />
            )}

            <div className="mt-8 flex flex-col gap-3 rounded-lg border border-outline-variant bg-surface-container p-4 text-sm font-bold text-on-surface-variant">
              <div className="flex gap-2">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
                <p>こちらから端末でも取引をしていただけます。しばらくは株価が動きますので、お楽しみください。</p>
              </div>
              <Link
                to="/login?from=info"
                onClick={() => sessionStorage.setItem(SESSION_STORAGE_KEYS.SKIP_INFO_PAGE, "1")}
                className={buttonClassNames({ variant: "outline", className: "self-start" })}
              >
                取引画面を開く
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
