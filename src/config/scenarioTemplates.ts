// src/config/scenarioTemplates.ts

import type { PriceChangeTarget } from "../types/domain";

export interface AutopilotScenarioItem {
    offsetSeconds: number;
    publicNews?: { title: string; body: string; delaySeconds?: number } | null;
    postNews?: { title: string; body: string; delaySeconds?: number } | null;
    insiderNews?: { title: string; body: string; delaySeconds?: number } | null;
    priceChanges?: PriceChangeTarget[] | null;
    breakingVideoId?: string | null;
}

export const getTemplateScenario = (dummyStockId: string): AutopilotScenarioItem[] => [
    {
        offsetSeconds: 0,
        publicNews: { title: "穏やかな朝", body: "市場は静かに開きました。", delaySeconds: 0 },
        priceChanges: []
    },
    {
        offsetSeconds: 60,
        postNews: { title: "好決算の背景", body: "某IT企業の決算が良かったことが後から明らかになりました。", delaySeconds: 180 }
    },
    {
        offsetSeconds: 90,
        publicNews: { title: "好決算発表！", body: "予想を上回る利益でした。", delaySeconds: 0 },
        priceChanges: [
            {
                stockId: dummyStockId,
                branches: [
                    { probability: 80, changePercent: 35, deadlineMinutes: 5 },
                    { probability: 20, changePercent: 8, deadlineMinutes: 5 }
                ]
            }
        ]
    },
    {
        offsetSeconds: 180,
        publicNews: { title: "利確売り発生", body: "高値警戒感から売られています。", delaySeconds: 0 },
        priceChanges: [
            {
                stockId: dummyStockId,
                branches: [{ probability: 100, changePercent: -15, deadlineMinutes: 4 }]
            }
        ]
    }
];
