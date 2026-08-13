"use client";

import { Folder, FolderOpen } from "lucide-react";

import { File, Folder as TreeFolder, Tree } from "@/components/magicui/file-tree";
import { useT } from "@/lib/i18n";
import type { ViewId } from "@/lib/store";

export type NavItem = {
  id: ViewId;
  label: string;
  ico: string;
  badge?: string;
  admin?: boolean;
};

export type NavGroup = {
  id: string;
  group: string;
  items: NavItem[];
};

const SECTION_EMOJI: Record<string, string> = {
  monitor: "🖥️",
  act: "🎬",
};

function sectionIcon(id: string) {
  const emoji = SECTION_EMOJI[id];
  if (emoji) return <span className="side-tree-folder-emoji">{emoji}</span>;
  return null;
}

/**
 * Magic UI File-Tree sidebar: each section is a folder; views are leaves.
 * Expand/collapse per section; leaf click drives dashboard `view`.
 */
export default function DashboardSideNav({
  groups,
  view,
  onSelect,
  collapsed,
}: {
  groups: NavGroup[];
  view: ViewId;
  onSelect: (id: ViewId) => void;
  collapsed?: boolean;
}) {
  const { t } = useT();

  const expanded = groups.map((g) => g.id);

  if (collapsed) {
    // icon rail — flat list of visible leaves (no tree chrome)
    return (
      <div className="side-tree-rail">
        {groups.flatMap((g) =>
          g.items.map((it) => (
            <button
              key={it.id}
              type="button"
              className={`nav${view === it.id ? " active" : ""}${it.badge ? " has-badge" : ""}`}
              onClick={() => onSelect(it.id)}
              title={t(it.label)}
            >
              <span className="ico">{it.ico}</span>
            </button>
          )),
        )}
      </div>
    );
  }

  return (
    <Tree
      className="side-tree"
      selectedId={view}
      onSelect={(id) => {
        // ignore folder ids
        if (groups.some((g) => g.id === id)) return;
        onSelect(id as ViewId);
      }}
      initialExpandedItems={expanded}
      sort="none"
      indicator
      openIcon={<FolderOpen className="side-tree-folder-ico" />}
      closeIcon={<Folder className="side-tree-folder-ico" />}
    >
      {groups.map((g) => {
        const emoji = sectionIcon(g.id);
        return (
          <TreeFolder
            key={g.id}
            value={g.id}
            element={t(g.group)}
            className="side-tree-folder"
            openIcon={emoji ?? undefined}
            closeIcon={emoji ?? undefined}
          >
            {g.items.map((it) => (
              <File
                key={it.id}
                value={it.id}
                fileIcon={<span className="side-tree-leaf-ico">{it.ico}</span>}
                className={`side-tree-leaf${view === it.id ? " is-active" : ""}`}
              >
                <span className="side-tree-leaf-lab">{t(it.label)}</span>
                {it.badge ? <span className="n-badge side-tree-badge">{it.badge}</span> : null}
              </File>
            ))}
          </TreeFolder>
        );
      })}
    </Tree>
  );
}
