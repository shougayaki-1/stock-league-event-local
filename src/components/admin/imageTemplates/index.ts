import type { ComponentType } from "react";
import StockPredictionTemplate from "./StockPredictionTemplate";
import OrderMatTemplate from "./OrderMatTemplate";

export interface ImageTemplate {
  id: string;
  name: string;
  Component: ComponentType;
}

export const IMAGE_TEMPLATES: ImageTemplate[] = [
  { id: "STOCK_PREDICTION", name: "ニュース予想販促", Component: StockPredictionTemplate },
  { id: "ORDER_MAT", name: "注文台紙サンプル", Component: OrderMatTemplate },
];
