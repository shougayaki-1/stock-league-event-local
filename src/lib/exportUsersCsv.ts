import Papa from "papaparse";
import type { User, Stock } from "../types/domain";
import { toExactString } from "./exactNumber";

export const buildUsersCsv = (users: User[], stocks: Stock[]) => {
  const stockNameById = new Map(stocks.map((stock) => [stock.id, stock.name]));
  const stockIds = stocks.map((stock) => stock.id);

  const rows = users.map((user) => {
    const row: Record<string, string> = {
      "ID": user.shortId,
      "ニックネーム": user.nickname || "",
      "コース": user.courseType,
      "状態": user.isFinished ? "確定済" : "行動中",
      "所持金": toExactString(user.points),
    };
    stockIds.forEach((stockId) => {
      const name = stockNameById.get(stockId) ?? stockId;
      row[`所持株数:${name}`] = toExactString(user.inventory?.[stockId]);
    });
    return row;
  });

  return Papa.unparse(rows, {
    columns: [
      "ID",
      "ニックネーム",
      "コース",
      "状態",
      "所持金",
      ...stockIds.map((stockId) => `所持株数:${stockNameById.get(stockId) ?? stockId}`),
    ],
  });
};

export const downloadUsersCsv = (users: User[], stocks: Stock[]) => {
  const csv = buildUsersCsv(users, stocks);
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.download = `users_export_${timestamp}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};
