const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">CANLEARN / PROJECT BASELINE</p>
      <h1>把资料变成可执行的学习路径。</h1>
      <p className="lede">
        Next.js Web 已就位。下一条纵向链路将连接资料上传、MinerU 解析、来源引用和学习任务。
      </p>
      <section aria-labelledby="stack-heading">
        <h2 id="stack-heading">当前服务边界</h2>
        <ul>
          <li>Node.js / TypeScript 负责业务 API 与权威写入</li>
          <li>Python / Temporal 负责可恢复的长任务</li>
          <li>PostgreSQL 保存业务事实，Redis 保存可重建的高速状态</li>
          <li>MinerU 通过隔离的 Adapter 接入</li>
        </ul>
      </section>
      <p className="api">API 基址：{apiUrl}</p>
    </main>
  );
}
