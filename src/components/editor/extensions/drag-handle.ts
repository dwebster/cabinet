import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Move the top-level block containing the current selection up or down
 * by one sibling. Returns true if the doc was mutated. Used for keyboard
 * reorder (Alt+Shift+Up/Down) so non-mouse users get parity with the
 * drag handle (audit #102).
 */
function moveCurrentBlock(
  state: EditorView["state"],
  dispatch: ((tr: Transaction) => void) | undefined,
  direction: "up" | "down"
): boolean {
  const { selection, doc } = state;
  // Resolve the top-level block that holds the current selection. We walk
  // up to depth 1 because doc → top-level-block → … is the layout we care
  // about; nested list items still move as siblings of their parent block.
  let $pos = doc.resolve(selection.from);
  while ($pos.depth > 1) {
    $pos = doc.resolve($pos.before($pos.depth));
  }
  if ($pos.depth === 0) return false;

  const blockPos = $pos.before(1);
  const block = doc.nodeAt(blockPos);
  if (!block) return false;

  const parent = doc;
  const indexInParent = $pos.index(0);
  const siblingIndex = direction === "up" ? indexInParent - 1 : indexInParent + 1;
  if (siblingIndex < 0 || siblingIndex >= parent.childCount) return false;

  const sibling = parent.child(siblingIndex);
  let tr = state.tr;

  // Remove the block, then re-insert it on the other side of the sibling.
  // Computing the insertion target *before* the cut keeps positions stable.
  const blockEnd = blockPos + block.nodeSize;
  const siblingStart = direction === "up" ? blockPos - sibling.nodeSize : blockEnd;
  const siblingEnd = direction === "up" ? blockPos : blockEnd + sibling.nodeSize;

  if (direction === "up") {
    tr = tr.delete(blockPos, blockEnd);
    tr = tr.insert(siblingStart, block);
    // After re-insert the block lives at siblingStart; restore selection on it.
    tr = tr.setSelection(NodeSelection.create(tr.doc, siblingStart));
  } else {
    tr = tr.delete(blockPos, blockEnd);
    // After deletion the sibling shifts left by block.nodeSize, so the
    // insertion target is siblingEnd - block.nodeSize.
    const insertAt = siblingEnd - block.nodeSize;
    tr = tr.insert(insertAt, block);
    tr = tr.setSelection(NodeSelection.create(tr.doc, insertAt));
  }

  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

const HANDLE_ID = "cabinet-drag-handle";

function findBlockAt(view: EditorView, coords: { left: number; top: number }) {
  const pos = view.posAtCoords(coords);
  if (!pos) return null;
  let $pos = view.state.doc.resolve(pos.inside >= 0 ? pos.inside : pos.pos);
  while ($pos.depth > 0 && !$pos.parent.type.isBlock) {
    $pos = view.state.doc.resolve($pos.before());
  }
  // Walk up until we find a top-level child of the doc
  let depth = $pos.depth;
  while (depth > 1) {
    const parent = view.state.doc.resolve($pos.before(depth)).parent;
    if (parent.type.name === "doc") break;
    depth -= 1;
  }
  const nodePos = depth === 0 ? 0 : $pos.before(Math.max(depth, 1));
  const node = view.state.doc.nodeAt(nodePos);
  if (!node) return null;
  const dom = view.nodeDOM(nodePos) as HTMLElement | null;
  return { pos: nodePos, node, dom };
}

function getOrCreateHandle(): HTMLDivElement {
  let el = document.getElementById(HANDLE_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = HANDLE_ID;
    el.setAttribute("data-drag-handle", "true");
    el.draggable = true;
    el.innerHTML = `<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="2.5" cy="3" r="1.2"/><circle cx="2.5" cy="8" r="1.2"/><circle cx="2.5" cy="13" r="1.2"/><circle cx="7.5" cy="3" r="1.2"/><circle cx="7.5" cy="8" r="1.2"/><circle cx="7.5" cy="13" r="1.2"/></svg>`;
    Object.assign(el.style, {
      position: "absolute",
      display: "none",
      cursor: "grab",
      padding: "2px 4px",
      borderRadius: "4px",
      color: "var(--muted-foreground)",
      opacity: "0.55",
      zIndex: "40",
      userSelect: "none",
      transition: "opacity 120ms ease",
    } as CSSStyleDeclaration);
    el.addEventListener("mouseenter", () => (el!.style.opacity = "1"));
    el.addEventListener("mouseleave", () => (el!.style.opacity = "0.55"));
    document.body.appendChild(el);
  }
  return el;
}

export const DragHandle = Extension.create({
  name: "dragHandle",

  addKeyboardShortcuts() {
    // Audit #102: drag handle is mouse-only. Add Alt+Shift+ArrowUp /
    // Alt+Shift+ArrowDown so keyboard users can reorder blocks too.
    return {
      "Mod-Alt-ArrowUp": ({ editor }) =>
        moveCurrentBlock(editor.state, editor.view.dispatch, "up"),
      "Mod-Alt-ArrowDown": ({ editor }) =>
        moveCurrentBlock(editor.state, editor.view.dispatch, "down"),
      "Alt-Shift-ArrowUp": ({ editor }) =>
        moveCurrentBlock(editor.state, editor.view.dispatch, "up"),
      "Alt-Shift-ArrowDown": ({ editor }) =>
        moveCurrentBlock(editor.state, editor.view.dispatch, "down"),
    };
  },

  addProseMirrorPlugins() {
    let currentBlock: { pos: number; node: { nodeSize: number }; dom: HTMLElement } | null = null;

    const handle = typeof document !== "undefined" ? getOrCreateHandle() : null;

    const hide = () => {
      if (handle) handle.style.display = "none";
      currentBlock = null;
    };

    return [
      new Plugin({
        key: new PluginKey("cabinetDragHandle"),
        view: (view) => {
          if (!handle) return { destroy: () => {} };

          const onMouseMove = (event: MouseEvent) => {
            if (!view.editable) return;
            const rect = view.dom.getBoundingClientRect();
            if (
              event.clientX < rect.left - 60 ||
              event.clientX > rect.right + 60 ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            ) {
              hide();
              return;
            }
            // Probe inside the editor with clientX clamped to content
            const probeX = Math.max(rect.left + 20, Math.min(rect.right - 20, event.clientX));
            const block = findBlockAt(view, { left: probeX, top: event.clientY });
            if (!block || !block.dom || !(block.dom instanceof HTMLElement)) {
              hide();
              return;
            }
            currentBlock = block as typeof currentBlock;
            const domRect = block.dom.getBoundingClientRect();
            handle.style.display = "flex";
            handle.style.top = `${window.scrollY + domRect.top + 4}px`;
            handle.style.left = `${window.scrollX + domRect.left - 22}px`;
          };

          const onMouseLeave = () => hide();

          const onDragStart = (event: DragEvent) => {
            if (!currentBlock || !event.dataTransfer) return;
            const { pos, dom } = currentBlock;

            // Select the block so PM treats it as the drag source
            const tr = view.state.tr.setSelection(
              NodeSelection.create(view.state.doc, pos)
            );
            view.dispatch(tr);

            const slice = view.state.selection.content();
            // Serialize slice content to HTML for external drop targets
            const tmp = document.createElement("div");
            tmp.appendChild(
              view.someProp("clipboardSerializer")?.serializeFragment(slice.content) ??
                document.createElement("div")
            );
            event.dataTransfer.clearData();
            event.dataTransfer.setData("text/html", tmp.innerHTML);
            event.dataTransfer.setData("text/plain", dom.textContent ?? "");
            event.dataTransfer.effectAllowed = "copyMove";
            event.dataTransfer.setDragImage(dom, 0, 0);

            // Hand PM the slice so its built-in drop handler performs the move
            view.dragging = { slice, move: true };
          };

          window.addEventListener("mousemove", onMouseMove);
          view.dom.addEventListener("mouseleave", onMouseLeave);
          handle.addEventListener("dragstart", onDragStart);

          return {
            destroy() {
              window.removeEventListener("mousemove", onMouseMove);
              view.dom.removeEventListener("mouseleave", onMouseLeave);
              handle.removeEventListener("dragstart", onDragStart);
              hide();
            },
          };
        },
      }),
    ];
  },
});
