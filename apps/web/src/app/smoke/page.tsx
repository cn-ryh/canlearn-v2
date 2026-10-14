import { notFound } from "next/navigation";
import { SmokePanel } from "./smoke-panel";

export const dynamic = "force-dynamic";

export default function SmokePage() {
  if (process.env.CANLEARN_SMOKE_ENABLED !== "true") notFound();
  return (
    <main className="smoke-page">
      <p className="eyebrow">CANLEARN / CL-013a</p>
      <h1>合成任务验证</h1>
      <p className="lede">
        使用固定的原创三页夹具，验证提交、查询、取消与重启恢复。处理结果为模拟页状态。
      </p>
      <SmokePanel />
    </main>
  );
}
