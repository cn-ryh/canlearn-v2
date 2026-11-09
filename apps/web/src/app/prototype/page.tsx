import type { Metadata } from "next";
import PrototypeApp from "./prototype-app";

export const metadata: Metadata = {
  title: "公共选包与私有资料学习原型 · CanLearn",
  description: "CL-012a 可点击学习旅程原型，使用演示数据展示来源、校验状态与学习证据。",
};

export default function PrototypePage() {
  return <PrototypeApp />;
}
