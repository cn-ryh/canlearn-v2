import type { Metadata } from "next";
import PrototypeApp from "./prototype-app";

export const metadata: Metadata = {
  title: "学习、中断恢复与数据权利原型 · CanLearn",
  description: "CL-012a/b 可点击原型，使用演示数据展示学习证据、计划恢复、异常状态与数据权利。",
};

export default function PrototypePage() {
  return <PrototypeApp />;
}
