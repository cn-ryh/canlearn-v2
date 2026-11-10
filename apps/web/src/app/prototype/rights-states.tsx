"use client";

import { useState } from "react";
import { StatusTag } from "./prototype-shared";

type RightTab = "export" | "delete";
type ExportStage = "idle" | "preparing" | "ready" | "failed";
type DeleteStage = "idle" | "revoking" | "cleaning" | "deleted";

export default function RightsStates() {
  const [tab, setTab] = useState<RightTab>("export");
  const [exportStage, setExportStage] = useState<ExportStage>("idle");
  const [deleteStage, setDeleteStage] = useState<DeleteStage>("idle");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const deleted = deleteStage === "deleted";

  return (
    <section className="journey-section" aria-labelledby="rights-heading">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">03 / YOUR DATA, YOUR CHOICE</p>
          <h2 id="rights-heading">导出与删除，都有明确进度</h2>
        </div>
        <p>操作仅针对当前私有空间。导出保留来源版本；删除先撤销访问，再清理派生资产。</p>
      </div>
      <fieldset className="rights-tabs" aria-label="选择数据权利操作">
        <button
          type="button"
          className={tab === "export" ? "selected" : ""}
          onClick={() => setTab("export")}
          aria-pressed={tab === "export"}
        >
          导出学习记录
        </button>
        <button
          type="button"
          className={tab === "delete" ? "selected" : ""}
          onClick={() => setTab("delete")}
          aria-pressed={tab === "delete"}
        >
          删除私有资料
        </button>
      </fieldset>

      {tab === "export" ? (
        <section className="panel rights-panel" aria-labelledby="export-title">
          <div className="panel-heading">
            <div>
              <h3 id="export-title">导出我的学习记录</h3>
              <p>仅包含当前空间有权导出的 mock 数据</p>
            </div>
            <StatusTag
              tone={exportStage === "failed" ? "red" : exportStage === "ready" ? "green" : "blue"}
            >
              {exportStage === "idle"
                ? "待开始"
                : exportStage === "preparing"
                  ? "准备中"
                  : exportStage === "ready"
                    ? "可下载"
                    : "导出失败"}
            </StatusTag>
          </div>
          <div className="export-scope">
            <span>包含</span>
            <strong>真实作答、退出测结果、来源版本与计划变更记录</strong>
            <p>不包含其他空间内容，不把“浏览讲解”包装成掌握证据。</p>
          </div>
          {exportStage === "preparing" && (
            <div className="rights-progress" role="status">
              <div>
                <strong>正在整理导出包</strong>
                <span>2 / 3 · 正在写入来源版本</span>
              </div>
              <div className="progress-track">
                <span style={{ width: "66%" }} />
              </div>
              <p>准备期间可离开；原型不会创建真实文件。</p>
            </div>
          )}
          {exportStage === "ready" && (
            <div className="state-alert success" role="status">
              <strong>演示导出包已准备</strong>
              <p>canlearn-demo-export.json · 3 条学习证据 · 2 个计划版本。链接仅在当前空间有效。</p>
              <button type="button" className="text-button" onClick={() => setExportStage("idle")}>
                收起演示回执
              </button>
            </div>
          )}
          {exportStage === "failed" && (
            <div className="state-alert error" role="alert">
              <strong>导出包生成失败</strong>
              <p>影响范围：本次导出请求；原学习记录未改变，也没有生成不完整文件。</p>
              <button
                type="button"
                className="text-button"
                onClick={() => setExportStage("preparing")}
              >
                重试导出 →
              </button>
            </div>
          )}
          <div className="state-actions">
            <button
              type="button"
              className="primary-button"
              disabled={exportStage === "preparing"}
              onClick={() => setExportStage("preparing")}
            >
              开始准备导出 →
            </button>
            {exportStage === "preparing" && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setExportStage("ready")}
              >
                演示导出完成
              </button>
            )}
            <button type="button" className="text-button" onClick={() => setExportStage("failed")}>
              演示失败状态
            </button>
          </div>
        </section>
      ) : deleted ? (
        <section className="panel deletion-receipt" aria-labelledby="deleted-title">
          <span className="receipt-mark" aria-hidden="true">
            ✓
          </span>
          <StatusTag tone="green">删除完成</StatusTag>
          <h3 id="deleted-title">私有资料及其派生内容已删除</h3>
          <p>
            访问已撤销，新任务已停止；在线原件、讲解、练习和缓存均已清理。备份将在 7
            天保留期结束后清除，期间不可检索或引用。
          </p>
          <dl>
            <div>
              <dt>操作回执</dt>
              <dd>#DEMO-DEL-018</dd>
            </div>
            <div>
              <dt>完成时间</dt>
              <dd>2026-10-03 14:32（演示）</dd>
            </div>
            <div>
              <dt>备份清理截止</dt>
              <dd>2026-10-10</dd>
            </div>
          </dl>
          <div className="immutable-note">
            此页面不再展示文件名、章节、缓存条目或任何私有内容。晚到结果会被丢弃。
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setDeleteStage("idle");
              setDeleteConfirmed(false);
            }}
          >
            重置删除演示
          </button>
        </section>
      ) : (
        <section className="panel rights-panel" aria-labelledby="delete-title">
          <div className="panel-heading">
            <div>
              <h3 id="delete-title">删除当前私有资料</h3>
              <p>cell-biology-ch3-demo.pdf · v1 · 仅当前空间</p>
            </div>
            <StatusTag tone={deleteStage === "idle" ? "red" : "amber"}>
              {deleteStage === "idle"
                ? "等待确认"
                : deleteStage === "revoking"
                  ? "撤销访问中"
                  : "清理派生资产"}
            </StatusTag>
          </div>
          <div className="delete-warning">
            <strong>将删除原件、解析结果、讲解与练习缓存</strong>
            <p>
              已完成学习证据仅保留不含私有正文的必要审计记录。取消或删除后的晚到结果不会恢复资料。
            </p>
          </div>
          {deleteStage === "idle" && (
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(event) => setDeleteConfirmed(event.target.checked)}
              />
              我了解删除后不能再检索或引用此资料
            </label>
          )}
          {deleteStage === "revoking" && (
            <div className="rights-progress" role="status">
              <div>
                <strong>第 1 / 2 步 · 撤销访问与停止新任务</strong>
                <span>阻止检索、引用及新处理请求</span>
              </div>
              <div className="progress-track">
                <span style={{ width: "35%" }} />
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteStage("cleaning")}
              >
                演示进入清理阶段
              </button>
            </div>
          )}
          {deleteStage === "cleaning" && (
            <div className="rights-progress" role="status">
              <div>
                <strong>第 2 / 2 步 · 清理在线派生资产</strong>
                <span>3 / 4 类资产已清理；正在清除缓存</span>
              </div>
              <div className="progress-track">
                <span style={{ width: "82%" }} />
              </div>
              <p>备份进入 7 天清理等待期，不作为可访问副本。</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteStage("deleted")}
              >
                演示删除完成
              </button>
            </div>
          )}
          {deleteStage === "idle" && (
            <div className="state-actions">
              <button
                type="button"
                className="danger-button"
                disabled={!deleteConfirmed}
                onClick={() => setDeleteStage("revoking")}
              >
                撤销访问并开始删除
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteConfirmed(false)}
              >
                取消
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
