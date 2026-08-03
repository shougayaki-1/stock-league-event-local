import { useRef, useState } from "react";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { toBlob } from "html-to-image";
import { ImagePlus, Sparkles } from "lucide-react";
import { db } from "../../lib/firebase";
import { safeImageStorageFileName, uploadCloudImage } from "../../lib/cloudImages";
import { IMAGE_LIBRARY_COLLECTION } from "../../types/imageLibrary";
import { IMAGE_TEMPLATES } from "../../components/admin/imageTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { useDialog } from "../../contexts/DialogContext";

export default function ImageTemplateStudio() {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const { alert } = useDialog();

  const handleGenerate = async (templateId: string) => {
    const template = IMAGE_TEMPLATES.find(item => item.id === templateId);
    const node = refs.current[templateId];
    if (!template || !node) return;

    setGeneratingId(templateId);
    setProgress(prev => ({ ...prev, [templateId]: 0 }));
    try {
      const blob = await toBlob(node, {
        cacheBust: true,
        pixelRatio: 1,
        width: 1920,
        height: 1080,
        canvasWidth: 1920,
        canvasHeight: 1080,
        backgroundColor: "#ffffff",
      });
      if (!blob) throw new Error("画像生成に失敗しました。");

      const existing = await getDocs(query(collection(db, IMAGE_LIBRARY_COLLECTION), where("templateId", "==", template.id)));
      const imageRef = existing.docs[0]?.ref || doc(collection(db, IMAGE_LIBRARY_COLLECTION));
      const fileName = `${template.id.toLowerCase()}.png`;
      const storagePath = `signage/image-library/${imageRef.id}-${Date.now()}-${safeImageStorageFileName(fileName)}`;
      const asset = await uploadCloudImage(blob, storagePath, fileName, nextProgress => setProgress(prev => ({ ...prev, [templateId]: nextProgress })));

      await setDoc(imageRef, {
        name: template.name,
        imageAsset: asset,
        source: "template",
        templateId: template.id,
        createdAt: existing.docs[0]?.data().createdAt || Date.now(),
        updatedAt: Date.now(),
      }, { merge: true });

      await alert({ title: "画像を生成しました", message: `「${template.name}」を画像ライブラリに登録しました。`, variant: "success" });
    } catch (error) {
      console.error(error);
      await alert({ title: "生成に失敗", message: error instanceof Error ? error.message : "テンプレート画像を生成できませんでした。", variant: "danger" });
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
          <Sparkles className="text-amber-500" /> 画像テンプレートスタジオ
        </h1>
        <p className="mt-1 text-sm font-bold text-on-surface-variant">
          サイネージ用テンプレートをPNG化し、画像ライブラリに登録します。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {IMAGE_TEMPLATES.map(template => {
          const TemplateComponent = template.Component;
          const isGenerating = generatingId === template.id;
          return (
            <Card key={template.id} className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base">{template.name}</CardTitle>
                <Button onClick={() => handleGenerate(template.id)} disabled={!!generatingId} size="sm" className="shrink-0 gap-2">
                  <ImagePlus size={16} />
                  {isGenerating ? `生成中 ${progress[template.id] || 0}%` : "画像を生成して追加"}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-lg border border-outline-variant bg-slate-950">
                  <div className="origin-top-left scale-[0.36] sm:scale-[0.42] lg:scale-[0.5] xl:scale-[0.36]" style={{ width: 1920, height: 1080, marginBottom: -691 }}>
                    <div ref={node => { refs.current[template.id] = node; }}>
                      <TemplateComponent />
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-variant">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress[template.id] || 0}%` }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
