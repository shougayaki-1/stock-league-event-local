import type { ReactNode } from "react";

export const DEFAULT_INFO_PAGE_MARKDOWN = `「株価にドキリ！」にご参加いただき、ありがとうございました。このイベントは、実際の株式市場の仕組みを楽しく体験しながら学ぶことを目的とした学校祭企画です。

ポイントを使って株を売買し、値動きを予想する体験を通じて、「投資」がどういうものかを少しでも身近に感じてもらえたら嬉しいです。

株価は、会社の業績やニュース、世の中の期待などによって日々変動します。今回のゲームでも、ニュース速報が流れるたびに株価が動いたはずです。これは現実の株式市場でも同じ仕組みです。

このイベントでは、謎解きに挑戦して見事クリアした一部の参加者だけが「インサイダー」として、まだ公開されていない特別な企業ニュースを先に知ることができる仕組みになっていました。

現実の世界では、これは「インサイダー取引」と呼ばれる重大な違法行為にあたります。会社の内部関係者だけが知る未公開の情報をもとに株を売買することは、金融商品取引法によって固く禁じられており、発覚すれば厳しい罰則の対象になります。

今回はあくまでゲームの中の設定・演出としてインサイダー役を用意しましたが、現実の投資の世界では「公平な情報のもとで取引すること」がとても大切なルールだと覚えておいてください。

## 自作で挑戦する、新しい学校祭

この企画で使っているシステムは、学校祭のために自作したものです。取引画面、管理画面、サイネージ、株価の変動、ニュースの演出まで、来場者に体験として届くように一つひとつ作っています。

動画演出にはAIも活用し、BGMも自作しています。人の手で考えた企画に、新しい技術を組み合わせることで、これまでにない学校祭の形に挑戦しています。

最後まで参加してくれてありがとうございました。この体験が、これからの社会科や経済のニュースを見るときの、ちょっとしたきっかけになれば幸いです。`;

type MarkdownContentProps = {
  markdown: string;
  className?: string;
};

const renderInline = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const boldPattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(<strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

export function MarkdownContent({ markdown, className }: MarkdownContentProps) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const key = `list-${blocks.length}`;
    blocks.push(
      <ul key={key} className="list-disc space-y-2 pl-6">
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    const listMatch = trimmed.match(/^[-*・]\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      return;
    }

    flushList();

    if (trimmed.startsWith("### ")) {
      blocks.push(<h3 key={index} className="pt-2 text-lg font-black text-on-surface">{renderInline(trimmed.slice(4))}</h3>);
      return;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push(<h2 key={index} className="pt-3 text-xl font-black text-on-surface md:text-2xl">{renderInline(trimmed.slice(3))}</h2>);
      return;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push(<h1 key={index} className="text-2xl font-black text-on-surface md:text-3xl">{renderInline(trimmed.slice(2))}</h1>);
      return;
    }

    blocks.push(<p key={index}>{renderInline(trimmed)}</p>);
  });

  flushList();

  return <div className={className}>{blocks}</div>;
}
